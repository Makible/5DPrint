var hostInfo, os, notifyId;

var init = function(info) { 
    notifyId = 0;
    hostInfo = info;
    config();

    uiInit();
    displayGrid();
    setSlideTrimmers();

    devices = {};
    pollSerialDevices();
};

var config = function() {
    if(typeof window[hostInfo.os] === 'function')
        window[hostInfo.os]();
    else {
        var opts = {
            type: "basic",
            title: "OS Support Issue",
            message: "Unfortunately, your OS is not supported at this time.",
            iconUrl: NOTIFY_ICON
        };
        chrome.notifications.create('oserr-' + (notifyId++), opts, function(info) { });
    }
};

//
//  slide handles will be off when sliding
//  if the window is resized... so we'll just
//  set a "trimer" to fix that
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