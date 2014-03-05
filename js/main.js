const serial = chrome.serial;

var dbg, notifyId, launcher;

var fdp = {
    device: undefined,
    devicePollTimer: undefined,
    connTimer: -1,

    //  WARNING::
    //  currently only listening for MakiBox devices though this could change 
    //  in the future as device support increases
    initDevicePolling: function() {
        if(this.device !== undefined) return;

        //  pulls the list of devices according to the prefix and attempts to 
        //  open and set the device if it is indeed a 5dprint compatable device
        this.connTimer = window.setInterval(function() {
            serial.getDevices(function(ports) {
                for(var i=0; i < ports.length; i++) {
                    var port = ports[i];
                    if(port.path.indexOf(util.serialPrefix) > -1) {
                        //  disable timer since we only want one device
                        window.clearInterval(fdp.connTimer);
                        fdp.connTimer = -1;

                        fdp.device = new Device(port);
                        fdp.device.connect();

                        return;
                    }
                }
            });
        }, 1200);
    }
};

//  generic notifications wrapper using the Chrome API
var notify = function(conf) {
    conf.type    = 'basic';
    conf.iconUrl = NOTIFY_ICON;
    chrome.notifications.create(conf.title.replace(/\s/g, '_') + (notifyId++), conf, function(info) {});
};

//  entry point here, because we need OS info in order to proceed
chrome.runtime.getPlatformInfo(function(info) {
    dbg = notifyId = 0;

    ui.init();
    if(typeof util[info.os] !== 'function') {
        notify({
            title: "Unsupported OS",
            message: "Unfortunately, your OS is not supported at this time."
        });
        return;
    } else
        util[info.os]();

    chrome.runtime.getBackgroundPage(function(bg) {
        launcher = bg.window;
        fdp.initDevicePolling();
    });

    //  DEBUG
    dbg=!0;
});

chrome.serial.onReceive.addListener(function(info) {
    if(info.data) {
        var data = util.ab2str(info.data);

        if(data.indexOf('rs') === 0) {
            if(dbg)
                notify({ title: 'Resend Requested', message: 'Device requested a resend' });

            console.log('Device requested a resend');
            console.log(data);

            return;
        }

        if(data.indexOf(HEISS) > -1) {
            notify({ title: 'WARNING', message: data });
            return;
        }

        if(data.indexOf('T:') > -1 && data.indexOf('B:') > -1 && data.indexOf('ok') === -1)
            fdp.device.updateDeviceStats(data);

        if(data.indexOf('ok') > -1) {
            if(data.indexOf(commands.FMWARE_INFO.replace('\r\n', '')) > -1 && ui.adnameEl.classList.contains('no-device')) {
                //  should indicate new connection
                notify({ title: 'Device Attached', message: fdp.device.path + ' attached' });
                ui.attachDevice();

                fdp.device.getFullStats();
                fdp.device.send(commands.ENABLE_TEMP_MONITOR);
            } else {
                var exec = 'execut';
                if(data.indexOf(exec) > -1) {
                    var cmd = data.split('\n')[0],
                        dat = data.substring(data.indexOf(cmd) + cmd.length);

                    cmd = cmd.substring(cmd.indexOf(exec) + exec.length);
                    cmd = cmd.split(')')[0].trim();
                    ui.digestDeviceResponse(cmd, dat);
                } else {
                    console.warn('some other shit came through:');
                    console.warn(data);
                }

                if(fdp.device.job && fdp.device.job.status === 'running') {
                    ui.digestCmd(fdp.device.job.prevcmd);
                    fdp.device.job.processNext();
                }
            }
        }
    }
});

chrome.serial.onReceiveError.addListener(function(info) {
    if(info.error && info.error === 'device_lost') {
        notify({ title: 'Device Detached', message: fdp.device.path + ' detached' });

        //  push a hardStop here so that the device will not try to send to a
        //  detached serial device as well as an 'undefined' device object
        if(fdp.device.job && fdp.device.job.status !== 'empty')
            fdp.device.hardStop = 0;

        //  detach from ui and listen for a new device connection
        ui.detachDevice();
        fdp.initDevicePolling();
    } else {
        notify({
            title: 'Receive Error',
            message: 'Device responded with an error: ' + info.error
        });
    }
});

//  slide handles will be off when sliding if the window is resized. 
window.onresize = function(evt) {
    if(ui && ui !== undefined) {
        ui.setSlideTrimmers();
        if($('.handle').is(':ui-draggable')) {
            $('.handle:ui-draggable').draggable('destroy');
            ui.attachSliderHandlers();
        }
    }
};

//  show / hide console output on esc
document.body.onkeydown = function(evt) {
    if(evt.which == 27) {
        if(jQuery(ui.consoleOut).is(':visible'))
            ui.collapseConsoleOutput();
        else
            ui.expandConsoleOutput();
    }
};
