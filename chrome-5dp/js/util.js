var util = {
    serialPrefix: '',

    pixelToMillimeter: function(p) {
        return (p !== 0) ? Math.floor(p / MAGICNUM) : p;
    },

    millimeterToPixel: function(mm) {
        return (mm !== 0) ? Math.floor(mm * MAGICNUM) : mm;
    },

    mac:   function() { util.serialPrefix = 'tty.usbmodem'; },
    win:   function() { util.serialPrefix = 'COM'; },
    linux: function() { util.serialPrefix = 'ttyACM'; },
    cros:  function() { util.serialPrefix = 'ttyACM'; }
};