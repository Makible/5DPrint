chrome.app.runtime.onLaunched.addListener(function() {
    console.log("Launching 5DPrint");
    chrome.app.window.create('index.html', {
        'bounds': {
            'width': 768,
            'height': 800,
            'left': 0,
            'top': 0
        }
    }, function(_window) { _window.onClosed.addListener(cleanup); });
});

var connection = undefined;
var cleanup = function() {
    console.log("Main 5DPrint window closed, cleaning up");
    chrome.power.releaseKeepAwake();
    if(device !== undefined) {
        console.log('closing connection ID: ');
        console.log(connection);

        chrome.serial.flush(connection, function(info) {});
        chrome.serial.disconnect(connection, function(info) { connection = undefined; });
    }
};
