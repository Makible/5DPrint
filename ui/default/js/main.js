'user strict';

//  TODO: 
//  hardcoding  the addr for now, 
//  but should have server provide
//  this info in the near future
var socket,
    statTimer,
    socketAddr  = 'ws://localhost:8080/socket';

$(document).ready(function() {
    attachBtnEvents();

    //  start socket
    socket              = new WebSocket(socketAddr);
    socket.onmessage    = onMsg;
    socket.onclose      = onClose;

    //  start status timer
    //  statTimer = setInterval(getStats, 500);
     statTimer = setInterval(getStats, 1000);
});

//  TODO:
//  pause the getStats timer while a long function
//  (like homing) is being done, to reduce the risk
//  of overflowing the MCU
//  ... will this apply for prints(?)

var attachBtnEvents = function() {
    $('.btn').each(function() {
        var btn = this;
        $(btn).on('click', function(evt) {
            if($(btn).attr('id') != undefined) {
                var _h = window[$(btn).attr('id')];
                if(typeof _h === 'function') 
                    _h();
                else {
                    //  possibly a 'home' button
                    if($(btn).parent().attr('id') === 'home')
                        homer(btn);
                }
            } else {
                //  this probably a button like the plus/
                //  minus buttons or the temp set... 
                //  should handle appropriately
                if($(btn).hasClass('plus') || $(btn).hasClass('minus'))
                    mover(btn);

                if($(btn).hasClass('set'))
                    temper(btn);
            }
        });
    });
};

var nav = function() {
    $('#menu').toggle();
    if($('#menu').is(':visible')) {
        $('#menu')
            .find('.btn')
            .each(function() {
                var btn = this;
                $(btn).off('click')
                      .on('click', function(evt) {
                        menus(btn);
                    });
                });
    }
};

var start = function() {
    console.log('start');
    sendDevMsg('start', '... some stl file ...');
};

var pause = function() {
    console.log('pause');

};

var stop = function() {
    console.log('stop');

};

var mover = function(btn) {
    var mvr = $(btn).parent(),
        stp = $(mvr).find('.steps'),
        spd = $(mvr).find('.speed');

    //  do not do anything here
    //  should not use neg. value
    if(parseInt($(stp).val()) < parseInt($(stp).attr('min')) || 
        parseInt($(spd).val()) < parseInt($(spd).attr('min')))
        return;

    distance = (parseInt($(stp).val()) > parseInt($(stp).attr('max'))) ? $(stp).attr('max') : $(stp).val();
    speed    = (parseInt($(spd).val()) > parseInt($(spd).attr('max'))) ? $(spd).attr('max') : $(spd).val();

    //  so this sorta negates the previous
    //  "do not do...", but it makes sense
    //  because the user should type the neg
    //  value, the button press will determine
    //  except for the z axis
    if(($(mvr).attr('id') != 'z' && $(btn).hasClass('minus')) ||
        ($(mvr).attr('id') == 'z' && $(btn).hasClass('plus')))
            distance *= -1;

    sendDevMsg('move', { Axis: $(mvr).attr('id').toUpperCase(), Distance: parseInt(distance), Speed: parseInt(speed) });
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
            tmp = (parseInt($(inp).val()) > parseInt($(inp).attr('max'))) ? $(inp).attr('max') : $(inp).val();
            sendDevMsg('temper', { Heater: $(heater).attr('id'), Temp: parseInt(tmp) });
        }else
            console.log('INSERT A VALID TEMPERATURE');
    } else {
        //  something bad happened...
        //  apparently there isn't an input
    }
};

var menus = function(btn) {
    switch ($(btn).attr('id')) {
    case 'load':
        clearInterval(statTimer);
        //  open file dialog
        var inp = $('<input id="floader" type="file" accept=".gcode" class="fi" />');
        $('body').append(inp);
        $(inp).on('change', function(evt) {
            //  TODO:
            //  read in file and send to server
            var f = this.files[0],
                r = new FileReader();

            r.readAsText(f, 'UTF-8');
            r.onload = shipFile;
            //r.onloadstart = ...
            //r.onprogress = ... <-- Allows you to update a progress bar.
            //r.onabort = ...
            //r.onerror = ...
            //r.onloadend = ...
        });
        $(inp).click();
        break;

    case 'olds':
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
}


//  ===[ SOCKET HANDLERS ]
var onMsg = function(e) {
    msg = JSON.parse(e.data);
    if(msg.Type === "response") {
        switch(msg.Action) {
        case "status":
            updateUIStatus(msg.Body);
            break;
        default:
            console.log("[WARN] doesn't appear to be a valid action");
            break;
        }
    }
};

var onClose = function(e) {
    window.clearInterval(statTimer);
    console.log('[INFO] socket connection closed and stat timer killed');
};


//  ===[ HELPERS ]
var getStats = function() {
    sendDevMsg('status', '');
};

var updateUIStatus = function(content) {
    //  TODO:
    //  right now, we're only updating the
    //  temper settings. We'll want to include
    //  other data in the status feedback

    console.log(content);
};

var sendCoreMsg = function(action, body) {
    msg = JSON.stringify({ Type: 'core', Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
};

var sendDevMsg = function(action, body) {
    msg = JSON.stringify({ Type: 'device', Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
};

var shipFile = function(evt) {
    var action  = 'print',
        fname   = document.getElementById('floader').files[0].name,
        content = evt.target.result;

    sendDevMsg(action, { Name: fname, Data: content });
    $('#floader').remove();
    $('#nav').click();
};