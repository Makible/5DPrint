'use strict';

var dbg = 0,
    shaderDown = !0,
    exited = 0,
    socket,
    statTimer,
    connTimer,
    deviceName,
    handlesMouseDown,
    natch,
    socketAddr  = 'ws://';

$(document).ready(function() {
    //  display init message
    $('#init').show();

    socketAddr          += document.URL.substring(6) + "abs";
    socket              = new WebSocket(socketAddr);
    socket.onmessage    = onMsg;
    socket.onclose      = onClose;
    // socket.onopen       = ...


    //  attach button events and connection checker
    attachBtnEvents();
    connTimer = setInterval(checkConn, 500);

    //  ===[ DEBUG HELPERS ]
    // fakeDevice();
    // showDbg();
    // $('#init').slideUp(1000);

    natch = {
        'STOP': ['M112'], 
        'EJECT': ['G92 E0', 'G1 F2000 E-200', 'M84'], 
        'LOAD FILAMENT': ['G92 E0', 'G1 F2000 E200', 'M84'], 
        // 'DROP BED': '',
    };
});

var manageDevConnection = function(msg) {
    //  no device connected, reset checkConn timer
    if(msg.DeviceName == '' || msg.DeviceName == 'nil') {
        connTimer = setInterval(checkConn, 1500);
        return;
    }

    //  inform user initializing and start the stat timer
    if(msg.Body == 'attached') {
        deviceName  = msg.DeviceName;

        $('.init-msg').html('initializing device...');
        $('#device').html(deviceName);

        //  get full list of stats (i.e. temp, position, etc.)
        //  and start the stat timer
        getStats(true); 
        statTimer = setInterval(getStats, 1500); 

        return;
    }

    //  the device was detached and we need to update the
    //  display to hide all the buttons
    if(msg.Body == 'detached') {
        window.clearInterval(statTimer);

        $('#device').html('');
        $('.init-msg').html('waiting for device...');
        $('#init')
            .css('z-index', '901')
            .css('background-color', '#333')
            .css('cursor', 'pointer')
            .slideDown(1000, function() {
                $('#over-msg').fadeIn(100);
                shaderDown = !0;
            });

        $('#progress').fadeOut(100);

        connTimer = setInterval(checkConn, 500);
        return;
    }
};

var attachBtnEvents = function() {
    //  general / generic button events
    $('.btn').each(function() {
        var btn = this;
        $(btn).on('click', function(evt) {
            //  should be a x/y/z button if it
            //  has an id attr 
            if($(btn).attr('id') != undefined) {
                var _h = window[$(btn).attr('id')];
                if(typeof _h === 'function') 
                    _h();
                else {
                    if($(btn).parent().attr('id') === 'homer')
                        homer(btn);
                }             
            }else {
                if($(btn).hasClass('set') || $(btn).hasClass('off'))
                    temper(btn);
            }
        });
    });

    //  motors off button
    $('#mo').on('click', function(e) {
        notifyServer('motley', 'motorsoff');
    });

    //  plus function for Z and E
    $('.plus-btn').on('click', function(e) {
        var axis = $(e.target).parent().attr('id');
        notifyServer('move', { Axis: axis.toUpperCase(), Distance: 5, Speed: -1 });
    });

    //  minus function for Z and E
    $('.minus-btn').on('click', function(e) {
        var axis = $(e.target).parent().attr('id');
        notifyServer('move', { Axis: axis.toUpperCase(), Distance: -5, Speed: -1 });
    });

    //  power on / set the temperature for the heating elements
    $('.tempr > .on-btn').on('click', function(e) {
        var heater, inp;
        heater  = $(e.target).parent();
        inp     = $(heater).find('input');

        if(inp != undefined && inp != null) {
            if($(inp).val().length > 0) {
                var tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
                notifyServer('temper', { Name: $(heater).attr('id'), Value: parseInt(tmp) });
            } else
                console.log('invalid temperature');
        } else
            console.log('temperature was not dispatched properly');
    });

    //  "turn off" the heating elements by setting their temp to zero
    $('.tempr > .off-btn').on('click', function(e) {
        var heater = $(e.target).parent().attr('id');
        notifyServer('temper', { Name: heater, Value: 0 });
    });

    //  update the temp when the user changes it's value by clicking the "on" button
    $('.tempr > input').on('change', function(e) {
        $(e.target).parent().find('.on-btn').click();
    });

    //  canvas click listener (the canvas is essentially a big button) ;)
    $(phLayer.canvas).on('click', canvasClickHandler);

    //  ghosting indicator ring for clicker
    $(phLayer.canvas).on('mousemove', function(e) {
        if(ct == undefined) {
            ct = new Indicator();
            ct.color = 'rgba(222, 222, 222, 0.4)';
        }

        ct.x = e.offsetX - POINTERVISUALOFFSET;
        ct.y = e.offsetY - POINTERVISUALOFFSET;
        redrawIndicators();
    });
    $(phLayer.canvas).on('mouseout', function(e) {
        ct = undefined;
        redrawIndicators();
    });

    //  TODO
    //  show ghosting indicator similar to when clicking in the grid
    //  rather than moving the blue indicator
    var xtb, xbb, ylb, yrb;
    xtb = $('#x').position().top + 54;  //  54 was found through trial and error
    xbb = xtb + $('#x').height();
    ylb = $('#y').position().left;
    yrb = ylb + $('#y').width();

    $('#x > .handle').draggable({ 
        axis: 'y', 
        containment: [0, xtb, 0, xbb],
        drag: function(e) {
            handlesMouseDown = e.target;
            ph.y = $(handlesMouseDown).position().top + Math.floor($(handlesMouseDown).height() / 2) + Math.floor(POINTERVISUALOFFSET / 2);
            redrawIndicators();
        }
    });
    $('#y > .handle').draggable({ 
        axis: 'x', 
        containment: [ylb, 0, yrb, 0],
        drag: function(e) {
            handlesMouseDown = e.target;
            ph.x = $(handlesMouseDown).position().left + Math.floor($(handlesMouseDown).width() / 2) + Math.floor(POINTERVISUALOFFSET / 2);
            redrawIndicators();
        }
    });

    //  TODO
    //  handle this a bit better so that if the user overshoots the
    //  "bounds" / containment, it will strill trigger the mouseup
    $('.slider > .handle').on('mouseup', function(e) {
        handlesMouseDown = undefined;

        var xstr, ystr;
        xstr = ' X' + pixelToMillimeter(ph.y);
        ystr = ' Y' + pixelToMillimeter(ph.x);
        sendConsoleMsg('G1'+xstr+ystr);
    });

    $(document).on('mouseup', function(e) {
        if(handlesMouseDown && handlesMouseDown != undefined) {
            $(handlesMouseDown).trigger('mouseup');
            handlesMouseDown = undefined;
        }
    });

    $('#console > .wrapper > .handle').on('click', openConsole);
    $('#console > input').on('click', function(e) {
        $(this).val('').removeClass('ghost');
        openConsole(e);
    });
    $('#console > input').on('blur', function(e) {
        $(this).addClass('ghost').val('enter manual commands here');
    });
    $('#console > input').on('change', function(e) {
        if($(this).val() != '' || $(this).val().length > 2) {
            if(natch[$(this).val()] != undefined && natch[$(this).val()] != undefined) {
                $(natch[$(this).val()]).each(function(e) {
                    sendConsoleMsg(this);
                });
            } else
                sendConsoleMsg($(this).val());
        }
        $(this).blur();
    });

    //  fall back for forcing the UI to have the App server check for an
    //  attached device. Right now, on some refreshes it won't update
    //  properly if a device is attached -- not sure why
    $('#init').on('click', function(evt) {
        if($(this).is(':visible'))
            checkConn();
    });
};

var nav = function() {
    $('#menu').toggle();
    if($('#menu').is(':visible')) {
        $('#nav').addClass('nav-hover');

        $('#menu')
            .find('.btn')
            .each(function() {
                var btn = this;
                $(btn).off('click')
                      .on('click', function(evt) {
                        menus(btn);
                        $('#nav').click();
                    });
                });
    }else {
        $('#nav').removeClass('nav-hover');
    }
};

var start = function() {
    if($('#file').html() != '') {
        window.clearInterval(statTimer);    //  stop the UI stat request
        notifyServer('job', 'start');
        initPrintUI();
    }else {
        var inp = $('<input id="floader" type="file" accept=".gcode" class="fi" />');
        $('body').append(inp);
        $(inp).on('change', function(evt) {
            var f = this.files[0],
                r = new FileReader();

            r.readAsText(f, 'UTF-8');
            r.onload = shipFile;
            // r.onloadstart = ...
            // r.onprogress = ... <-- allows you to update a progress bar.
            // r.onabort = ...
            // r.onerror = ...
            r.onloadend = function(evt) {
                start();
            };

            $('#file').html(f.name);
        });
        $(inp).click();

        paths = new Array();
        resetAndDrawPaths();
    }
};

var resume = function() {
    notifyServer('interrupt', 'resume');
    
    $('#start').off('click');
    $('#start').on('click', start);
}

var pause = function() {
    notifyServer('interrupt', 'pause');

    $('#start').off('click');
    $('#start').on('click', resume);
};

var homer = function(btn) {
    var axis = $(btn).html();
    notifyServer('home', { Axis: axis.toUpperCase(), Distance: 0, Speed: 0 });

    if(axis == 'all') {
        $('#homer > .btn').each(function() {
            $(this).css('background-color', '#fff')
                    .css('color', '#333');
        });
    } else {
        $(btn).css('background-color', '#fff')
              .css('color', '#333');
    }

    if(axis != 'z') {
        $(phLayer.canvas).off('click');  //  detach canvas click handler

        var dx, dy, sx, sy, err;
        dx = Math.abs(ph.x);
        dy = Math.abs(ph.y);
        sx = sy = -1;
        err = dx - dy;

        var i = setInterval(function(e) {
            if((axis == 'all' && ph.x == 0 && ph.y == 0)
                || (axis == 'x' && ph.y == 0)
                || (axis == 'y' && ph.x == 0)) {
                window.clearInterval(i);
                $(phLayer.canvas).on('click', canvasClickHandler);
                return;
            }

            var e = 2 * err;
            if(axis == 'all') {
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
            }

            if(axis == 'y') {
                ph.x += sx;
                var l = $('#y > .handle').position().left + sx;
                $('#y > .handle').css('left', l+'px');
            }

            if(axis == 'x') {
                ph.y += sy;
                var t = $('#x > .handle').position().top + sy;
                $('#x > .handle').css('top', t+'px');
            }

            redrawIndicators();
        }, 10);
    }
};

var menus = function(btn) {
    switch ($(btn).attr('id')) {
    case 'load':
        //  open file dialog
        var inp = $('<input id="floader" type="file" accept=".gcode" class="fi" />');
        $('body').append(inp);
        $(inp).on('change', function(evt) {
            var f = this.files[0],
                r = new FileReader();

            r.readAsText(f, 'UTF-8');
            r.onload = shipFile;
            // r.onloadstart = ...
            // r.onprogress = ... <-- allows you to update a progress bar.
            // r.onabort = ...
            // r.onerror = ...
            // r.onloadend = ...

            $('#file').html(f.name);
        });
        $(inp).click();

        paths = new Array();
        resetAndDrawPaths();

        break;

    case 'prefs':
        break;
    
    case 'exit':
        notifyServer('shutdown', '');
        exited = !0;
        socket.close();

        break;
    
    default:
        break;
    }
};

var getStats = function(full) {
    notifyServer('status', (full) ? 'full' : '');
};

var checkConn = function() {
    notifyServer('connection', '');
    window.clearInterval(connTimer);
};

var updateUIStatus = function(msg) {
    if(msg.Body == 'job in progress') {
        //  TODO
        //  request printed file from server to 
        //  update data on the UI
        window.clearInterval(statTimer);
        initPrintUI();
        return;
    }

    //  do this seperately from all the other data
    updateTempDisplay(msg);

    if(msg.Body.indexOf('--FULL STATS') > -1) {
        var stats, output;

        stats = msg.Body.substring(msg.Body.indexOf('--FULL STATS') + 12);
        output = $('#console > .wrapper > .output');

        $(output).append(stats.replace(/\n/g, '<br />'));
        $(output).animate({ scrollTop: $(output)[0].scrollHeight }, 800);
    }

    //  display the status of a running job
    if(msg.Body.indexOf('--JOB STAT REPORT') > -1) {
        var data, cmd, dr, ln, nl, cd, et;
        data = msg.Body.split('\n');

        for(var i = 0; i < data.length; i++) {
            if(data[i].indexOf('--COMMAND: G1') == 0) {
                cmd = data[i].split(' ');
                dr  = data[i+2] + '<br />' + data[i+3];
                continue;
            }

            if(data[i].indexOf('--FILE LINE: ') > -1) {
                ln = $.trim(data[i].split(':')[1]);
                nl = $.trim(data[i+1].split(':')[1]);

                continue;
            }

            if(data[i].indexOf('--CURRENT DURATION: ') > -1) {
                cd = $.trim(data[i].split(':')[1]);
                et = $.trim(data[i+1].split(':')[1]);

                continue;
            }
        }

        if(cmd && cmd != undefined) {
            var tmp = cmd.toString().replace(/,/g, ' ');
            var output = $('#console > .wrapper > .output');
            $(output).append(tmp.split(':')[1] + '<br />');
            $(output).scrollTop($(output)[0].scrollHeight);

            //  for every Z movement, we'll need to close the path for
            //  clear the screen and draw the new path coords
            if(cmd.toString().indexOf('Z') > -1) {
                objLayer.ctx.closePath();
                objLayer.ctx.clearRect(0, 0, w, h);
                objLayer.ctx.beginPath();

                redrawIndicators();
                return;
            }

            //  we'll need to flip the X and Y here because of the
            //  way the physical printer is versus the screen X and Y
            var mx, my;
            for(var i = 0; i < cmd.length; i++) {
                // get cmd X value and set to my
                if(cmd[i].indexOf('X') > -1)
                    my = millimeterToPixel(cmd[i].substring(1));

                // get cmd Y value and set to mx
                if(cmd[i].indexOf('Y') > -1)
                    mx = millimeterToPixel(cmd[i].substring(1));
            }


            var yw, xh;
            yw = mx - (Math.floor($('#y > .handle').width() / 2)) - Math.floor(POINTERVISUALOFFSET / 2);
            xh = my - (Math.floor($('#x > .handle').height() / 2)) - Math.floor(POINTERVISUALOFFSET / 2);

            ph.x = mx;
            ph.y = my;

            $('#y > .handle').css('left', yw + 'px');
            $('#x > .handle').css('top', xh + 'px');

            //  only draw the new path here
            objLayer.ctx.strokeStyle = '#ffc0cb';
            objLayer.ctx.lineTo(mx, my);
            objLayer.ctx.moveTo(mx, my);
            objLayer.ctx.stroke();

            redrawIndicators();
        }

        if(ln && nl && ln != undefined && nl != undefined) {
            var val = Math.floor((ln / nl) * 100);
            if(val != 0 && $('.prog-complete').html().toLowerCase() != 'completed: <span style="color:#ffc0cb;">' + val + '%</span>') 
                $('.prog-complete').html('completed: <span style="color:#ffc0cb;">' + val + '%</span>');
        }

        if(dr && dr != undefined) {
            $('#console > .wrapper > .output').append(dr.toString());
            $('#console > .wrapper > .output').scrollTop($('#console > .wrapper > .output')[0].scrollHeight);
        }

        if(cd && et && cd != undefined && et != undefined) {
            if($('.prog-est').html() == '') 
                $('.prog-est').html('estimated: <span style="color:#ffc0cb;">' + et + '</span>');
            $('.prog-current').html('time passed: <span style="color:#ffc0cb;">' + cd + '</span>');
        }

        // console.log(data);

        return;
    }

    //  display init UI data
    var rows, homedData, posData;
    rows = msg.Body.split('\n');

    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('-- Axes Homed') > -1 ) {
            homedData = rows[i].split(' ');
            continue;
        }

        if(rows[i].indexOf('-- C: X:') > -1) {
            posData = rows[i].split(' ');
            continue;
        }
    }

    //  process homing values and update accordingly
    if(homedData && homedData != undefined) {
        for(var i = 0; i < homedData.length; i++) {
            if(homedData[i].indexOf('X') > -1) {
                if(homedData[i].substring(2) == 0) {
                    $('#hx').css('background-color', '#da4b39')
                            .css('color', '#fff');
                }
                continue;
            }

            if(homedData[i].indexOf('Y') > -1) {
                if(homedData[i].substring(2) == 0) {
                    $('#hy').css('background-color', '#da4b39')
                            .css('color', '#fff');
                }
                continue;
            }

            if(homedData[i].indexOf('Z') > -1) {
                if(homedData[i].substring(2) == 0) {
                    $('#hz').css('background-color', '#da4b39')
                            .css('color', '#fff');
                }
                continue;
            }
        }
    }

    //  process position values and update canvas accordingly
    if(posData && posData != undefined) {
        for(var i = 0; i < posData.length; i++) {
            if(posData[i].indexOf('X:') > -1 && posData[i].indexOf('X:0.0') <= -1 ) {
                var val, t;
                val = millimeterToPixel(posData[i].substring(2)) - POINTERVISUALOFFSET;
                t   = $('#x > .handle').position().top + val;

                ph.y = val;
                $('#x > .handle').css('top', t+'px');

                continue;
            }

            if(posData[i].indexOf('Y:') > -1 && posData[i].indexOf('Y:0.0') <= -1) {
                var val, l;
                val = millimeterToPixel(posData[i].substring(2)) - POINTERVISUALOFFSET;
                l   = $('#y > .handle').position().left + val;

                ph.x = val;
                $('#y > .handle').css('left', l+'px');

                continue;
            }
        }
        redrawIndicators();
    }

    if(shaderDown) {
        $('#over-msg').fadeOut(100);
        $('#init')
            .css('z-index', '799')
            .slideUp(1000, function() {
                $('#init').css('z-index', '-1');
            });
        shaderDown = 0;
    }
};

//  drop the shader down, hide the 'message' box
//  and show the print status indication area
var initPrintUI = function() {
    $('#init')
        .css('z-index', '799')
        .css('cursor', 'auto')
        .css('background-color', 'rgba(0, 0, 0, 0.4)')
        .slideDown(1000, function() {
            $('#progress').fadeIn(100);
            $('.prog-complete').html('completed: <span style="color:#ffc0cb;">0%</span>');
        })
        .off('click');

    if($('#over-msg').is(':visible')) $('#over-msg').hide();

    //  just in case the X/Y/Z haven't been homed, the gcode
    //  will usually do this, so we'll update the UI as such
    $('#hx').css('background-color', '#fff')
            .css('color', '#333');
    $('#hy').css('background-color', '#fff')
            .css('color', '#333');
    $('#hz').css('background-color', '#fff')
            .css('color', '#333');

    // $('.prog-status').html('initializing print, please wait...');

    //  reset paths just before printing
    paths = new Array();
    resetAndDrawPaths();
};

//  this should update only the temperature UI elements
var updateTempDisplay = function(msg) {
    var val, rows, tempData;
    rows = msg.Body.split('\n');

    //  pull out only the temp data
    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('T:') > -1 && rows[i].indexOf('B:') > -1) {
            tempData = rows[i].split('\n');
            continue;
        }
    }

    //  process temp data and display
    if(tempData && tempData != undefined) {
        for(var i = 0; i < tempData.length; i++) {
            if(tempData[i].indexOf('T:') > -1) {
                var stats   = tempData[i],
                    idx     = 0;
                if(stats.indexOf('ok') != -1)  idx = 1;

                var he      = stats.split(' ')[idx],
                    hb      = stats.split(' ')[idx + 2],
                    span    = '&deg;<span class="deg">C</span>';

                if(he == undefined || hb == undefined) return;

                val = he.substring(2, he.length);
                $('#extruder1').find('.actual').html(val + span);

                val = hb.substring(2, hb.length);
                $('#hotbed').find('.actual').html(val + span);

                if(dbg) 
                    console.log('[DBG] RAW: ' + stats);
            }
        }
    }
};

//  send messages to the app server
var notifyServer = function(action, body) {
    var msg = JSON.stringify({ DeviceName: deviceName, Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
};

var sendConsoleMsg = function(cmd) {
    notifyServer('console', cmd);
};

//  send the file to the app server to be processed / printed
var shipFile = function(evt) {
    var action  = 'load',
        fname   = document.getElementById('floader').files[0].name,
        content = evt.target.result;

    //  TODO
    //  check to see if ...files[0].name caused an error 
    //  and handle appropriately

    var cmds = content.split('\n');
    paths = new Array();
    paths.push({ x: 0, y: 0 });

    //  loop through the file, getting each 'G1' line and loading the
    //  x / y coords into the paths array, ignoring the commented rows
    for(var i = 0; i < cmds.length; i++) {
        if(cmds[i] && cmds[i] != undefined
            && (cmds[i].indexOf(';') == -1 || cmds[i].indexOf(';') > 1) 
            && (cmds[i].indexOf('G1 X') > -1 || cmds[i].indexOf('G1 Y') > -1)) {

            var move, mx, my;
            move = cmds[i].split(' ');

            for(var j = 0; j < move.length; j++) {
                if(move[j].indexOf('X') > -1)
                    mx = millimeterToPixel(move[j].substring(1));

                if(move[j].indexOf('Y') > -1)
                    my = millimeterToPixel(move[j].substring(1));
            }

            paths.push({ x: my, y: mx });
        }
    }

    //   if for some reason the file doesn't pan out right, reset paths
    if(paths.length == 1) 
        paths = new Array();

    resetAndDrawPaths();

    //  send the file to the server and cleanup
    notifyServer(action, { Name: fname, Data: content });
    $('#floader').remove();
};

//  used for debugging
var fakeDevice = function() {
    window.clearInterval(connTimer);
    manageDevConnection({ Device: 'foo', Body: 'attached' });
    window.clearInterval(statTimer);

    //  TODO
    //  set a nice little timer and then feed in a fake
    //  full stat message to display
};

var openConsole = function(e) {
    var console = $('#console > .wrapper');
    $(console).animate({ bottom: '+=302px' }, 800);
    $(console).find('.handle')
        .off('click')
        .on('click', closeConsole);
    $('#console > input')
        .off('click')
        .on('click', function(e) { $(this).val('').removeClass('ghost'); })
        .css('border-top', '1px solid #dfdfdf');
};

var closeConsole = function(e) {
    var console = $('#console > .wrapper');
    $(console).animate({ bottom: '-=302px' }, 800)
    $(console).find('.handle')
        .off('click')
        .on('click', openConsole);
    $('#console > input')
        .off('click')
        .on('click', function(e) { 
            $(this).val('').removeClass('ghost'); 
            $(console).find('.handle').click();
        })
        .css('border-top', 'none');

};

//  ===[ SOCKET HANDLERS ]
var onMsg = function(e) {
    if(dbg) console.log(e);

    var msg = JSON.parse(e.data);
    switch(msg.Action) {
    case 'job':
        if(msg.Body == "complete") {
            $('#over-msg').fadeOut(100);
            $('#init')
                .css('z-index', '799')
                .slideUp(1000, function() {
                    $('#init').css('z-index', '-1');
                });
                
            $('#file').html('');
            statTimer = setInterval(getStats, 1500);
        }
        break;

    case 'status':
        updateUIStatus(msg);
        break;

    case 'connection':
        manageDevConnection(msg);
        break;

    case 'console':
        var output = $('#console > .wrapper > .output');
        $(output).append(msg.Body.replace(/\n/g, '<br />'));
        $(output).animate({ scrollTop: $(output)[0].scrollHeight }, 800);
        break;

    case 'error':
        $('#console > .wrapper > .output').append('[WARN] 5DPrint serv responded with error: ' + msg.Body)
        if(msg.Body.indexOf('invalid device name') > -1) {
            msg.Body = 'detached';
            manageDevConnection(msg);
        }

        break;

    default:
        // console.log("[WARN] doesn't appear to be a valid action");
        if(dbg)
            console.log(msg);
        break;
    }
};

var onClose = function(e) {
    window.clearInterval(statTimer);

    $('#device').html('');
    if(!exited)
        $('.init-msg').html('server offline');
    else
        $('.init-msg').html('see ya next time!');

    $('#init')
        .css('z-index', '901')
        .css('background-color', '#333')
        .css('cursor', 'pointer')
        .slideDown(1000, function() {
            $('#over-msg').fadeIn(100);
            shaderDown = !0;
        });
    $('#progress').fadeOut(100);
    connTimer = setInterval(checkConn, 500);

    console.log('[WARN] socket connection closed and stat timer killed');
};
