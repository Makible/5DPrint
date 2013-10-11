'use strict';

var serConnId;

var pollSerialDevices = function() {
    var listSerialPorts = function(ports) {
        for(var i=0; i < ports.length; i++)
            if(ports[i].indexOf('tty.usbmodem') > -1) console.log(ports[i]);
    };

    chrome.serial.getPorts(listSerialPorts);
};