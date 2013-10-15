var hostInfo, os;

var init = function(info) { 
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
        //
        //  TODO ::
        //  user chrome notification here
        console.log('OS not supported: ' + hostInfo.os);
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