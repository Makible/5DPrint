var dbg, hostInfo, os, notifyId;

function FDP() {}

var init = function(info) {
    notifyId = 0;
    hostInfo = info;
    config();

    UI.init();
    FDP.initDevicePolling();

    //  DEBUG
    // dbg=!0;
};

FDP.prototype.config = function() {
    if(typeof window[hostInfo.os] === 'function')
        window[hostInfo.os]();
    else 
        notify({ title: "Unsupported OS", message: "Unfortunately, your OS is not supported at this time." });
};

//  
//  currently only listening for MakiBox devices
//  though this will change in the near future
//  as device support increases
FDP.prototype.initDevicePolling = function() {
    if(devicePollTimer !== undefined)
        window.clearInterval(devicePollTimer);

    if(devices === undefined) 
        devices = {};

    //  pulls the list of devices according to the prefix
    //  and attempts to open and set the device if it is
    //  indeed a 5dprint compatable device (i.e. MakiBox A6)
    connTimer = window.setInterval(function() { 
        serial.getPorts(function(ports) {
            for(var i=0; i < ports.length; i++) {
                if(ports[i].indexOf(serialPrefix) > -1 && devices[ports[i]] == undefined) {
                    new Device(ports[i]).connect(function(device, valid) {
                        if(valid) {
                            notify({ title: "Device Attached", message: device.name + " attached" });
                            devices[device.name] = device;
                            attachDeviceToInterface(device);
                            device.getFullStats();
                        } else {
                            serial.flush(device.conn, function(){});
                            serial.close(device.conn, function(){});
                        }
                    });
                }
            }
        });
    }, 1200);
};

//  
//  generic notifications using the chrome api
var notify = function(conf) {
    conf['type'] = 'basic';
    conf['iconUrl'] = NOTIFY_ICON;
    chrome.notifications.create(conf.title.replace(/\s/g, '_') + (notifyId++), conf, function(info) { });
};

//
//  slide handles will be off when sliding
//  if the window is resized... so we'll just
//  set a "trimer" to fix this
$(window).on('resize', function(evt) {
    setSlideTrimmers();
    if($('.handle').is(':ui-draggable')) {
        $('.handle:ui-draggable').draggable('destroy');
        attachSliderHandlers();
    }
});

//  
//  entry point here, because we need
//  OS info in order to proceed
chrome.runtime.getPlatformInfo(init);