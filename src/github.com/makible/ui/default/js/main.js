'use strict';

var dbg = 0,
    socket,
    statTimer,
    connTimer,
    deviceName,
    socketAddr  = 'ws://';

$(document).ready(function() {
    //  display "initializing" message
    //  attempt to create a socket and 
    //  see if a device is connected
    //  if no device present, display
    //  "connect or power on device" 
    //  message

    //  display init message
    $('#init').show();

    // start websocket
    socketAddr          += document.URL.substring(6) + "abs";
    
    socket              = new WebSocket(socketAddr);
    socket.onmessage    = onMsg;
    socket.onclose      = onClose;
    // socket.onopen       = ...

    //  attach the btn events to
    //  (hopefully) give the socket time
    //  to initialize -- tho this may be
    //  moot since the call is not exactly
    //  sequencial being Javascript
    attachBtnEvents();

    //  ping core to see if a
    //  device has been attached
    connTimer = setInterval(checkConn, 1000);

    //  ===[ DEBUG ]
    // fakeDevice();
    // showDbg();
});

var manageDevConnection = function(msg) {
    if(msg.DeviceName == '' || msg.DeviceName == 'nil') {
        //  ===[ TODO ]
        //  display no device attached msg
        //  and attach checkConn timer
        // $('#over-msg').html('[WARNING] <br />No device detected. Please attach or power on a valid device.');
        connTimer = setInterval(checkConn, 1500);
        return;
    }

    if(msg.Body == 'attached') {
        $('#init-msg').html('initializing device...');
        deviceName  = msg.DeviceName;

        $('#over-msg').fadeOut(100);
        $('#init')
            .css('z-index', '799')
            .slideUp(1000, function() {
                $('#init').css('z-index', '-1');
            });

        $('#device').html(deviceName);
        statTimer = setInterval(getStats, 1500); 

        //  TODO
        //  send request to see if the device has been homed 
        //  (via M114 for the Makibox A6) and handle accordingly

        /*
            2 sample output responses from Makibox A6 for M114

            "
            go 272 (executing M114)
            -- C: X:0.00000 Y:0.00000 Z:0.00000 E:0.00000 (mm)
            -- X:0 Y:0 Z:0 E:0 (steps)
            -- Axes Homed X:0 Y:0 Z:0
            -- *Not all axes homed! Positions reported may be incorrect!!!
            ok 272 Q64 (2ms execute)
            "
            "
            go 301 (executing M114)
            -- C: X:0.00000 Y:0.00000 Z:0.00000 E:0.00000 (mm)
            -- X:0 Y:0 Z:0 E:0 (steps)
            -- Axes Homed X:0 Y:1 Z:0
            -- *Not all axes homed! Positions reported may be incorrect!!!
            ok 301 Q64 (1ms execute)
            "
        */

        return;
    }

    if(msg.Body == 'detached') {
        window.clearInterval(statTimer);

        $('#device').html('device detached');
        $('#init-msg').html('waiting for device(s)...');
        $('#init')
            .css('z-index', '901')
            .slideDown(1000, function() {
                $('#over-msg').fadeIn(100);
            });

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

    $('.plus-btn').on('click', function(e) {
        var axis = $(e.target).parent().attr('id');
        sendDevMsg('move', { Axis: axis.toUpperCase(), Distance: 5, Speed: -1 });
    });

    $('.minus-btn').on('click', function(e) {
        var axis = $(e.target).parent().attr('id');
        sendDevMsg('move', { Axis: axis.toUpperCase(), Distance: -5, Speed: -1 });
    });

    $('.tempr > .on-btn').on('click', function(e) {
        var heater, inp;
        heater  = $(e.target).parent();
        inp     = $(heater).find('input');

        if(inp != undefined && inp != null) {
            if($(inp).val().length > 0) {
                var tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
                sendDevMsg('temper', { Name: $(heater).attr('id'), Value: parseInt(tmp) });
            } else
                console.log('invalid temperature');
        } else
            console.log('temperature was not dispatched properly');
    });

    $('.tempr > .off-btn').on('click', function(e) {
        var heater = $(e.target).parent().attr('id');
        sendDevMsg('temper', { Name: heater, Value: 0 });
    });

    $('.tempr > input').on('change', function(e) {
        $(e.target).parent().find('.on-btn').click();
    });

    //  canvas click listener (the canvas is essentially a big button) ;)
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
            var h = e.target;
            ph.y = $(h).position().top + Math.floor($(h).height() / 2) + (POINTERVISUALOFFSET / 2);
            redraw();
        }
    });
    $('#y > .handle').draggable({ 
        axis: 'x', 
        containment: [ylb, 0, yrb, 0],
        drag: function(e) {
            var h = e.target;
            ph.x = $(h).position().left + Math.floor($(h).width() / 2) + (POINTERVISUALOFFSET / 2);
            redraw();
        }
    });

    //  TODO
    //  handle this a bit better so that if the user overshoots the
    //  "bounds" / containment, it will strill trigger the mouseup
    $('.handle').on('mouseup', function(e) {
        var xstr, ystr;
        xstr = ' X' + pixelToMillimeter(ph.y);
        ystr = ' Y' + pixelToMillimeter(ph.x);
        sendConsoleMsg('G1'+xstr+ystr);
    });

    $('#init').on('click', function(evt) {
        if($(this).is(':visible')) {
            checkConn();
        }
    });

    //  we'll attach some UI flurishes here
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
        sendDevMsg('job', 'start');

        $('#init')
            .css('z-index', '799')
            .css('cursor', 'auto')
            .css('background-color', 'rgba(0, 0, 0, 0.4)')
            .slideDown(1000, function() {
                $('#over-msg').fadeIn(200);
                $('#over-msg > .init-msg').html('printing in progress');
            })
            .off('click');
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
    }
};

var resume = function() {
    sendDevMsg('interrupt', 'resume');
    
    $('#start').off('click');
    $('#start').on('click', start);
}

var pause = function() {
    sendDevMsg('interrupt', 'pause');

    $('#start').off('click');
    $('#start').on('click', resume);
};

var homer = function(btn) {
    if($(btn).attr('id') == 'ho')
        sendDevMsg('motley', 'motorsoff');
    else {
        var axis = $(btn).html();
        sendDevMsg('home', { Axis: axis.toUpperCase(), Distance: 0, Speed: 0 });

        if(axis != 'z') {
            $(c).off('click');  //  detach canvas click handler

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
                    $(c).on('click', canvasClickHandler);
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

                redraw();
            }, 10);
        }
    }
};

var temper = function(btn) {


    // var heater  = $(btn).parent().parent(),
    //     inp     = $(heater).find('input');
    // if($(btn).hasClass('off')) {
    //     sendDevMsg('temper', { Name: $(heater).attr('id'), Value: 0 });
    // } else {
    //     if(inp != undefined && inp != null) {
    //         if($(inp).val().length > 0) {
    //             var tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
    //             sendDevMsg('temper', { Name: $(heater).attr('id'), Value: parseInt(tmp) });
    //         }else
    //             console.log('INSERT A VALID TEMPERATURE');
    //     } else {
    //         //  something bad happened...
    //         //  apparently there isn't an input
    //         console.log('[WARN] temper was not dispatched properly');
    //     }
    // }
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
        break;

    case 'prefs':
        break;
    
    case 'admin':
        break;
    

    case 'exit':
        break;
    
    default:
        break;
    }
};


//  ===[ SOCKET HANDLERS ]
var onMsg = function(e) {
    if(dbg) console.log(e);

    var msg = JSON.parse(e.data);
    if(msg.Type === 'response') {
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
            console.log(msg);
            break;

        case 'error':
            //  TODO: alert invalid device name
            console.log('[WARN] 5DPrint serv responded with error: ' + msg.Body);
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
    }
};

var onClose = function(e) {
    window.clearInterval(statTimer);
    connTimer = setInterval(checkConn, 1000);
    console.log('[WARN] socket connection closed and stat timer killed');
};

//  ===[ HELPERS ]
var getStats = function() {
    sendDevMsg('status', '');
};

var checkConn = function() {
    sendCoreMsg('connection', '');
    window.clearInterval(connTimer);
};

var updateUIStatus = function(msg) {
    //  TODO:
    //  right now, we're only updating the
    //  temper settings. We'll want to include
    //  other data in the status feedback

    var val,
        rows    = msg.Body.split('\n');

    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('T:') > -1) {
            var stats   = rows[i],
                idx     = 0;
            if(stats.indexOf('ok') != -1) 
                idx = 1;

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
};

var sendCoreMsg = function(action, body) {
    var b = (body.length > 0) ? JSON.stringify(body) : body;

    var msg = JSON.stringify({ Type: 'core', DeviceName: '', Action: action, Body: b });
    socket.send(msg);
};

var sendDevMsg = function(action, body) {
    var msg = JSON.stringify({ Type: 'device', DeviceName: deviceName, Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
};

var sendConsoleMsg = function(msg) {
    sendDevMsg('console', msg);
};

var shipFile = function(evt) {
    var action  = 'load',
        fname   = document.getElementById('floader').files[0].name,
        content = evt.target.result;

    sendDevMsg(action, { Name: fname, Data: content });
    $('#floader').remove();
};

var showDbg = function() {
    dbg = !0;
};

var hideDbg = function() {
    dbg = 0;
};

var fakeDevice = function() {
    window.clearInterval(connTimer);
    manageDevConnection({ Device: 'foo', Body: 'attached' });
    window.clearInterval(statTimer);
};
