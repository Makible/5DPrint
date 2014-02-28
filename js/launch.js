chrome.app.runtime.onLaunched.addListener(function() {
    console.log("Launching 5DPrint");
    chrome.app.window.create('index.html', {
        'bounds': {
            'width': 768,
            'height': 800,
            'left': 0,
            'top': 0
        }
    }, function(w) { w.onClosed.addListener(cleanup); });
});

var devIds = [];
var cleanup = function() {
    console.log("Main 5DPrint window closed, cleaning up");
    chrome.power.releaseKeepAwake();
    for(var i = 0; i < devIds.length; i++) {
        chrome.serial.flush(devIds[i], function(info) { });
        chrome.serial.close(devIds[i], function(info) { });
    }
};
