function Util() {
    this.serialPrefix = '';
}

Util.prototype.pixelToMillimeter = function(p) {
    return (p !== 0) ? Math.floor(p / MAGICNUM) : p;
};

Util.prototype.millimeterToPixel = function(mm) {
    return (mm !== 0) ? Math.floor(mm * MAGICNUM) : mm;
};

Util.prototype.mac   = function() { this.serialPrefix = 'tty.usbmodem'; };
Util.prototype.win   = function() { this.serialPrefix = 'COM'; };
Util.prototype.linux = function() { this.serialPrefix = 'ttyACM'; };
Util.prototype.cros  = function() { this.serialPrefix = 'ttyACM'; };
