'use strict';
var devices,
    activeDev;

function Device(name) {
    this.Name           = name;
    this.JobDuration    = '';
    this.JobStatus      = 'idle';
    this.JobFile        = '';
    this.JobContent     = '';
    this.X              = 0;
    this.Y              = 0;
    this.Z              = 0;
    this.ETemp          = -1;
    this.BTemp          = -1;
    this.EHeaterActive  = 0;
    this.BHeaterActive  = 0;
    this.IsActive       = 0;
}

var attachDevice = function(msg) {
    var d = new Device(msg.DeviceName);

    if(activeDev == undefined)
        setAsActiveDevice(d);

    if(devices == undefined) 
        devices = {};
    devices[d.Name] = d;

    attachDevToUIList(d);
    getDeviceStats(true);
    statTimer = setInterval(getDeviceStats, 1500);
};

var detachDevice = function(msg) {
    if(Object.keys(devices).length == 1) {
        activeDev = devices = undefined;
        window.clearInterval(statTimer);
        detachBtnHandlers();
        detachMovers();
        removeDevsFromUI();
        checkConn();
        return;
    }

    delete devices[msg.DeviceName];
    if(activeDev.Name == msg.DeviceName) {
        for(var d in devices) {
            if(devices.hasOwnProperty(d))
                setAsActiveDevice(devices[d]);
        }
    }
};

var setAsActiveDevice = function(d) {
    activeDev = d;
    d.IsActive = 1;

    attachBtnHandlers();
    attachSliderHandlers();
    attachMovers();
    
    initActiveDevUI(d.Name);

    //  debug
    // $('#console-area > .wrapper > .handle').click();
};

var updateDeviceStats = function(msg) {
    var val, rows, temp;
    rows = msg.Body.split('\n');

    //  strip out the temp data
    for(var i = 0; i < rows.length; i++) {
        if(rows[i].indexOf('T:') > -1 && rows[i].indexOf('B:') > -1) {
            temp = rows[i].split(' ');
            continue;
        }
    }

    //  process temp and heater status
    if(temp && temp != undefined) {
        for(var i = 0; i < temp.length; i++) {
            if(temp[i].indexOf('T') > -1) {
                devices[msg.DeviceName].ETemp = temp[i].split(':')[1];
                continue;
            }

            if(temp[i].indexOf('B') > -1) {
                devices[msg.DeviceName].BTemp = temp[i].split(':')[1];
                continue;
            }
        }
    }

    //  process position


    updateStatsUI(msg);
};

$(document).ready(function() {
    //  
    //  MakiBox A6 only ATM -- so need to go 
    //  back and update to include a method 
    //  to grab from a device profile, rather 
    //  than just hard-coding here
    
    naturals = {
        'EJECT':     'Runs the filament in reverse [x] number of steps',
        'LOAD':      'Runs the filament forward [x] number of steps',
        'DROP BED':  'Runs the bed in the positive [x] number of steps',
        'RAISE BED': 'Runs the bed in the negative [x] number of steps'
    };
});