'use strict';

/*
//    1[mm] == 3.78[pixel]
*/

var MAGICNUM = 3.78,
    POINTERVISUALOFFSET = 8;

function Indicator() {
    this.r = 8;
    this.x = 0;
    this.y = 0;
    this.color = '';
    this.drawFill = function() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    };
    this.drawStroke = function() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
        ctx.strokeStyle = this.color;
        ctx.stroke();
    };
}

var c, ctx, w, h, ph, ct, pp, paths;

c       = document.getElementById('pa');
ctx     = c.getContext('2d');
w       = $(c).attr('width');
h       = $(c).attr('height');
ph      = new Indicator();
ct      = undefined;
pp      = undefined;
paths   = new Array();

ph.color = '#7fa8cd'; 
ph.x     = 0;
ph.y     = 0;

var canvasClickHandler = function(e) {
    if((e.offsetX == ph.x && e.offsetY == ph.y)
        || e.offSetX < 0 || e.offSetX > c.height 
        || e.offsetY < 0 || e.offsetY > c.width) 
        return;  //  don't need to do anything

    $(c).off('click');

    var xstr, ystr, osx, osy;
    osx = e.offsetX - POINTERVISUALOFFSET;
    osy = e.offsetY - POINTERVISUALOFFSET;

    //  send coords to device
    xstr = ' X' + pixelToMillimeter(osy);
    ystr = ' Y' + pixelToMillimeter(osx);
    sendConsoleMsg('G1'+xstr+ystr);
   
    // setup projected point indicator
    pp = new Indicator();
    pp.x = osx;
    pp.y = osy;
    pp.color = '#7fa8cd';

    var dx, dy, sx, sy, err;

    dx = Math.abs(osx - ph.x);
    dy = Math.abs(osy - ph.y);
    sx = (ph.x < osx) ? 1 : -1;
    sy = (ph.y < osy) ? 1 : -1;
    err = dx - dy;

    var i = setInterval(function(e) {
        if(ph.x == osx && ph.y == osy) {
            window.clearInterval(i);
            pp = undefined;
            $(c).on('click', canvasClickHandler);
            return;
        }

        var e = 2 * err;
        if(e > -dy) {
            err -= dy;

            ph.x += sx;
            var l = $('#y > .handle').position().left + sx;
            $('#y > .handle').css('left', l+'px');
        }

        if(e < dx) {
            err += dx;

            ph.y += sy;
            var t = $('#x > .handle').position().top + sy;
            $('#x > .handle').css('top', t+'px');
        }

        redraw();
    },12);
};

var displayGrid = function() {
    var inc = millimeterToPixel(5);

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

var pixelToMillimeter = function(p) {
    if(p != 0) return Math.floor(p / MAGICNUM);

    return p
};

var millimeterToPixel = function(mm) {
    if(mm != 0) return Math.floor(mm * MAGICNUM);

    return mm
}

var redraw = function() {
    ctx.clearRect(0, 0, c.width, c.height);
    displayGrid();

    ph.drawFill();
    if(ct != undefined) ct.drawStroke();
    if(pp != undefined) pp.drawStroke();
};

displayGrid();
redraw();
