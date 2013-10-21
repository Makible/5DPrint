'use strict';

//
//  currently supported OSes ::
//  mac, win, cros, linux

var serialPrefix;

var mac = function() {
    serialPrefix = 'tty.usbmodem';
};

var win = function() {
    serialPrefix = 'COM';
};

var cros = function() {
    serialPrefix = '';
};

var linux = function() {
    serialPrefix = 'ttyACM';
};
