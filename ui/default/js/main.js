'use strict';

var dbg = 0,
    socket,
    statTimer,
    connTimer,
    deviceName,
    socketAddr  = 'ws://';



//  WARNING!!!! THE BELOW CODE IS BAD!!!!
// var dn = (isWin()) ? 'COM3' : '/dev/tty.usbmodem001';

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
});

var initUIWithDev = function(msg) {
    if(msg.Device == '') {
        //  ===[ TODO ]
        //  display no device attached msg
        //  and attach checkConn timer
        // $('#over-msg').html('[WARNING] <br />No device detected. Please attach or power on a valid device.');
        connTimer = setInterval(checkConn, 1500);
        return;
    } else {
        $('#over-msg').html('<div class="loader icon-location-1"></div><div class="init-msg">initializing device(s)...</div>');
        deviceName  = msg.Device;
        var greet   = msg.Body;

        //  ===[ TODO ]
        //  display the greeting / firmware
        //  version info in the "status"
        //  display area ...
        // console.log(deviceName);
        // console.log(greet);

        //  init UI button events and 
        //  hide init message
        //  attachBtnEvents();
        $('#over-msg').fadeOut(100);
        $('#init')
            .css('z-index', '799')
            .slideUp(1000, function() {
                $('#init').css('z-index', '-1');
            });

        $('#device').html(deviceName);
        $('#status').html('connected');

        //  start status timer
        statTimer = setInterval(getStats, 1500); 
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
                if($(btn).hasClass('set'))
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

var pause = function() {
    sendDevMsg('job', 'pause');
};

var stop = function() {
    sendDevMsg('job', 'stop');
};

var mover = function(btn) {
    var axis    = $(btn).attr('id').substring(0, 1),
        dir     = ($(btn).hasClass('pos')) ? 'pos' : 'neg',
        island  = (axis == 'x' || axis == 'y') ? 'xy' : axis,
        stp     = $('#' + island + 'steps'),
        spd     = $('#' + island + 'speed');

    //  DO NOT DO anything here
    //  should not use neg. value
    //  in the input field
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
    var axis = $(btn).html().toUpperCase();
    sendDevMsg('home', { Axis: axis, Distance: 0, Speed: 0 });
};

var temper = function(btn) {
    var heater  = $(btn).parent().parent(),
        inp     = $(heater).find('input');

    if(inp != undefined && inp != null) {
        if($(inp).val().length > 0) {
            var tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
            sendDevMsg('temper', { Heater: $(heater).attr('id'), Temp: parseInt(tmp) });
        }else
            console.log('INSERT A VALID TEMPERATURE');
    } else {
        //  something bad happened...
        //  apparently there isn't an input
        console.log('[WARN] temper was not dispatched properly');
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
        case 'status':
            updateUIStatus(msg.Body);
            break;
        case 'dc':
            initUIWithDev(msg);
            break;
        case 'console':
            console.log(msg);
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

    $('#status').html('disconnected');
    console.log('[INFO] socket connection closed and stat timer killed');
};

//  ===[ HELPERS ]
var getStats = function() {
    sendDevMsg('status', '');
};

var checkConn = function() {
    sendCoreMsg('dc', '');
    window.clearInterval(connTimer);
}

var updateUIStatus = function(content) {
    //  TODO:
    //  right now, we're only updating the
    //  temper settings. We'll want to include
    //  other data in the status feedback

    var val,
        rows    = content.split('\n');

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

    var msg = JSON.stringify({ Type: 'core', Device: '', Action: action, Body: b });
    socket.send(msg);
};

var sendDevMsg = function(action, body) {
    var msg = JSON.stringify({ Type: 'device', Device: deviceName, Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
};

var sendConsoleMsg = function(msg) {
    sendDevMsg('console', msg);
}

var shipFile = function(evt) {
    var action  = 'load',
        fname   = document.getElementById('floader').files[0].name,
        content = evt.target.result;

    sendDevMsg(action, { Name: fname, Data: content });
    $('#floader').remove();
};

var sleep = function(ms) {
    var dt = new Date();
    dt.setTime(dt.getTime() + ms);
    while (new Date().getTime() < dt.getTime());
}

// var isWin = function() {
//     return (navigator.appVersion.indexOf("Win") != -1);
// }

var showDbg = function() {
    dbg = !0;
}

var hideDbg = function() {
    dbg = 0;
}


var fakeDevice = function() {
    window.clearInterval(connTimer);
    initUIWithDev({ Device: 'foo', Body: 'bar' });
    window.clearInterval(statTimer);
}
