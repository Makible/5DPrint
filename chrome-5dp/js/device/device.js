const serial = chrome.serial;
const HEISS  = "// *** Hot-end heater does not appear to be responding";

var devices, active, devicePollTimer, connTimer;

function Job() {
    this.status   = 'empty';
    this.filename = '';
    this.content  = '';
}

function Device(name) {
    this.name           = name;
    this.conn           = -1;
    this.e              = 0;    //  extruder temp
    this.b              = 0;    //  bed temp
    this.job            = new Job();
    this.statPollTimer  = -1;
    this.callbacks      = {};
}

Device.prototype.connect = function(callback) {
    serial.open(this.name, this.onopen.bind(this));
    this.callbacks.connect = callback;
};

Device.prototype.onopen = function(info) {
    this.conn = info.connectionId;
    //  
    //  TODO ::
    //  chrome notification of device connection

    if(this.callbacks.connect)
        this.callbacks.connect();
};

Device.prototype.read = function(callback) {
    if(this.conn < 0) 
        throw 'Device not connected';

    serial.read(this.conn, 255, this.onread.bind(this));
    this.callbacks.read = callback;
};

Device.prototype.onread = function(info) {
    if(this.callbacks.read)
        this.callbacks.read(info);
};

Device.prototype.readall = function(callback) {
    var result = '';
    var _read = function(info) {
        var data;

        data = this.ab2str(info.data);
        result += data;

        if(data.indexOf('rs') === 0)
            throw 'Device requested a resend';

        if(data.indexOf(HEISS) > -1) {
            //  
            //  TODO ::
            //  warn user of hot-end issue
            //  via chrome notification
        }

        if(data.indexOf('ok') > -1) {
            callback(result);
            result = '';
            return;
        }

        if(data.indexOf('T:') > -1 && data.indexOf('B:') > -1)
            active.updateStats(data);

        this.read(_read);
    }.bind(this);
    this.read(_read);
};

Device.prototype.write = function(msg, callback) {
    if(this.conn < 0)
        throw 'Device not connected';

    this.callbacks.write = callback;
    this.str2ab(msg, function(buf) {
        serial.write(this.conn, buf, this.onwrite.bind(this));
    }.bind(this));
};

Device.prototype.onwrite = function(info) {
    if(this.callbacks.write)
        this.callbacks.write(info);
};

Device.prototype.close = function(callback) {
    if(this.statPollTimer > -1) 
        window.clearInterval(this.statPollTimer);

    serial.flush(this.conn, function(info) { });
    serial.close(this.conn, function(info) {
        console.log(this.name + ' is now closed');

        delete devices[this.name];  //  remove device from list

        //
        //  TODO ::
        //  chrome notification of closure
    });
};

Device.prototype.ab2str = function(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
};

Device.prototype.str2ab = function(str, callback) {
    var buf = new ArrayBuffer(str.length),
        bw  = new Uint8Array(buf);

    for(var i = 0; i < str.length; i++)
        bw[i] = str.charCodeAt(i);

    callback(buf);
};

Device.prototype.getFullStats = function() {
    var _d = this, result = '';

    // 
    //  oh now... this won't cause any issues down the road /s
    var get = function(idx) {
        _d.write(cmd.GET_FSTATS[idx], function() { });
        _d.readall(function(data) {
            result += data;
            idx++;

            if(idx < cmd.GET_FSTATS.length)
                get(idx);
            else {
                updateConsoleOutput(data);
                _d.updateStats('--FULL STATS\n'+result);
                _d.statPollTimer = window.setInterval(pollTemp, 800);
            }
        });
    };
    get(0);
};

Device.prototype.getTemp = function() {
    var _d = this;

    _d.write(cmd.GET_TEMP, function(writer) {});
    _d.readall(function(data) { 
        updateConsoleOutput(data);
        _d.updateStats(data); 
    });
};

Device.prototype.setTemp = function(temp) {
    var _cmd = ((temp.Name == 'e') ? cmd.SET_EXTEMP : cmd.SET_BDTEMP) + temp.Value;

    console.log(_cmd);
    this.write(_cmd, function() { });
    this.readall(updateConsoleOutput);
};

Device.prototype.updateStats = function(stats) {
    var val, rows, temp;
    rows = stats.split('\n');

    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('T:') > -1 && rows[i].indexOf('B:') > -1) {
            temp = rows[i].split(' ');
            continue;
        }
    }

    if(temp && temp != undefined) {
        for(var i = 0; i < temp.length; i++) {
            if(temp[i].indexOf('T') > -1) {
                this.ETemp = temp[i].split(':')[1];
                continue;
            }

            if(temp[i].indexOf('B') > -1) {
                this.BTemp = temp[i].split(':')[1];
                continue;
            }
        }
    }

    updateStatsUI(stats);
};

Device.prototype.sendMovement = function(mv) {
    var _cmd = cmd.MOVE;
    if(mv.Axis.indexOf(',') > -1) {
        var axes  = mv.Axis.split(','),
            dists = mv.Distance.split(',');

        _cmd += ' ' + axes[0] + dists[0];
        _cmd += ' ' + axes[1] + dists[1];
        _cmd += ' F' + mv.Speed + CMD_TERMINATOR;
    } else 
        _cmd += ' ' + mv.Axis + mv.Distance + ' F' + mv.Speed + CMD_TERMINATOR;

    this.write(_cmd, function() { });
    this.readall(function(data) { updateConsoleOutput(data); });
};

Device.prototype.home = function(axis) {
    var _cmd = cmd.HOME;
    if(axis.toLowerCase() != 'all')
        _cmd += ' ' + axis.toUpperCase() + '0';

    _cmd += CMD_TERMINATOR;
    this.write(_cmd, function() { });
    this.readall(updateConsoleOutput);
};

Device.prototype.manual = function(input, callback) {
    if(input.indexOf(CMD_TERMINATOR) < 0)
        input += CMD_TERMINATOR;
    this.write(input, function() { });
    this.readall(callback);
};

Device.prototype.startPendingJob = function() {
    window.clearInterval(active.statPollTimer);

    var idx = 0;
    var _send = function() {
        var _cmd = active.job.content[idx].trim();
        idx++;

        // console.log('sending cmd: ' + _cmd);
        if(_cmd.indexOf(';') != 0 && _cmd.length > 1) {
            active.write(_cmd + CMD_TERMINATOR, function() { });
            active.readall(function(data) {
                // console.log(data);
                updateConsoleOutput(data);

                if(idx < active.job.content.length)
                    _send();

                //  TODO ::
                //  update the UI with the movement
            });
        } else
            _send();

    };
    _send();
};

var pollSerialDevices = function() {
    if(devicePollTimer !== undefined)
        window.clearInterval(devicePollTimer);

    if(devices === undefined) 
        devices = {};

    //  pulls the list of devices according to the prefix
    //  and attempts to open and set the device if it is
    //  indeed a 5dprint compatable device (i.e. MakiBox A6)
    var get = function(ports) {
        for(var i=0; i < ports.length; i++) {
            if(ports[i].indexOf(serialPrefix) > -1 && devices[ports[i]] === undefined) {
                dev = new Device(ports[i]);
                dev.connect(function() {
                    devices[dev.name] = dev;
                    attachDeviceToInterface(dev);
                    dev.getFullStats();
                });
            }
        }
    };
    connTimer = window.setInterval(function() { serial.getPorts(get); }, 2000);
};

var pollTemp = function() { active.getTemp(); };
