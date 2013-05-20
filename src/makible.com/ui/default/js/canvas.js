'use strict';

/*
//    1[mm] == 3.779[pixel]
*/

var MAGICNUM = 3.779;

var canvas, ctx, w, h, inc;

canvas  = $('#graph');
ctx     = canvas.get(0).getContext('2d');
w       = $(canvas).attr('width');
h       = $(canvas).attr('height');
inc     = 14.2;

var clickHandler = function(e) {
    var x, y;
    x = ' X' + pixelToMilliMeter(e.offsetY);
    y = ' Y' + pixelToMilliMeter(e.offsetX);
    sendConsoleMsg('G1'+x+y);
};

var displayGrid = function() {
    ctx.strokeStyle = '#555';
    for(var x = 0; x <= w; x+=inc) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
    }

    for(var y = 0; y <= h; y+=inc) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    ctx.stroke();
};

var pixelToMilliMeter = function(p) {
    if(p != 0) return Math.floor(p / MAGICNUM);

    return p
};

var milliMeterToPixel = function(mm) {
    if(mm != 0) return Math.floor(mm * MAGICNUM);

    return mm
}

$(canvas).on('click', clickHandler);
displayGrid();