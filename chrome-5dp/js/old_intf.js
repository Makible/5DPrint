
var w,
    h,
    ph,
    ct,
    pp,
    bgLayer,
    hlLayer,
    cLayer,
    objLayer,
    phLayer,
    loadLayer,
    paths,
    devTpl, 
    xTrim, 
    yTrim,
    prevTemp = 0,
    pfPrepd = 0,
    socket,
    mouseDownHandler,
    connTimer;







UI.prototype.init = function() {
    //  grab device UI template
    devTpl = $('#devices-overlay > ul > li').clone();
    $('#devices-overlay > ul > li').remove();

    $('body')[0].onkeydown = function(evt) {
        if(evt.keyCode == 27) { 
            if($('#console-area > .output').is(':visible'))
                collapseConsoleOutput();
            else
                expandConsoleOutput();
        }
    };
};

UI.prototype.displayGrid = function() {var inc = millimeterToPixel(5);

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

UI.prototype.setSlideTrimmers = function() {
    var shim = 14;  //  trial and error

    xTrim = $('#print-area').offset().top - shim;
    yTrim = $('#print-area').offset().left - shim;
};

var attachDeviceToInterface = function(device) {
    var li = $(devTpl).clone();

    $(li).on('click', deviceSelected);

    $(li).attr('data-dn', device.name);
    $(li).find('.dev-name').html(device.name);
    $(li).find('.dev-status').html(device.job.status);
    $(li).find('.dev-temp').html('E:0 / B:0');
    $(li).find('.dev-file').html('no print loaded');

    $('#devices-overlay > ul').append(li);

    if($('#active-dev').html() === 'no device') {
        setAsActiveDevice(device);
        $(li).addClass('selected');
    }
};

var deviceSelected = function(evt) {
    if($(evt.currentTarget).hasClass('selected')) return;

    $(evt.currentTarget).parent().find('.selected').removeClass('selected');
    $(evt.currentTarget).addClass('selected');

    $('#devices-overlay > .close').click();

    active = devices[$(evt.currentTarget).attr('data-dn')];
    $('#active-dev').html(active.name);
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

    movePrintHead(0, 0);
};

var attachBtnHandlers = function() {
    $('#settings').on('click', stgClickHandler);
    $('#print-actions').on('click', paClickHandler);
    $('#devices').on('click', devsClickHandler);
    $(phLayer.canvas).on('click', canvasClickHandler)
        .on('mousemove', function(evt) {
            if(ct === undefined) {
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
        var mvr, axis = $(evt.target).attr('data-axis');

        active.pos[axis] += (($(evt.target).hasClass('minus')) ? ZEDIST * -1 : ZEDIST);
        mvr = { Axis: axis, Distance: active.pos[axis], Speed: DEFSPEED };
        active.sendMovement(mvr);
    });

    $('#tools > .wrapper > .temp').on('mouseenter', function(evt) {
        var val = $(evt.currentTarget).find('.value');
        if($(val).attr('data-req') && $(val).attr('data-req') > 0)
            $(val).val($(val).attr('data-req'));
    });

    $('#tools > .wrapper > .temp > .value').on('blur', function(evt) {
        var temp = parseInt($(evt.target).val(), 10),
            max  = parseInt($(evt.target).attr('max'), 10);

        //  text in there that should be
        if(isNaN(temp) || temp < 0 || temp > max) {
            if(!isNaN(prevTemp) && prevTemp > 0)
                $(evt.target).val(prevTemp);
            else
                $(evt.target).removeAttr('value');
            return;
        }

        var onSwitch = $(evt.target).parent().parent().find('.power-wrapper > .on'),
            offSwitch = $(evt.target).parent().parent().find('.power-wrapper > .off');
        if(!$(onSwitch).hasClass('selected') && temp > 0) {
            $(offSwitch).removeClass('selected');
            $(onSwitch).addClass('selected');
        }

        if(!$(offSwitch).hasClass('selected') && temp === 0) {
            $(onSwitch).removeClass('selected');
            $(offSwitch).addClass('selected');
        }

        active.setTemp({ 
            Name:   $(evt.target).parent().parent().attr('id'),
            Value:  temp 
        });
    }).on('click', function(evt) {
        prevTemp = parseInt($(evt.target).val(), 10);
        $(evt.target).val('');
    });

    $('#console-area').on('click', consoleClickHandler);
    $('#console-nav').on('click', consoleNavClickHandler);

    var inp = $('#console-area > .wrapper > input');
    $(inp).on('blur', function(evt) { 
        $(inp).addClass('ghost').val(''); 
    }).on('focus', function(evt) { 
        $(evt.target).val('');
        if($(evt.target).hasClass('ghost'))
            $(evt.target).removeClass('ghost');
    });

    $('#tools > .wrapper > .power-wrapper > div').on('click', powerToggleClickHandler);

    //  
    //  jQuery.on('keydown', ...) breaks the standard input func
    $('#console-area > .wrapper > input')[0].onkeydown = function(evt) {
        if(evt.keyCode == 13) {
            if($(evt.target).val() !== '' || $(evt.target).val().length > 2) {
                active.console($(evt.target).val().toUpperCase());
                $('#console-nav > .down').click();
            }
            $(evt.target).val('').focus();
        }
    };

    var okd = function(evt) {
        if(evt.which == 13) {
            evt.preventDefault();
            $(evt.target).blur();
        }
    };

    $('#tools > .wrapper > .temp > .value')[0].onkeydown = okd;
    $('#tools > .wrapper > .temp > .value')[1].onkeydown = okd;
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
    $('#e > .temp > .actual').html(active.ETemp);
    $('#z > .temp > .actual').html(active.BTemp);

    //  update device list info
    $('#devices-overlay > ul > li').each(function() {
        var li  = this,
            dn  = $(li).children('.dev-name').html(),
            d   = devices[dn];

        if(d === undefined) {
            $(this).remove();
            return;
        }

        if($(li).children('.dev-status').html() != d.job.status)
            $(li).children('.dev-status').html(d.job.status);

        if(d.job.filename !== '')
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

        if(homedData && homedData !== undefined) {
            for(var j = 0; j < homedData.length; j++) {
                var axis = homedData[j].replace(/\s/g, '').split(':'),
                    hId  = '#' + axis[0].toLowerCase() + '-home';
                if(axis[1] == '0' && !$(hId).hasClass('not-homed'))
                    $(hId).addClass('not-homed');

                if(axis[1] == '1' && $(hId).hasClass('not-homed'))
                    $(hId).removeClass('not-homed');
            }
        }

        if(posData && posData !== undefined) {
            for(var k = 0; k < posData.length; k++) {
                if(posData[k].indexOf(':') == -1) continue;

                var coord = posData[k].split(':'),
                    pos   = millimeterToPixel(coord[1]);

                if(coord[0].toLowerCase() == 'x') ph.y = pos;
                if(coord[0].toLowerCase() == 'y') ph.x = pos;
            }

            movePrintHead(ph.x, ph.y);
        }
    }
};

var updatePrintUI = function(pcmd) {
    if(pcmd.indexOf(cmd.MOVE) > -1) {
        if(pcmd.indexOf('Z') > -1) {
            //  clear prev++ layer and prep
            //  for prev layer plotting
            hlLayer.clear();
            hlLayer.startPath(paths[0].x, paths[0].y);

            //  plot prev layer and draw
            for(var i = 1; i < paths.length; i++) {
                hlLayer.drawPathTo(paths[i].x, paths[i].y, 
                    (paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST);
                hlLayer.startPath();
            }
            hlLayer.closePath();

            //  reset "active" layer
            objLayer.clear();
            paths = [];
        }

        //  need to flip the X and Y here because of the way the
        //  physical printer is versus virtual via screen X / Y
        var mx, my, me, _pcmd = pcmd.split(' ');
        for(var j = 0; j < _pcmd.length; j++) {
            if(_pcmd[j].indexOf('X') > -1)
                my = millimeterToPixel(_pcmd[j].substring(1));

            if(_pcmd[j].indexOf('Y') > -1)
                mx = millimeterToPixel(_pcmd[j].substring(1));

            if(_pcmd[j].indexOf('E') > -1)
                me = millimeterToPixel(_pcmd[j].substring(1));
        }

        paths.push({ x: mx, y: my, e: me });
        ph.x = mx, ph.y = my;

        //  only draw the new path here
        objLayer.drawPathTo(mx, my, 
            (me !== undefined) ? RED_INDICATOR : BLU_INDICATOR);
        objLayer.startPath();

        var yw, xh;
        yw = mx - (Math.floor($('#y > .handle').width() / 2)) - Math.floor(POINTER_OFFSET / 2);
        xh = my - (Math.floor($('#x > .handle').height() / 2)) - Math.floor(POINTER_OFFSET / 2);

        $('#y > .handle').css('left', yw + 'px');
        $('#x > .handle').css('top', xh + 'px');

        redrawIndicators();
    }

    if(pcmd.indexOf(cmd.HOME) > -1)
        homeDeviceUI('all');

    if(pcmd.indexOf(cmd.SET_WAIT_BDTEMP) > -1 || 
        pcmd.indexOf(cmd.SET_WAIT_EXTEMP) > -1) {

        var axis = (pcmd.indexOf(cmd.SET_WAIT_BDTEMP) > -1) ? '#z' : '#e';

        //  toggle the on switch
        if(!$(axis + ' > .power-wrapper > .on').hasClass('selected')) {
            $(axis + ' > .power-wrapper > .on').addClass('selected');
            $(axis + ' > .power-wrapper > .off').removeClass('selected');
        }

        //  set the "requested" temp
        $(axis + ' > input').val(pcmd.split(' ')[1].split('S')[1]);
    }
};

UI.prototype.updateProgressBar = function(per) {
    document.getElementById('progress').style.width = per.toString() + '%';
};

var resetPrintUI = function() {
    $('#print-pause')
        .removeClass('icon-pause')
        .addClass('icon-play');
    loadContentToUI(active.job.content);
};

var loadContentToUI = function(content) {
    paths = [];
    paths.push({ x:0, y:0, e:0 });

    //  loop through the file, getting each 'G1' line and loading the
    //  x / y coords into the paths array, ignoring the commented rows
    for(var i = 0; i < content.length; i++) {
        if(content[i] && content[i] !== undefined
            && (content[i].indexOf(';') == -1 || content[i].indexOf(';') > 1) 
            && (content[i].indexOf('G1 X') > -1 || content[i].indexOf('G1 Y') > -1)) {

            var mx, my, me, move = content[i].split(' ');
            for(var j = 0; j < move.length; j++) {
                if(move[j].indexOf('X') > -1)
                    mx = millimeterToPixel(move[j].substring(1));

                if(move[j].indexOf('Y') > -1)
                    my = millimeterToPixel(move[j].substring(1));

                if(move[j].indexOf('E') > -1)
                    me = millimeterToPixel(move[j].substring(1));
            }
            paths.push({ x: my, y: mx, e: me });
        }
    }

    if(paths.length == 1)
        paths = [];
    resetAndDrawPaths();
};

var detachBtnHandlers = function() {
    $('#settings').off('click');
    $('#print-action').off('click');
    $('#devices').off('click');
    $('#homing > div').off('click');
    $('#tools > .wrapper > .move-wrapper > div').off('click');
    $('#tools > .wrapper > .temp > .value').off('click').off('blur')[0].onkeydown = undefined;
    $('#tools > .wrapper > .power-wrapper > div').off('click');
    $('#console-area').off('click');
    $('#console-nav').off('click');
    $('#console-area > .wrapper > input').off('blur').off('focus').off('keydown');
    $(phLayer.canvas).off('click', canvasClickHandler).off('mouseout').off('mousemove');
};

var detachDeviceFromUI = function(device) {
    var selector = '#devices-overlay > ul > li > .dev-name:contains(\'' + device + '\')';
    $(selector).parent().remove();

    if(active.name == device) {
        //  update active display
        if($('#devices-overlay > ul > li').length > 0) {
            var item = $('#devices-overlay > ul > li:first');
            $(item).addClass('selected');
            setAsActiveDevice(devices[$(item).find('.dev-name').html()]);
        } else {
            active = undefined;
            $('#active-dev')
                .html('no device')
                .addClass('no-device');
            $('#tools > .wrapper > input').val('0');
            $('#tools > .wrapper > .act.temp').html('0');
            $('#tools > .wrapper > .power-wrapper > div.selected').removeClass('selected');
            $('#tools > .wrapper > .power-wrapper > div.off').addClass('selected');
            detachBtnHandlers();
            detachMovers();
        }
    }
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
        $('#settings-overlay > .panel.content-right').html('');
        $(evt.target).addClass('selected');

        //  TODO ::
        switch(evt.target.id) {
            case "basic":
                break;
            case "advanced":
                break;
            case "profiles":
                break;
            case "about":
                var m    = chrome.runtime.getManifest(),
                    str  = '',
                    desc = '';

                desc = '<strong>5DPrint <i>/ fai·di·print /</i> </strong>is '
                    + 'tailor-made for the MakiBox A6 and modern 3D printing. '
                    + 'The UI is designed for simplicity and letting the user '
                    + 'get straight to printing. Devices are automatically '
                    + 'detected and connected to. Moving the extruder around has '
                    + 'never been easier with the interactive print area.';

                str += '<div class="author">' + m.author + '</div>'; 
                str += '<div class="desc">' + desc + '</div>'; 
                str += '<div class="ver">v' + m.version + '</div>'; 

                $('#settings-overlay > .panel.content-right').html(str);
                break;
            default:
                //  shouldn't get here
                console.log(evt.target.id);
                break;
        }
    });
    $('#settings-overlay > div.nav-left > ul > li:first').click();
};

var paClickHandler = function(evt) {
    evt.preventDefault();

    switch($(evt.target).attr('id')) {
    case 'file-picker':
        //  TODO ::
        //  display dropdown that shows recent prints
        //  and allow the user to select one of those files
        //  or they can click "open" to select a new file

        var inp = ($('#fl').length > 0) ? $('#fl') : $('<input id="fl" type="file" accept=".gcode,.gc" class="fi" />');
        $('body').append(inp);
        $(inp).on('change', function(evt) {
            var f = evt.target.files[0],
                fr = new FileReader();

            fr.readAsText(f, 'UTF-8');
            fr.onload = function(evt) { };
            fr.onerror = function(err) {
                notify({ title: "File Load Issue", message: "Error loading file. Please try again." });
            };

            fr.onloadend = function(evt) {
                var fname   = f.name,
                    content = evt.target.result.split('\n');

                active.job.filename = fname;
                active.job.content = content;
                active.job.status = 'pending';
                loadContentToUI(content);

                $('#fl').remove();
                notify({ title: "File Loaded", message: "File loaded and ready for printing" });
            };
        }).click();

        //  clear out old object from canvas
        paths = [];
        resetAndDrawPaths();

        break;
    case 'print-pause':
        if(!active.job.filename || active.job.filename === '') {
            notify({ 
                title: "No File",
                message: "Please load a valid gcode file to print"
            });
            return;
        }

        //  do it
        if(active.job.status == 'pending') {
            $('#print-pause')
                .removeClass('icon-play')
                .addClass('icon-pause');

            active.job.status = 'running';
            active.startPendingJob();

            paths = [];
            resetAndDrawPaths();
            break;
        } 

        //  since we update active.job.status here
        //  the print queue will see this and send
        //  over the pause cmd and leave the queue
        if(active.job.status == 'running') {
            $('#print-pause')
                .removeClass('icon-pause')
                .addClass('icon-play');

            active.job.status = 'paused';
            break;
        }

        if(active.job.status == 'paused') {
            $('#print-pause')
                .removeClass('icon-play')
                .addClass('icon-pause');
            
            active.job.status = 'running';
            active.resumeJob();
            break;
        }

        break;
    case 'reset':
        if(active.job.status == 'running')
            active.hardStop = !0;

        if(active.job.status == 'paused')
            active.resetJob();

        $('#print-pause')
            .removeClass('icon-pause')
            .removeClass('icon-play')
            .addClass('icon-play');
        active.job = new Job();
        $('#progress').css('height', '0');

        paths = [];
        
        hlLayer.clear();
        objLayer.clear();

        break;
    default:
        notify({ title: "Invalid Action", message: "To be honest, not sure how we got to this point: " + $(evt.target).attr('id') });
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
    active.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED });

    // setup projected point indicator
    pp = new Indicator();
    pp.x = osx;
    pp.y = osy;
    pp.color = RED_IND_GHOST;

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

    var p = $(evt.target).parent();

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
        temp = parseInt($(p).parent().find('.req').val(), 10);
    else 
        $(p).parent().find('.req').removeAttr('value');

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
                for(var i in ots) 
                    tmp += ots[i] + '<br>';
                opTxt = tmp + data;
            }
        } else {
            opTxt = '';
            var extra = nlen - LINE_COUNT;
            for(var j = extra; j < nlen; j++)
                opTxt += data.split('<br>')[j];
            opTxt += '<br>';
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
        attachSliderHandlers();
        attachMovers();
    });

    $(document).on('mouseup', function(e) {
        if(mouseDownHandler && mouseDownHandler !== undefined) {
            $(mouseDownHandler).trigger('mouseup');
            mouseDownHandler = undefined;
        }
    });
};

var detachMovers = function() {
    $('.slider').off('click');
    $('.slider > .handle').off('mouseup');
    $('.handle:ui-draggable').draggable('destroy');
};

var movePrintHead = function(offsetX, offsetY) {
    ph.x = offsetX;
    ph.y = offsetY;

    moveSliders(ph.x, ph.y);
    redrawIndicators();
    attachSliderHandlers();
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

    t = ph.y - Math.floor($('#x > .handle').height() / 2) + Math.floor(POINTER_OFFSET / 2);
    $('#x > .handle').css('top', t+'px');

    l = ph.x - Math.floor($('#y > .handle').width() / 2) + Math.floor(POINTER_OFFSET / 2);
    $('#y > .handle').css('left', l+'px');
};

var resetAndDrawPaths = function() {
    objLayer.clear();
    if(paths.length < 1) return;

    objLayer.ctx.beginPath();
    objLayer.ctx.moveTo(paths[0].x, paths[0].y);

    for(var i = 1; i < paths.length; i++) {
        objLayer.ctx.strokeStyle = (paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST;
        objLayer.ctx.lineTo(paths[i].x, paths[i].y);
        objLayer.ctx.closePath();
        objLayer.ctx.stroke();

        objLayer.ctx.beginPath();
        objLayer.ctx.moveTo(paths[i].x, paths[i].y);
    }
    objLayer.ctx.closePath();
};

UI.prototype.redrawIndicators = function() {
    this.phLayer.clear();
    ph.drawFill();

    if(ct !== undefined) ct.drawStroke();
    // if(pp != undefined) pp.drawStroke();
};

UI.prototype.home = function(axis) {
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