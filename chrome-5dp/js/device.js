const SPTDELAY = 1500;
const serial = chrome.serial;
const HEISS  = "// *** Hot-end heater does not appear to be responding";

var devices, active, devicePollTimer, connTimer;

function Job() {
    this.status     = 'empty';
    this.filename   = '';
    this.content    = '';
    this.start      = undefined;
    this.end        = undefined;
    this.pause      = undefined;
    this.pauseddur  = 0;
    this.pausedidx  = -1;
}

function Position() {
    this.z = 0;
    this.e = 0;
}

function Device(name) {
    this.name           = name;
    this.conn           = -1;
    this.e              = 0;    //  extruder temp
    this.b              = 0;    //  bed temp
    this.pos            = new Position();
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
    var device = this;

    device.conn = info.connectionId;

    device.write(cmd.FMWARE_INFO, function() {});
    device.readall(function(info) {
        if(info.toLowerCase().indexOf(MKB_FLAG.toLowerCase()) > -1 && device.callbacks.connect)
            device.callbacks.connect(device, !0);
        else
            device.callbacks.connect(device, 0);
    });
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

        if(dbg && result.length > 1) 
            console.log(result);

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
            active.updateDeviceStats(data);

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
                        ui.updateConsole(data);
                        _d.updateDeviceStats('--FULL STATS\n'+result);
                        _d.statPollTimer = window.setInterval(function() { _d.getTemp(); }, SPTDELAY);
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
                ui.updateConsole(data);
                _d.updateDeviceStats(data); 
            });
        }
    });
};

Device.prototype.setTemp = function(temp) {
    var _d   = this, 
        _cmd = ((temp.Name == 'e') ? cmd.SET_EXTEMP : cmd.SET_BDTEMP) + temp.Value;

    _cmd += CMD_TERMINATOR;
    _d.write(_cmd, function(w) { 
        if(w.bytesWritten < 0) 
            _d.destroy();
        else
        _d.readall(ui.updateConsole);
    });
};

Device.prototype.updateDeviceStats = function(stats) {
    var val, rows, temp, pos, pf = '-- C:';
    rows = stats.split('\n');

    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('T:') > -1 && rows[i].indexOf('B:') > -1) {
            temp = rows[i].split(' ');
            continue;
        }

        if(rows[i].indexOf(pf) > -1) {
            pos = rows[i].substring(rows[i].indexOf(pf) + pf.length + 1).split(' ');
            continue;
        }
    }

    if(temp && temp !== undefined) {
        for(var j = 0; j < temp.length; j++) {
            if(temp[j].indexOf('T') > -1) {
                this.ETemp = temp[j].split(':')[1];
                continue;
            }

            if(temp[j].indexOf('B') > -1) {
                this.BTemp = temp[j].split(':')[1];
                continue;
            }
        }
    }

    if(pos && pos !== undefined) {
        for(var k = 0; k < pos.length; k++) {
            if(pos[k].indexOf(':') == -1) continue;

            var c = pos[k].split(':'),
                p = util.millimeterToPixel(c[1]);

            if(c[0].toLowerCase() == 'e') this.pos.e = parseFloat(p);
            if(c[0].toLowerCase() == 'z') this.pos.z = parseFloat(p);
        }
    }

    ui.updateStats(stats);
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
        _cmd += ' ' + ((mv.Axis == 'e') ? 'E1' : mv.Axis.toUpperCase()) 
            + mv.Distance + ' F' + mv.Speed + CMD_TERMINATOR;
    this.sendStdCmd(_cmd);
};

Device.prototype.home = function(axis) {
    var _cmd = cmd.HOME;
    if(axis.toLowerCase() != 'all')
        _cmd += ' ' + axis.toUpperCase() + '0';

    if(axis.toLowerCase() == 'z' || 'all') 
        this.pos.z = 0;
    this.sendStdCmd(_cmd + CMD_TERMINATOR); 
};

Device.prototype.console = function(input, callback) {
    var _cmd = (NATURALS[input] !== undefined) ? NATURALS[input] : input;

    if(_cmd.indexOf(CMD_TERMINATOR) < 0)
        _cmd += CMD_TERMINATOR;
    this.sendStdCmd(_cmd);
};

Device.prototype.startPendingJob = function() {
    window.clearInterval(this.statPollTimer);
    this.statPollTimer = -1;
    chrome.power.requestKeepAwake('system');

    var idx = 0,
        _d = this,
        msg = 'The warming process can take some time. Please be patient.'
            + ' During the print, your display may go to sleep (depending'
            + ' on your OS settings) though your system will not. Once'
            + ' the print is complete, your system will resume using the'
            + ' OS settings previously set.';
    notify({ title: "Starting Print", message: msg });


    _d.job.start = new Date().getTime();
    _d.runAtIdx(idx);
};

Device.prototype.resumeJob = function() {
    var _d = this;
    _d.write(cmd.JOB_RESUME, function(w) {
        notify({
            title:   'Resuming Print',
            message: 'Please wait. This may take a moment.'
        });

        _d.job.pauseddur += (new Date().getTime()) - _d.job.paused;
        _d.runAtIdx(_d.job.pausedidx);
    });
};

Device.prototype.resetJob = function() {
    var destroy = this;
    destroy.write(cmd.JOB_ABDN, function(w) {
        if(w.bytesWritten > 0)
            notify({ title:   'PRINT ABANDONED', message: '' });
        else
            device.destroy();
    });
};

Device.prototype.sendStdCmd = function(val) {
    //  do this so that we don't overload the MCU
    //  during long moves, such as a Z home from 
    //  farthest position
    window.clearInterval(this.statPollTimer);
    this.statPollTimer = -1;

    if(dbg)
        console.log('statPollTimer cleared');

    var device = this;
    device.write(val, function(w) { 
        if(w.bytesWritten < 0) 
            device.destroy();
        else {
            device.readall(function(info) {
                ui.updateConsole(info);
                device.statPollTimer = window.setInterval(function() { device.getTemp(); }, SPTDELAY);

                if(dbg)
                    console.log('statPollTimer restarted');
            });
        }
    });
};

Device.prototype.runAtIdx = function(idx) {
    var device = this;
    if(device.hardStop) {
        device.hardStop = 0;
        return;
    }

    if(device.job.status == 'paused') {
        device.job.pausedidx = idx;
        device.job.paused = new Date().getTime();

        device.write(cmd.JOB_PAUSE, function(w) { 
            if(w.bytesWritten < 0) 
                device.destroy();
            else
                device.statPollTimer = window.setInterval(function() { device.getTemp(); }, SPTDELAY);
        });
        notify({ 
            title: "Paused", 
            message: "Click PLAY to continue or RESET to start fresh" 
        });
        return;
    }

    //  clean this up after a pause/resume
    if(device.statPollTimer > -1) {
        window.clearInterval(device.statPollTimer);
        device.statPollTimer = -1;
    }

    var per = ((idx - 1) * 100) / device.job.content.length;
    updateProgressBar(per);
    
    //  this should mean the job is done and
    //  housekeeping needs to happen 
    if(idx >= device.job.content.length || 
        device.job.content[idx] === undefined) {

        //  clean up after print
        device.job.end = new Date().getTime();
        device.job.status = 'complete';
        device.statPollTimer = window.setInterval(function() { device.getTemp(); }, SPTDELAY);

        resetPrintUI();

        var diff, hh, mm;
        diff = parseFloat(((device.job.end - device.job.start) / 3600000).toFixed(2));
        hh = parseInt(diff, 10);
        mm = parseInt(parseFloat((diff -= hh).toFixed(2), 10) * 60, 10);

        //  TODO ::
        //  include pause duration in msg
        msg = 'Print Time [hh:mm] ' + hh + ':' + mm
            + '\n\nyour system has now returned to the'
            + ' normal power settings'; 

        chrome.power.releaseKeepAwake();
        notify({ 
            title: "Print Complete", 
            message: msg
        });
        return;
    }

    var _cmd = device.job.content[idx].trim();
    idx++;

    //  we may get into a bit of a race issue with
    //  the callbacks and a pause ....
    if(_cmd.indexOf(';') === 0 || _cmd.length <= 1)
        device.runAtIdx(idx);
    else {
        if(device.name == active.name)
            updatePrintUI(_cmd);
        
        if(_cmd.indexOf(CMD_TERMINATOR) < 0) 
            _cmd += CMD_TERMINATOR;

        //  tag a temp request on to each cmd
        //  
        //  WARNING: this could cause some jumps in the job
        //  execution on the device if the temp request takes 
        //  an extended amount of time to perform
        _cmd += cmd.GET_TEMP;
        device.write(_cmd, function(w) { 
            if(w.bytesWritten < 0) 
                device.destroy();
            else {
                device.readall(function(data) {
                    device.updateDeviceStats(data);
                    device.runAtIdx(idx);
                });
            }
        });
    }
};

