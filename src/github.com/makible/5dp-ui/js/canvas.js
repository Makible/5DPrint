'use strict';

/*
//    1[mm] == 3.78[pixel]
*/

var MAGICNUM = 3.78,
    POINTERVISUALOFFSET = 5;

function Indicator() {
    this.r = POINTERVISUALOFFSET;
    this.x = 0;
    this.y = 0;
    this.color = '';
    this.drawFill = function() {
        phLayer.ctx.beginPath();
        phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
        phLayer.ctx.strokeStyle = this.color;
        phLayer.ctx.fillStyle = this.color;
        phLayer.ctx.fill();
    };

    this.drawStroke = function() {
        phLayer.ctx.beginPath();
        phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
        phLayer.ctx.strokeStyle = this.color;
        phLayer.ctx.stroke();
    };
}

function Layer(c) {
    this.canvas = c;
    this.ctx    = c.getContext('2d');
    this.w      = $(c).attr('width');
    this.h      = $(c).attr('height');
}

var bgLayer, hlLayer, cLayer, objLayer, phLayer, loadLayer, w, h, ph, ct, pp, paths;

bgLayer     = new Layer(document.getElementById('grid-layer'));
hlLayer     = new Layer(document.getElementById('highlight-layer'));
cLayer      = new Layer(document.getElementById('cross-layer'));
objLayer    = new Layer(document.getElementById('obj-layer'));
phLayer     = new Layer(document.getElementById('ph-layer'));

w       = bgLayer.w;
h       = bgLayer.h;

ph      = new Indicator();
ct      = undefined;
pp      = undefined;
paths   = new Array();

ph.color = '#7fa8cd'; 
ph.x     = 0;
ph.y     = 0;

var canvasClickHandler = function(e) {
    if((e.offsetX == ph.y && e.offsetY == ph.x)
        || e.offsetX < 0 || e.offsetX > w
        || e.offsetY < 0 || e.offsetY > h) 
            return;  //  don't need to do anything

    detachMovers();

    var osx, osy;
    osx = e.offsetX - POINTERVISUALOFFSET;
    osy = e.offsetY - POINTERVISUALOFFSET;

    //  send coords to device
    var dist = pixelToMillimeter(osy) + ',' + pixelToMillimeter(osx);
    notifyServer('action.multi-move', { Axis: 'X,Y', Distance: dist, Speed: -1 });

    // setup projected point indicator
    pp = new Indicator();
    pp.x = osx;
    pp.y = osy;
    pp.color = '#7fa8cd';

    movePrintHead(osx, osy);   
};

var movePrintHead = function(offsetX, offsetY) {
    var dx, dy, sx, sy, err;

    dx = Math.abs(offsetX - ph.x);
    dy = Math.abs(offsetY - ph.y);
    sx = (ph.x < offsetX) ? 1 : -1;
    sy = (ph.y < offsetY) ? 1 : -1;
    err = dx - dy;

    var i = setInterval(function(e) {
        if(ph.x == offsetX && ph.y == offsetY) {
            window.clearInterval(i);
            pp = undefined;
            attachMovers();
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

        redrawIndicators();
    }, 12);
};

var displayGrid = function() {
    var inc = millimeterToPixel(5);

    bgLayer.ctx.strokeStyle = '#555';
    for(var x = inc; x <= w; x+=inc) {
        bgLayer.ctx.moveTo(x, 0);
        bgLayer.ctx.lineTo(x, h);
    }

    for(var y = inc; y <= (h - inc); y+=inc) {
        bgLayer.ctx.moveTo(0, y);
        bgLayer.ctx.lineTo(w, y);
    }
    bgLayer.ctx.stroke();

    // inc = millimeterToPixel(10);
    // hlLayer.ctx.strokeStyle = 'rgba(57, 190, 231, 0.4)';
    // for(var x = 0; x <= w; x+=inc) {
    //     hlLayer.ctx.moveTo(x, 0);
    //     hlLayer.ctx.lineTo(x, h);
    // }
   
    // for(var y = 0; y <= h; y+=inc) {
    //     hlLayer.ctx.moveTo(0, y);
    //     hlLayer.ctx.lineTo(w, y);
    // }
    // hlLayer.ctx.stroke();
 

    // clayer.ctx.strokestyle = '#777';
    // clayer.ctx.moveto((w/2), 0);
    // clayer.ctx.lineto((w/2), h);
    // clayer.ctx.moveto(0, (h/2));
    // clayer.ctx.lineto(w, (h/2));
    // clayer.ctx.stroke();
};



var pixelToMillimeter = function(p) {
    if(p != 0) return Math.floor(p / MAGICNUM);

    return p
};

var millimeterToPixel = function(mm) {
    if(mm != 0) return Math.floor(mm * MAGICNUM);

    return mm
}

var redrawIndicators = function() {
    phLayer.ctx.clearRect(0, 0, w, h);
    ph.drawFill();

    if(ct != undefined) ct.drawStroke();
    if(pp != undefined) pp.drawStroke();
};

var resetAndDrawPaths = function() {
    objLayer.ctx.closePath();
    objLayer.ctx.clearRect(0, 0, w, h);
    objLayer.ctx.beginPath();

    if(paths.length > 0) {
        objLayer.ctx.strokeStyle = '#ffc0cb';
        objLayer.ctx.moveTo(paths[0].x, paths[0].y);

        for(var i = 1; i < paths.length; i++) {
            var x = paths[i].x, 
                y = paths[i].y;
            objLayer.ctx.lineTo(x, y);
            objLayer.ctx.moveTo(x, y);
        }
    }
    objLayer.ctx.stroke();
}

displayGrid();
redrawIndicators();
