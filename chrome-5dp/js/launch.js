chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('index.html', { 
        // 'bounds': { 'width': 840, 'height': 800, 'left': 0, 'top': 0 } 
        'bounds': { 'width': 768, 'height': 800, 'left': 0, 'top': 0 } 
    });
});