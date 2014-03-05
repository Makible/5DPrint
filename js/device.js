const SPTDELAY = 1500;
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
    this.nextidx    = -1;
    this.prevcmd    = undefined;
}

Job.prototype.processNext = function() {
    fdp.device.runAtIdx(this.nextidx);
};

function Position() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.e = 0;
}

function Device(port) {
    this.path           = port.path;
    this.vendorId       = port.vendorId;
    this.productId      = port.productId;
    this.connection     = null;
    this.e              = 0;    //  extruder temp
    this.b              = 0;    //  bed temp
    this.pos            = new Position();
    this.job            = new Job();
    this.statPollTimer  = -1;
    this.hardStop       = 0;
    this.callbacks      = {};
}

Device.prototype.connect = function() {
    serial.connect(this.path, {}, function(info) {
        //  set connectionId in background launcher.js to trigger a serial.disconnect
        //  once the window closes for a bit of cleanup
        launcher.connection = info.connectionId;

        fdp.device.connection = info;
        fdp.device.send(commands.FMWARE_INFO);
    });
};

Device.prototype.send = function(msg, callback) {
    if(fdp.device.connection === null) {
        //  TODO ::
        //  trigger notification, cleanup and reset timer
        console.log('Device not connected');
    }

    var cb = function(sendInfo) {
        if(sendInfo.error) {
            if(dbg) {
                notify({ title: 'DEBUG - device', message: 'device.send:\n' });
                notify({ title: 'DEBUG - device', message: 'error: ' + sendInfo.error });
                }
            console.log('device.send error: ' + sendInfo.error);
        }
    };

    serial.send(fdp.device.connection.connectionId, util.str2ab(msg), (callback) ? callback : cb);
};

Device.prototype.destroy = function(callback) {
    if(dbg)
        console.log('destroy has been called...');

    chrome.power.releaseKeepAwake();

    this.hardStop = !0; //  force-stop any jobs for this device
    this.flush();
    this.disconnect();

    ui.detachDevice();
};

Device.prototype.flush = function() {
    serial.flush(this.connection.connectionId, function(info){});
};

Device.prototype.disconnect = function() {
    serial.disconnect(this.connection.connectionId, function(info) {
        notify({ title: "Device Detached", message: this.path + " has been detached" });
    });
};

Device.prototype.getFullStats = function() {
    var device = this,
        result = '';

    var get = function(idx) {
        device.send(commands.GET_FSTATS[idx], function(sendInfo) {
            if(sendInfo.error) {
                if(dbg)
                    notify({ title: 'DEBUG - device.getFullStats', message: 'sendInfo.error: ' + sendInfo.error });
                device.destroy();
            } else {
                if(++idx < commands.GET_FSTATS.length)
                    get(idx);
            }
        });
    };
    get(0);
};

Device.prototype.setTemp = function(temp) {
    var _cmd = ((temp.Name === 'e') ? commands.SET_EXTEMP : commands.SET_BDTEMP) + temp.Value;
    this.send(_cmd + CMD_TERMINATOR);
};

Device.prototype.updateDeviceStats = function(stats) {
    var val, temp, pos, axs;

    var pf = '-- C:',
        ah = '-- Axes Homed',
        rows = stats.split('\n');

    for(var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if(row.indexOf('T:') > -1 && row.indexOf('B:') > -1) {
            temp = row.split(' ');
            continue;
        }

        if(row.indexOf(pf) > -1) {
            pos = row.substring(row.indexOf(pf) + pf.length + 1).split(' ');
            continue;
        }

        if(row.indexOf(ah) > -1) {
            axs = row.substring(row.indexOf(ah) + ah.length + 1).split(' ');
            continue
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

    if(axs && axs !== undefined) {
        for(var l = 0; l < axs.length; l++) {
            var a = axs[l].split(':')[0],
                v = axs[l].split(':')[1];

            var name = 'home' + a.toUpperCase() + 'Btn';
            if(ui.pa[name].classList.contains('not-homed') && v == 1)
                ui.pa[name].classList.remove('not-homed');

            if(!ui.pa[name].classList.contains('not-homed') && v == 0)
                ui.pa[name].classList.add('not-homed');
        }
    }

    ui.updateStats(stats);
};

Device.prototype.sendMovement = function(mv) {
    var _cmd = commands.MOVE;
    if(mv.Axis.indexOf(',') > -1) {
        var axes  = mv.Axis.split(','),
            dists = mv.Distance.split(',');

        _cmd += ' ' + axes[0] + dists[0];
        _cmd += ' ' + axes[1] + dists[1];
        _cmd += ' F' + mv.Speed + CMD_TERMINATOR;
    } else
        _cmd += ' ' + ((mv.Axis == 'e') ? 'E1' : mv.Axis.toUpperCase())
            + mv.Distance + ' F' + mv.Speed + CMD_TERMINATOR;
    this.send(_cmd);
};

Device.prototype.home = function(axis) {
    var _cmd  = commands.HOME,
        _axis = axis.toLowerCase();

    if(_axis === 'all') {
        this.pos.x = 0;
        this.pos.y = 0;
        this.pos.z = 0;
    } else {
        _cmd += ' ' + _axis.toUpperCase() + '0';
        this.pos[_axis] = 0;
    }

    console.log(_cmd);
    this.send(_cmd + CMD_TERMINATOR);
};

Device.prototype.console = function(input, callback) {
    var cmd = (NATURALS[input] !== undefined) ? NATURALS[input] : input;
    if(cmd.indexOf(CMD_TERMINATOR) < 0)
        cmd += CMD_TERMINATOR;
    this.send(cmd);
};

Device.prototype.pause = function() {
    var device = this;

    device.job.paused = new Date().getTime();
    device.write(commands.JOB_PAUSE, function(w) {
        if(w.bytesWritten < 0) {
            if(dbg)
                notify({ title: 'DEBUG - device.destroy', message: 'runAtIdx: calling destroy' });
            device.destroy();
        } else
            device.statPollTimer = window.setInterval(function() { device.getTemp(); }, SPTDELAY);
    });
    notify({
        title: "Paused",
        message: "Click PLAY to continue or RESET to start fresh"
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
        device.send(commands.JOB_PAUSE);

        notify({
            title: "Paused",
            message: "Click the PLAY button to continue or the RESET button to prep for a new print"
        });
        return;
    }

    ui.updateProgress(((idx - 1) * 100) / device.job.content.length);

    //  this should mean the job is done and a bit of housekeeping needs to happen
    if(idx >= device.job.content.length || device.job.content[idx] === undefined) {
        device.job.end = new Date().getTime();
        device.job.status = 'complete';

        ui.resetWithContent();

        var diff, hh, mm;
        diff = parseFloat(((device.job.end - device.job.start) / 3600000).toFixed(2));
        hh   = parseInt(diff, 10);
        mm   = parseInt(parseFloat((diff -= hh).toFixed(2), 10) * 60, 10);

        //  TODO ::
        //  include pause duration in msg
        msg = 'Print Time [hh:mm] ' + hh + ':' + mm + '\n\nyour system has now '
            + 'returned to the normal power settings';

        chrome.power.releaseKeepAwake();
        notify({ title: "Print Complete", message: msg });
        return;
    }

    //  if we get to this point, then generally this means that no "stopping"
    //  process has occured and we should just push over a print cmd from file
    var cmd = device.job.content[idx].trim();
    device.job.nextidx = ++idx; 

    if(cmd.indexOf(';') === 0 || cmd.length < 1)
        device.runAtIdx(idx);
    else {
        device.job.prevcmd = cmd;

        if(cmd.indexOf(CMD_TERMINATOR) < 0) 
            cmd += CMD_TERMINATOR;

        device.send(cmd);
    }
};