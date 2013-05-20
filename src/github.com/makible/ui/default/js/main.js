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
    socket.onopen       = function() { $('#status').html('connected'); };

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

        //  update basic info and start
        //  the status request timer
        if($('#status').html() != 'connected')
            $('#status').html('connected');

        $('#device').html(deviceName);
        statTimer = setInterval(getStats, 1500); 

        return;
    }

    if(msg.Body == 'detached') {
        window.clearInterval(statTimer);

        $('#device').html('device detached');
        $('#status').html('WARNING');

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

                    if($(btn).parent().attr('id') === 'controller')
                        mover(btn);
                }             
            }else {
                if($(btn).hasClass('set') || $(btn).hasClass('off'))
                    temper(btn);
            }
        });
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
    if($('#file').html() != '' && $('#status').html() == 'loaded') {
        window.clearInterval(statTimer);    //  stop the UI stat request
        sendDevMsg('job', 'start');

        $('#status').html('printing');
        $('#init')
            .css('z-index', '799')
            .css('cursor', 'auto')
            .slideDown(1000, function() {
                $('#over-msg').fadeIn(200);
                $('#over-msg > .init-msg').html('printing in progress');
            })
            .off('click');
    }else {
        //  notify 'nothing to print'
        // $('#status').html('no file');

        var inp = $('<input id="floader" type="file" accept=".gcode" class="fi" />');
        $('body').append(inp);
        $(inp).on('change', function(evt) {
            var f = this.files[0],
                r = new FileReader();

            r.readAsText(f, 'UTF-8');
            r.onload = shipFile;
            r.onloadstart = function(evt) {
                $('#status').html('loading');
            };
            // r.onprogress = ... <-- allows you to update a progress bar.
            // r.onabort = ...
            // r.onerror = ...
            r.onloadend = function(evt) {
                $('#status').html('loaded');
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

var mover = function(btn) {
    var axis    = $(btn).attr('id').substring(0, 1),
        dir     = ($(btn).hasClass('pos')) ? 'pos' : 'neg',
        island  = (axis == 'x' || axis == 'y') ? 'xy' : axis,
        stp     = $('#' + island + 'steps'),
        spd     = $('#' + island + 'speed');

    //  do NOT do anything here
    //  should not use neg. value in the input field
    if(parseInt($(stp).val()) < parseInt($(stp).attr('min')) || 
        parseInt($(spd).val()) < parseInt($(spd).attr('min')))
        return;

    //  ===[ TODO ]
    //  display neg number warning

    var distance = (parseInt($(stp).val()) > parseInt($(stp).attr('max'))) ? $(stp).attr('max') : $(stp).val();
    var speed    = (parseInt($(spd).val()) > parseInt($(spd).attr('max'))) ? $(spd).attr('max') : $(spd).val();

    //  so this sorta negates the previous
    //  "do not do...", but it makes sense
    //  because the user should not type the 
    //  neg value, the button press will 
    //  determine this, except for 'z'
    if(dir == 'neg')
        distance *= -1;

    if(axis == 'e')
        axis += '1';

    sendDevMsg('move', { Axis: axis.toUpperCase(), Distance: parseInt(distance), Speed: parseInt(speed) });
};

var homer = function(btn) {
    if($(btn).attr('id') == 'ho')
        sendDevMsg('motley', 'motorsoff');
    else {
        var axis = $(btn).html().toUpperCase();
        sendDevMsg('home', { Axis: axis, Distance: 0, Speed: 0 });
    }
};

var temper = function(btn) {
    var heater  = $(btn).parent().parent(),
        inp     = $(heater).find('input');
    if($(btn).hasClass('off')) {
        sendDevMsg('temper', { Name: $(heater).attr('id'), Value: 0 });
    } else {
        if(inp != undefined && inp != null) {
            if($(inp).val().length > 0) {
                var tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
                sendDevMsg('temper', { Name: $(heater).attr('id'), Value: parseInt(tmp) });
            }else
                console.log('INSERT A VALID TEMPERATURE');
        } else {
            //  something bad happened...
            //  apparently there isn't an input
            console.log('[WARN] temper was not dispatched properly');
        }
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
            r.onloadstart = function(evt) {
                $('#status').html('loading');
            };
            // r.onprogress = ... <-- allows you to update a progress bar.
            // r.onabort = ...
            // r.onerror = ...
            r.onloadend = function(evt) {
                $('#status').html('loaded');
            };

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
    $('#status').html('ws closed');
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
                span    = '<span class="deg">&deg;C</span>';

            if(he == undefined || hb == undefined) return;

            val = he.substring(2, he.length);
            $('#hotend').find('.actual').html(val + span);

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
