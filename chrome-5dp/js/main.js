var dbg, notifyId, fdp, ui, util;

function FDP() {
    this.devicePollTimer = undefined;
}

//  
//  currently only listening for MakiBox devices
//  though this will change in the near future
//  as device support increases
FDP.prototype.initDevicePolling = function() {
    if(this.devicePollTimer !== undefined)
        window.clearInterval(this.devicePollTimer);

    if(devices === undefined) 
        devices = {};
        
    var conncb = function(device, valid) {
        if(valid) {
            notify({ title: "Device Attached", message: device.name + " attached" });
            devices[device.name] = device;
            ui.attachDevice(device);
            device.getFullStats();
        } else {
            serial.flush(device.conn, function(){});
            serial.close(device.conn, function(){});
        }      
    };

    //  pulls the list of devices according to the prefix
    //  and attempts to open and set the device if it is
    //  indeed a 5dprint compatable device (i.e. MakiBox A6)
    this.connTimer = window.setInterval(function() { 
        serial.getPorts(function(ports) {
            for(var i=0; i < ports.length; i++) {
                if(ports[i].indexOf(util.serialPrefix) > -1 && devices[ports[i]] === undefined)
                    new Device(ports[i]).connect(conncb);
            }
        });
    }, 1200);
};

//  
//  generic notifications using the chrome api
var notify = function(conf) {
    conf.type    = 'basic';
    conf.iconUrl = NOTIFY_ICON;
    chrome.notifications.create(conf.title.replace(/\s/g, '_') + (notifyId++), conf, function(info) { });
};

//
//  slide handles will be off when sliding
//  if the window is resized... so we'll just
//  set a "trimer" to fix this
$(window).on('resize', function(evt) {
    if(ui && ui !== undefined) {
        ui.setSlideTrimmers();
        if($('.handle').is(':ui-draggable')) {
            $('.handle:ui-draggable').draggable('destroy');
            ui.attachSliderHandlers();
        }
    }
});

//  
//  entry point here, because we need
//  OS info in order to proceed
chrome.runtime.getPlatformInfo(function(info) {
    dbg = notifyId = 0;

    util = new Util();
    fdp  = new FDP();
    ui   = new UI();
    
    if(typeof util[info.os] !== 'function') {
        notify({ title: "Unsupported OS", message: "Unfortunately, your OS is not supported at this time." });
        return;
    } else 
        util[info.os]();
        
    fdp.initDevicePolling();

    //  DEBUG
    // dbg=!0;
});