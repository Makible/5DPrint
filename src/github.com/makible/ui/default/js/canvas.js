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
    xstr = ' X' + pixelToMillimeter(osx);
    ystr = ' Y' + pixelToMillimeter(osy);
    sendConsoleMsg('G1'+xstr+ystr);
   
    // setup projected point indicator
    pp = new Indicator();
    pp.x = osx;
    pp.y = osy;
    pp.color = '#7fa8cd';

    //  update the ui to reflect
    var i = setInterval(function(e) {
        if(osx == ph.x && osy == ph.y) {
            window.clearInterval(i);
            pp = undefined;
            $(c).on('click', canvasClickHandler);

            return;
        }

        if(osx != ph.x) {
            if(osx < ph.x) {
                ph.x--;

                var l = $('#y > .handle').position().left - 1;
                $('#y > .handle').css('left', l+'px');
            } else {
                ph.x++;

                var l = $('#y > .handle').position().left + 1;
                $('#y > .handle').css('left', l+'px');
            }
        }

        if(osy != ph.y) {
            if(osy < ph.y) {
                ph.y--;

                var t = $('#x > .handle').position().top - 1;
                $('#x > .handle').css('top', t+'px');
            } else {
                ph.y++;

                var t = $('#x > .handle').position().top + 1;
                $('#x > .handle').css('top', t+'px');
            }
        }

        redraw();
    }, 15);
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

$(c).on('click', canvasClickHandler);

$(c).on('mousemove', function(e) {
    if(ct == undefined) {
        ct = new Indicator();
        ct.color = 'rgba(222, 222, 222, 0.4)';
    }

    ct.x = e.offsetX - POINTERVISUALOFFSET;
    ct.y = e.offsetY - POINTERVISUALOFFSET;
    redraw();
});

$(c).on('mouseout', function(e) {
    ct = undefined;
    redraw();
});

displayGrid();
ph.drawFill();
