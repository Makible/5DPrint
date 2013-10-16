const serial = chrome.serial;
const HEISS  = "// *** Hot-end heater does not appear to be responding";

var devices, active, devicePollTimer, connTimer;

function Job() {
    this.status     = 'empty';
    this.filename   = '';
    this.content    = '';
    this.starttime  = undefined;
    this.endtime    = undefined;
    this.pausedur   = undefined;
}

function Device(name) {
    this.name           = name;
    this.conn           = -1;
    this.e              = 0;    //  extruder temp
    this.b              = 0;    //  bed temp
    this.job            = new Job();
    this.statPollTimer  = -1;
    this.hardStop       = 0;
    this.callbacks      = {};
}

Device.prototype.connect = function(callback) {
    serial.open(this.name, this.onopen.bind(this));
    this.callbacks.connect = callback;
};

Device.prototype.onopen = function(info) {
    notify({ title: "Device Attached", message: this.name + " has been attached" });
    this.conn = info.connectionId;
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

        if(data.indexOf(HEISS) > -1) 
            notify({ title: "WARNING", message: data });

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

Device.prototype.destroy = function(callback) {
    var _device = this;
    if(_device.statPollTimer > -1) 
        window.clearInterval(_device.statPollTimer);

    _device.hardStop = !0; //  force-stop any jobs for this device
    detachDeviceFromUI(_device.name);
    chrome.power.releaseKeepAwake();

    serial.flush(_device.conn, function(info) { });
    serial.close(_device.conn, function(info) {
        delete devices[_device.name];  //  remove device from list
        notify({ title: "Device Detached", message: _device.name + " has been detached" });
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
    var _d     = this, 
        result = '';

    //  oh now... this won't cause any issues down the road /s
    var get = function(idx) {
        _d.write(cmd.GET_FSTATS[idx], function(w) {
            if(w.bytesWritten < 0)
                _d.destroy();
            else {
                _d.readall(function(data) {
                    result += data;
                    idx++;

                    if(idx < cmd.GET_FSTATS.length)
                        get(idx);
                    else {
                        updateConsoleOutput(data);
                        _d.updateStats('--FULL STATS\n'+result);
                        _d.statPollTimer = window.setInterval(function() { _d.getTemp(); }, 800);
                    }
                });
            }
        });
        
    };
    get(0);
};

Device.prototype.getTemp = function() {
    var _d = this;

    _d.write(cmd.GET_TEMP, function(w) {
        if(w.bytesWritten < 0)
            _d.destroy();
        else {
            _d.readall(function(data) { 
                updateConsoleOutput(data);
                _d.updateStats(data); 
            });
        }
    });
};

Device.prototype.setTemp = function(temp) {
    var _d   = this, 
        _cmd = ((temp.Name == 'e') ? cmd.SET_EXTEMP : cmd.SET_BDTEMP) + temp.Value;

    _d.write(_cmd, function(w) { 
        (w.bytesWritten < 0) ? _d.destroy() : _d.readall(updateConsoleOutput);
    });
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

    var _d = this;
    _d.write(_cmd, function(w) {
        if(w.bytesWritten < 0)
            _d.destroy();
        else
            _d.readall(updateConsoleOutput);
    });
};

Device.prototype.home = function(axis) {
    var _cmd = cmd.HOME;
    if(axis.toLowerCase() != 'all')
        _cmd += ' ' + axis.toUpperCase() + '0';

    _cmd += CMD_TERMINATOR;

    var _d = this;
    _d.write(_cmd, function(w) {
        (w.bytesWritten < 0) ? _d.destroy() : _d.readall(updateConsoleOutput);
    });
};

Device.prototype.console = function(input, callback) {
    var _cmd = (NATURALS[input] != undefined) ? NATURALS[input] : input;

    if(_cmd.indexOf(CMD_TERMINATOR) < 0)
        _cmd += CMD_TERMINATOR;

    var _d = this;
    _d.write(_cmd, function(w) { 
        (w.bytesWritten < 0) ? _d.destroy() : _d.readall(updateConsoleOutput);
    });
};

Device.prototype.startPendingJob = function() {
    window.clearInterval(this.statPollTimer);
    chrome.power.requestKeepAwake('system');
    var msg = 'NOTE: during the print, your display may go'
        + ' sleep (depending on your OS settings) but your system'
        + ' will not. Once the print is complete, your system will'
        + ' return to the normal settings';
    notify({ title: "Starting Print", message: msg });

    var idx = 0,
        _d = this;

    _d.job.starttime = new Date().getTime();
    var _process = function() {
        if(_d.hardStop) return;

        if(idx >= _d.job.connected.length) {
            //  clean up after print
            _d.job.endtime = new Date().getTime();
            _d.job.status = 'complete';

            resetPrintUI();

            //  TODO ::
            //  notify time to complete

            chrome.power.releaseKeepAwake();
            notify({ title: "Completed Print", message: "your system is now at the normal power settings" });
            return;
        }

        var _cmd = _d.job.content[idx].trim();
        idx++;

        if(_cmd.indexOf(';') != 0 && _cmd.length > 1) {
            updatePrintUI(_cmd);

            if(_cmd.indexOf(CMD_TERMINATOR) < 0) 
                _cmd += CMD_TERMINATOR

            _d.write(_cmd, function(w) { if(w.bytesWritten < 0) _d.destroy(); });
            _d.readall(function(data) {
                updateConsoleOutput(data);
                _process();
            });
        } else
            _process();
    };
    _process();
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