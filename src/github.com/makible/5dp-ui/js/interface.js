'use strict';
//  1[mm] == 3.78[pixel]
var MAGICNUM = 3.78,
    POINTERVISUALOFFSET = 5,
    INDICATOR_COLOR = 'rgba(178, 18, 18, 0.8)',
    IND_GHOST_COLOR = 'rgba(178, 18, 18, 0.4)';

var devTpl;

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

ph.color = INDICATOR_COLOR; 
ph.x     = 0;
ph.y     = 0;

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
};

var updateStatsUI = function(msg) {
    updateConsoleOutput(msg);

    //  update active dev UI temps
    $('#e > .act').html(activeDev.ETemp);
    $('#z > .act').html(activeDev.BTemp);

    //

    //  update device list info
    $('#devices-overlay > ul > li').each(function() {
        var li  = this,
            dn  = $(li).children('.dev-name').html(),
            d   = devices[dn];

        if(d == undefined) {
            $(this).remove();
            return;
        }

        if($(li).children('.dev-status').html() != d.JobStatus)
            $(li).children('.dev-status').html(d.JobStatus);

        if(d.JobFile != '')
            $(li).children('.dev-file').html(d.JobFile);
        else 
            $(li).children('.dev-file').html('nothing set to print');

        $(li).children('.dev-temp').html('E:' + d.ETemp + ' / B:' + d.BTemp);
    });

    //  process full stat list
    if(msg.Body.indexOf('--FULL STATS') > -1) {
        var rows = msg.Body.split('\n'),
            homedData,
            posData,
            fwData,
            limits,
            esteps;

        for(var i = 0; i < rows.length; i++) {
            var row     = rows[i],
                ahFlag  = '-- Axes Homed',
                posFlag = '-- C:',
                fwFlag  = 'Firmware Version',
                lmtFlag = '// X_MAX_LENGTH',
                esFlag  = 'Steps per unit:';

            if(row.indexOf(ahFlag) > -1) {
                homedData = row.substring(row.indexOf(ahFlag) + ahFlag.length + 1).split(' ');
                continue;
            }

            if(row.indexOf(posFlag) > -1) {
                posData = row.substring(row.indexOf(posFlag) + posFlag.length + 1).split(' ');
                continue;
            }

            if(row.indexOf(fwFlag) > -1) {
                fwData = row;
                continue;
            }

            if(row.indexOf(lmtFlag) > -1) {
                limits = row.substring(2).split(' ');
                continue;
            }

            if(row.indexOf(esFlag) > -1) {
                esteps = rows[i+1].split(' ')[4];
                continue;
            }
        }

        if(homedData && homedData != undefined) {
            for(var i = 0; i < homedData.length; i++) {
                var axis = homedData[i].split(':'),
                    hId  = '#' + axis[0].toLowerCase() + '-home';

                if(axis[1] == '0' && !$(hId).hasClass('not-homed'))
                    $(hId).addClass('not-homed');

                if(axis[1] == '1' && $(hId).hasClass('not-homed'))
                    $(hId).removeClass('not-homed');
            }
        }

        if(posData && posData != undefined) {
            for(var i = 0; i < posData.length; i++) {
                if(posData[i].indexOf(':') == -1) continue;

                var coord = posData[i].split(':'),
                    pos   = millimeterToPixel(coord[1]);

                if(coord[0].toLowerCase() == 'x') ph.y = pos;
                if(coord[0].toLowerCase() == 'y') ph.x = pos;
            }

            movePrintHead(ph.x, ph.y);
        }
    }
};

var attachDevToUIList = function(d) {
    var li = $(devTpl).clone();

    if(d.IsActive) 
        $(li).addClass('selected');

    $(li).find('.dev-name').html(d.Name);
    $(li).find('.dev-status').html(d.JobStatus);
    $(li).find('.dev-temp').html('E:0 / B:0');
    $(li).find('.dev-file').html('none');

    $('#devices-overlay > ul').append(li);
};

var initActiveDevUI = function(dn) {
    if($('#active-dev').hasClass('no-device')) 
        $('#active-dev').removeClass('no-device').html(dn);
};

var removeDevsFromUI = function() {
    if($('nav > #settings-overlay').is(':visible'))
        $('nav > #settings-overlay > .close').click();

    if($('nav > #devices-overlay').is(':visible'))
        $('nav > #devices-overlay > .close').click();


    if(!$('#active-dev').hasClass('no-device')) 
        $('#active-dev').addClass('no-device').html('no device');

    if(!$('#x-home').hasClass('not-homed')) 
        $('#x-home').addClass('not-homed');
    if(!$('#y-home').hasClass('not-homed')) 
        $('#y-home').addClass('not-homed');
    if(!$('#z-home').hasClass('not-homed')) 
        $('#z-home').addClass('not-homed');

    $('#devices-overlay > ul').html('');
};

//  ======================
//    console helpers
//  ======================
var expandConsoleOutput = function() {
    $('#console-area > .output').show().animate({
        height:             '330px',
        'padding-top':      '8px',
        'padding-bottom':   '8px',
        top:                '-347px'
    }, 140, function() {
        $('#console-nav').fadeIn(800);
        $('#console-nav > .down').click();
    });
};

var collapseConsoleOutput = function() {
    $('#console-nav').fadeOut(200, function() {
        $('#console-area > .output').animate({
            height:             '0px',
            'padding-top':      '0px',
            'padding-bottom':   '0px',
            top:                '-1px'
        }, 140, function() { $('#console-area > .output').hide(); });
    });
};

var updateConsoleOutput = function(msg) {
    //  truncate output after ~200 rows (ignoring extra <br>)
    var rl = 200,
        opTxt    = $('#console-area > .output').html(),
        msgBody  = msg.Body.replace(/\n/g, '<br>'),
        olen     = opTxt.split('<br>').length,
        nlen     = msgBody.split('<br>').length;

    if(nlen == rl)
        opTxt = msgBody + '<br>';
    else {
        if(nlen < rl) {
            if(olen + nlen <= rl) 
                opTxt += msgBody + '<br>';
            else {
                var tmp = '',
                    ots = opTxt.split('<br>').slice((olen + nlen) - rl - 1);
                for(i in ots) 
                    tmp += ots[i] + '<br>';
                opTxt = tmp + msgBody;
            }
        } else {
            opTxt = '';
            var extra = nlen - rl;
            for(var i = extra; i < nlen; i++)
                opTxt += msgBody.split('<br>')[i];
            opTxt += '<br>'
        }
    }
    $('#console-area > .output').html(opTxt);
};

//  ======================
//     movement helpers
//  ======================
var attachMovers = function() {
    $('.slider').on('click', slideListener);
    $('.slider > .handle').on('mouseup', function(e) {
        detachMovers();
        mouseDownHandler = undefined;

        var dist = pixelToMillimeter(ph.y) + ',' + pixelToMillimeter(ph.x);
        notifyServer('action.multi-move', { Axis: 'X,Y', Distance: dist, Speed: -1 });

        attachMovers();
    });

    $('#x > .handle').draggable('enable');
    $('#y > .handle').draggable('enable');

    $(document).on('mouseup', function(e) {
        if(mouseDownHandler && mouseDownHandler != undefined) {
            $(mouseDownHandler).trigger('mouseup');
            mouseDownHandler = undefined;
        }
    });
};

var detachMovers = function() {
    $('.slider').off('click');
    $('.slider > .handle').off('mouseup');
    $('#x > .handle').draggable('disable');
    $('#y > .handle').draggable('disable');
};

var movePrintHead = function(offsetX, offsetY) {
    ph.x = offsetX;
    ph.y = offsetY;
    moveSliders(ph.x, ph.y);

    //  WARNING ::
    //  The following code is very resource
    //  heavy. It does allow for a proper path to be
    //  draw tho the animation speed algorithm needs 
    //  work. ATM it is hard-coded to 12

    // var dx, dy, sx, sy, err;

    // dx = Math.abs(offsetX - ph.x);
    // dy = Math.abs(offsetY - ph.y);
    // sx = (ph.x < offsetX) ? 1 : -1;
    // sy = (ph.y < offsetY) ? 1 : -1;
    // err = dx - dy;

    // var i = setInterval(function(e) {
    //     if(ph.x == offsetX && ph.y == offsetY) {
    //         window.clearInterval(i);
    //         pp = undefined;
    //         attachMovers();
    //         return;
    //     }

    //     var e = 2 * err;
    //     if(e > -dy) {
    //         err -= dy;
    //         ph.x += sx;
    //         var l = $('#y > .handle').position().left + sx;
    //         $('#y > .handle').css('left', l+'px');
    //     }

    //     if(e < dx) {
    //         err += dx;
    //         ph.y += sy;
    //         var t = $('#x > .handle').position().top + sy;
    //         $('#x > .handle').css('top', t+'px');
    //     }
    //     redrawIndicators();
    // }, 12);
};

var moveSliders = function(offsetX, offsetY) {
    var t, l;

    t = ph.y - ($('#x > .handle').width() / 2) + POINTERVISUALOFFSET;
    $('#x > .handle').css('top', t+'px');

    l = ph.x - ($('#y > .handle').height() / 2) + POINTERVISUALOFFSET;
    $('#y > .handle').css('left', l+'px');
};

var resetAndDrawPaths = function() {
    objLayer.ctx.closePath();
    objLayer.ctx.clearRect(0, 0, w, h);
    objLayer.ctx.beginPath();

    if(paths.length > 0) {
        objLayer.ctx.strokeStyle = IND_GHOST_COLOR;
        objLayer.ctx.moveTo(paths[0].x, paths[0].y);

        for(var i = 1; i < paths.length; i++) {
            var x = paths[i].x, 
                y = paths[i].y;
            objLayer.ctx.lineTo(x, y);
            objLayer.ctx.moveTo(x, y);
        }
    }
    objLayer.ctx.stroke();
};

var redrawIndicators = function() {
    phLayer.ctx.clearRect(0, 0, w, h);
    ph.drawFill();

    if(ct != undefined) ct.drawStroke();
    if(pp != undefined) pp.drawStroke();
};

var homeUI = function(axis) {
    var ox = 0, 
        oy = 0;
    if(axis == 'ALL')
        $('.not-homed').removeClass('not-homed');

    if(axis == 'X') oy = ph.y;
    if(axis == 'Y') ox = ph.x;

    $('#' + axis.toLowerCase() + '-home')
        .removeClass('not-homed');

    movePrintHead(ox, oy);
};

//  ======================
//     convert helpers
//  ======================
var pixelToMillimeter = function(p) {
    return (p != 0) ? Math.floor(p / MAGICNUM) : p;
};

var millimeterToPixel = function(mm) {
    return (mm != 0) ? Math.floor(mm * MAGICNUM) : mm;
};

$(document).ready(function() {
    //  grab device UI template
    devTpl = $('#devices-overlay > ul > li').clone();
    $('#devices-overlay > ul > li').remove();
});