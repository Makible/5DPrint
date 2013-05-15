'use strict';

/*
//    1[mm] == 3.779[pixel]
*/

var canvas, ctx, w, h, inc;

canvas  = $('#graph');
ctx     = canvas.get(0).getContext('2d');
w       = $(canvas).attr('width');
h       = $(canvas).attr('height');
inc     = 14.2;

var clickHandler = function(e) {
    var x, y;

    console.log(e);

    console.log(e.offsetX);
    console.log(e.offsetY);

    // ctx.moveTo(e.offsetX, e.offsetY);
    // ctx.lineTo(e.offsetX + inc, e.offsetY + inc);
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

$(canvas).on('click', clickHandler);
displayGrid();