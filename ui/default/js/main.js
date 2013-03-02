'user strict';

//  TODO: 
//  hardcoding  the addr for now, 
//  but should have server provide
//  this info in the near future
var socket,
    socketAddr = 'ws://localhost:8080/socket';

$(document).ready(function() {
    attachBtnEvents();

    //  start socket
    socket              = new WebSocket(socketAddr);
    socket.onmessage    = onMsg;
    socket.onclose      = onClose;
});

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
};

var start = function() {
    console.log('start');

    send('start', '... some stl file ...');
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
    send('home', { Axis: axis, Distance: 0, Speed: 0 });
};

var temper = function(btn) {
    console.log('temper');

};

var onMsg = function(e) {
    console.log(JSON.parse(e.data));
}

var onClose = function(e) {
    console.log('[INFO] socket connection closed');
}

var sendCoreMsg = function(action, body) {
    msg = JSON.stringify({ Type: 'core', Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
}

var sendDevMsg = function(action, body) {
    msg = JSON.stringify({ Type: 'device', Action: action, Body: JSON.stringify(body) });
    socket.send(msg);
}