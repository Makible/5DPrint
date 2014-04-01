var util = {
    serialPrefix: '',

    pixelToMillimeter: function(p) { return (p !== 0) ? Math.floor(p / MAGICNUM) : p; },
    millimeterToPixel: function(mm) { return (mm !== 0) ? Math.floor(mm * MAGICNUM) : mm; },

    mac:   function() { util.serialPrefix = 'tty.usbmodem'+"001"; },
    win:   function() { util.serialPrefix = 'COM'; },
    linux: function() { util.serialPrefix = 'ttyACM'; },
    cros:  function() { util.serialPrefix = 'ttyACM'; },

    ab2str: function(buf) { return String.fromCharCode.apply(null, new Uint8Array(buf)); },
    str2ab: function(str) {
        var buf = new ArrayBuffer(str.length),
            bufView = new Uint8Array(buf);

        for(var i=0, strLen=str.length; i<strLen; i++)
            bufView[i] = str.charCodeAt(i);
        
        return buf;
    }
};
