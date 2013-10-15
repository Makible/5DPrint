const ZEDIST = 5;
const DEFSPEED = 2000;

var devTpl, xTrim, yTrim,
    prevTemp = 0,
    pfPrepd = 0,
    xTrim,
    yTrim,
    socket,
    naturals,
    mouseDownHandler,
    connTimer;  //  timer to check for initial device attachment

function Indicator() {
    this.r = POINTER_OFFSET;
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

function uiInit() {
    //  grab device UI template
    devTpl = $('#devices-overlay > ul > li').clone();
    $('#devices-overlay > ul > li').remove();

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
}

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

var setSlideTrimmers = function() {
    xTrim = $('#print-area').offset().top - 11;
    yTrim = $('#print-area').offset().left - 11;
};

var attachDeviceToInterface = function(device) {
    var li = $(devTpl).clone();

    $(li).find('.dev-name').html(device.name);
    $(li).find('.dev-status').html(device.name);
    $(li).find('.dev-temp').html('E:0 || B:0');
    $(li).find('.dev-file').html('no print loaded');

    $('#devices-overlay > ul').append(li);

    if($('#active-dev').html() === 'no device') {
        setAsActiveDevice(device);
        $(li).addClass('selected');
    }
};

var setAsActiveDevice = function(device) {
    $('#active-dev')
        .html(device.name)
        .removeClass('no-device');

    active = device;
    detachBtnHandlers();
    detachMovers();

    attachBtnHandlers();
    attachSliderHandlers();
    attachMovers();
    //  detach old event listeners
    //  and re-attach for new device
};

var attachBtnHandlers = function() {
    $('#settings').on('click', stgClickHandler);
    $('#print-actions').on('click', paClickHandler);
    $('#devices').on('click', devsClickHandler);
    $(phLayer.canvas).on('click', canvasClickHandler)
        .on('mousemove', function(evt) {
            if(ct == undefined) {
                ct = new Indicator();
                ct.color = 'rgba(222, 222, 222, 0.4)';
            }

            ct.x = evt.offsetX - POINTER_OFFSET;
            ct.y = evt.offsetY - POINTER_OFFSET;
            redrawIndicators();
        }).on('mouseout', function(evt) {
            ct = undefined;
            redrawIndicators();
        });

    $('#homing > div').on('click', function(evt) {
        active.home($(evt.target).html());
        homeDeviceUI($(evt.target).html());
    });

    $('#tools > .wrapper > .move-wrapper > div').on('click', function(evt) {
        var mvr = { Axis: $(evt.target).attr('data-axis'), Distance: ZEDIST, Speed: DEFSPEED };
        if($(evt.target).hasClass('minus')) 
            mvr.Distance *= -1;

        active.sendMovement(mvr);
    });

    $('#console-area').on('click', consoleClickHandler);
    $('#console-nav').on('click', consoleNavClickHandler);

    var inp = $('#console-area > .wrapper > input');
    $(inp).on('blur', function(evt) { 
        $(inp).addClass('ghost')
            .val('enter manual commands here'); 
    }).on('focus', function(evt) { 
        $(evt.target).val('');
        if($(evt.target).hasClass('ghost'))
            $(evt.target).removeClass('ghost');
    }).on('keydown', function(evt) {
        if(evt.keyCode == 13) {
            if($(evt.target).val() != '' || $(evt.target).val().length > 2) {
                var val = $(evt.target).val().toUpperCase();
                if(val == 'HELP') {
                    //  list out macro options
                    $(evt.target).focus();
                    return
                }

                if(naturals[val] != undefined)
                    active.macro(val);
                else 
                    pushConsoleMsg(val);
                $('#console-nav > .down').click();
            }

            $(evt.target).val('').focus();
        }
    });

    $('#tools > .wrapper > .power-wrapper > div').on('click', powerToggleClickHandler);
    $('#tools > .wrapper > input.req').on('blur', function(evt) {
        var temp = parseInt($(evt.target).val()),
            max  = parseInt($(evt.target).attr('max'));

        //  text in there that should be
        if(isNaN(temp) || temp < 0 || temp > max) {
            $(evt.target).val(prevTemp);
            return;
        }

        var onSwitch = $(evt.target).parent().find('.power-wrapper > .on'),
            offSwitch = $(evt.target).parent().find('.power-wrapper > .off');
        if(!$(onSwitch).hasClass('selected') && temp > 0) {
            $(offSwitch).removeClass('selected');
            $(onSwitch).addClass('selected');
        }

        if(!$(offSwitch).hasClass('selected') && temp == 0) {
            $(onSwitch).removeClass('selected');
            $(offSwitch).addClass('selected');
        }

        active.setTemp({ 
            Name:   $(evt.target).parent().attr('id'),
            Value:  temp 
        });
    }).on('click', function(evt) { prevTemp = parseInt($(evt.target).val()); });

    //  
    //  jQuery.on('keydown', ...) breaks the standard input func
    $('#tools > .wrapper > input.req')[0].onkeydown = function(evt) {
        if(evt.which == 13) {
            ($(evt.target).html()).replace(/\<br\>/g, '');
            $(evt.target).blur();
            evt.preventDefault();
        }
    };
};

var attachSliderHandlers = function() {
    var xtb, xbb, ylb, yrb;

    //  x draggable limits
    xtb = $('#x').position().top + xTrim;     //  value was found through trial and error
    xbb = xtb + $('#x').height();

    //  y draggable limits
    ylb = $('#y').position().left + yTrim;    //  value was found through trial and error
    yrb = ylb + $('#y').width();

    $('#x > .handle').draggable({
        axis: 'y',
        containment: [0, xtb, 0, xbb],
        drag: function(evt) {
            mouseDownHandler = evt.target;
            ph.y = $(mouseDownHandler).position().top + Math.floor($(mouseDownHandler).height() / 2) + Math.floor(POINTER_OFFSET / 2);
            redrawIndicators();
        }
    });

    $('#y > .handle').draggable({ 
        axis: 'x', 
        containment: [ylb, 0, yrb, 0],
        drag: function(evt) {
            mouseDownHandler = evt.target;
            ph.x = $(mouseDownHandler).position().left + Math.floor($(mouseDownHandler).width() / 2) + Math.floor(POINTER_OFFSET / 2);
            redrawIndicators();
        }
    });
};

var updateStatsUI = function(stats) {
    updateConsoleOutput(stats);

    //  update active dev UI temps
    $('#e > .act').html(active.ETemp);
    $('#z > .act').html(active.BTemp);

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

        if($(li).children('.dev-status').html() != d.job.status)
            $(li).children('.dev-status').html(d.job.status);

        if(d.job.filename != '')
            $(li).children('.dev-file').html(d.job.filename);
        else 
            $(li).children('.dev-file').html('no pending / running prints');

        $(li).children('.dev-temp').html('E:' + d.ETemp + ' / B:' + d.BTemp);
    });

    //  process full stat list
    if(stats.indexOf('--FULL STATS') > -1) {
        var rows = stats.split('\n'),
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
                var axis = homedData[i].replace(/\s/g, '').split(':'),
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

var detachBtnHandlers = function() {
    $('#settings').off('click');
    $('#print-action').off('click');
    $('#devices').off('click');
    $('#homing > div').off('click');
    $('#tools > .wrapper > .move-wrapper > div').off('click')
    $('#console-area').off('click');
    $('#console-nav').off('click');
    $('#console-area > .wrapper > input').off('blur').off('focus').off('keydown');
    $(phLayer.canvas).off('click', canvasClickHandler).off('mouseout').off('mousemove');
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

var initUIForPrinting = function() {
    //  switch icon to pause icon
    //  remove most button listeners except 
    //      for the temp control, stop/pause and 
    //      device switching
    //  
    $('#print-pause').removeClass('icon-play').addClass('icon-pause');
};

//  =====================
//      click handlers
//  =====================
var stgClickHandler = function(evt) {
    if($('nav > div.btn').hasClass('selected')) return;

    $('#settings').addClass('selected');

    $('#settings-overlay').show();
    $('#settings-overlay > .close').on('click', function(evt) {
        $('#settings-overlay').hide();
        $('#settings').removeClass('selected');
    });

    $('#settings-overlay > div.nav-left > ul > li').on('click', function(evt) {
        if($(evt.target).hasClass('selected')) return;

        $('#settings-overlay > div.nav-left > ul > li.selected').removeClass('selected');
        $(evt.target).addClass('selected');

        //  TODO ::
    });
    $('#settings-overlay > div.nav-left > ul > li:first').click();
};

var paClickHandler = function(evt) {
    switch($(evt.target).attr('id')) {
    case 'file-picker':
        var inp = $('<input id="fl" type="file" accept=".gcode,.gc" class="fi" />');

        $('body').append(inp);
        $(inp).on('change', function(evt) {
            console.log(evt.target.files);
            var f = evt.target.files[0],
                fr = new FileReader();

            fr.readAsText(f, 'UTF-8');
            fr.onloadend = function(e) { 
                //  
                //  TODO ::
                //  chrome notification of pending ready
            };

            fr.onerror   = function(e) {
                console.log(e);
                //  
                //  TODO ::
                //  chrome notification of error
            };

            fr.onload    = function(evt) {
                console.log(evt);

                var fname   = f.name,
                    content = evt.target.result.split('\n');

                active.job.filename = fname;
                active.job.content = content;
                active.job.status = 'pending';

                paths = new Array();
                paths.push({ x:0, y:0 });

                //  loop through the file, getting each 'G1' line and loading the
                //  x / y coords into the paths array, ignoring the commented rows
                for(var i = 0; i < content.length; i++) {
                    if(content[i] && content[i] != undefined
                        && (content[i].indexOf(';') == -1 || content[i].indexOf(';') > 1) 
                        && (content[i].indexOf('G1 X') > -1 || content[i].indexOf('G1 Y') > -1)) {

                        var move, mx, my;
                        move = content[i].split(' ');

                        for(var j = 0; j < move.length; j++) {
                            if(move[j].indexOf('X') > -1)
                                mx = millimeterToPixel(move[j].substring(1));

                            if(move[j].indexOf('Y') > -1)
                                my = millimeterToPixel(move[j].substring(1));
                        }
                        paths.push({ x: my, y: mx });
                    }
                }

                if(paths.length == 1)
                    paths = new Array();

                resetAndDrawPaths();
                $('#fl').remove();
            };
        });
        $(inp).click();

        //  clear out old object from canvas
        paths = new Array();
        resetAndDrawPaths();

        break;
    case 'print-pause':
        if(!active.job.filename || active.job.filename == '') {
            $('#file-picker').click();
            return;
        }

        if(active.job.status !== 'in-progess') {
            active.startPendingJob();
            initUIForPrinting();

            //  update #print-pause click event
        }

        if($('#print-pause').hasClass('icon-pause')) {
            //  push pause to printer
        }

        break;
    case 'reset':
        
        break;
    default:
        //  
        console.log('how the hell did we get here?!');
        break;
    }
};

var devsClickHandler = function(evt) {
    if($('nav > div.btn').hasClass('selected')) return;

    $('#devices').addClass('selected');
    $('#devices-overlay').show();
    $('#devices-overlay > .close').on('click', function(evt) {
        $('#devices-overlay').hide();
        $('#devices').removeClass('selected');
    });
};

var canvasClickHandler = function(evt) {
    if((evt.offsetX == ph.y && evt.offsetY == ph.x)
        || evt.offsetX < 0 || evt.offsetX > w
        || evt.offsetY < 0 || evt.offsetY > h) 
            return;  //  don't need to do anything

    detachMovers();

    var osx, osy;
    osx = evt.offsetX - POINTER_OFFSET;
    osy = evt.offsetY - POINTER_OFFSET;

    //  send coords to device
    var dist = pixelToMillimeter(osy) + ',' + pixelToMillimeter(osx);
    active.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED })

    // setup projected point indicator
    pp = new Indicator();
    pp.x = osx;
    pp.y = osy;
    pp.color = IND_GHOST_COLOR;

    movePrintHead(osx, osy);   
};

var consoleClickHandler = function(evt) {
    if(!$('#console-area > .output').is(':visible'))
        expandConsoleOutput();
    else {
        if($(evt.target).hasClass('handle') && $('#console-area > .output').is(':visible')) {
            collapseConsoleOutput();
            return;
        }
    }
};

var consoleNavClickHandler = function(evt) {
    var output  = $('#console-area > .output'),
        dur     = 800;

    //  scroll to bottom of list
    if($(evt.target).hasClass('down'))
        $(output).animate({ scrollTop: $(output)[0].scrollHeight }, 800);

    //  scroll to top of list
    if($(evt.target).hasClass('up'))
        $(output).animate({ scrollTop: 0 }, 800);
};

var powerToggleClickHandler = function(evt) {
    if($(evt.target).hasClass('selected')) return;

    var p = $(evt.target).parent()

    //  updated the ui
    $(p).find('.selected').removeClass('selected');
    $(evt.target).addClass('selected');

    //
    //  default to off but if the evt is via the 'on'
    //  button, get the temp and send it to the device.
    //  if evt is the 'off' button, then update the 
    //  .req value to 0
    var temp = 0;
    if($(evt.target).hasClass('on')) 
        parseInt($(p).parent().find('.req').val());
    else 
        $(p).parent().find('.req').val(0);

    active.setTemp({ 
        Name:   $(p).parent().attr('id'),
        Value:  temp 
    });
};

var slideListener = function(evt) {
    if(!$(evt.target).hasClass('slider')) { return; }

    if($(evt.target).attr('id') == 'y')
        evt.offsetY = ph.y + POINTER_OFFSET;
    else
        evt.offsetX = ph.x + POINTER_OFFSET;
    canvasClickHandler(evt);
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

var updateConsoleOutput = function(data) {
    data = data.replace(/\n/g, '<br>');

    //  truncate output after ~200 rows (ignoring extra <br>)
    var LINE_COUNT = 200;

    var opTxt = $('#console-area > .output').html(),
        olen  = opTxt.split('<br>').length,
        nlen  = data.split('<br>').length;

    if(nlen == LINE_COUNT)
        opTxt = data + '<br>';
    else {
        if(nlen < LINE_COUNT) {
            if(olen + nlen <= LINE_COUNT) 
                opTxt += data + '<br>';
            else {
                var tmp = '',
                    ots = opTxt.split('<br>').slice((olen + nlen) - LINE_COUNT - 1);
                for(i in ots) 
                    tmp += ots[i] + '<br>';
                opTxt = tmp + data;
            }
        } else {
            opTxt = '';
            var extra = nlen - LINE_COUNT;
            for(var i = extra; i < nlen; i++)
                opTxt += data.split('<br>')[i];
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
        active.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED });

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

    if($('.handle').is(':ui-draggable')) {
        $('.handle:ui-draggable').draggable('destroy');
        attachSliderHandlers();
    }
};

var movePrintHead = function(offsetX, offsetY) {
    ph.x = offsetX;
    ph.y = offsetY;

    moveSliders(ph.x, ph.y);
    redrawIndicators();
    attachMovers();

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

    t = ph.y - ($('#x > .handle').width() / 2) + POINTER_OFFSET;
    $('#x > .handle').css('top', t+'px');

    l = ph.x - ($('#y > .handle').height() / 2) + POINTER_OFFSET;
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
    // if(pp != undefined) pp.drawStroke();
};

var homeDeviceUI = function(axis) {
    var ox = ph.x, 
        oy = ph.y;

    if(axis == 'all') {
        ox = oy = 0;
        $('.not-homed').removeClass('not-homed');
    }

    $('#' + axis.toLowerCase() + '-home').removeClass('not-homed');

    if(axis == 'x') oy = 0;
    if(axis == 'y') ox = 0;

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