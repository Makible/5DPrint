const CMD_TERMINATOR = '\r\n';
const NOTIFY_ICON = 'img/icon_128.png';
const MKB_FLAG ='MakiBox Firmware';
const NATURALS = {
    'DROP':  'G1 Z80 F2000\r\n',
    'RAISE': 'G1 Z0 F2000\r\n',
    'LOAD':  'G92 E0\r\nG1 F2000 E250\r\n',
    'EJECT': 'G92 E0\r\nG1 F2000 E-250\r\n',
    'MOFF':  'M84\r\n'
};

//  rs Responses
var resends = {
    CS_OOR:  '(checksum out of range)',
    CS_INV:  '(incorrect checksum - should be ',
    CMD_OOR: '(command code out of range)',
    CMD_MSS: '(command code missing)'
};

var commands = {
    MOVE: 'G1',
    HOME: 'G28',
    SET_POS: 'G92',
    SET_ABS_EXT: 'M82',

    ENABLE_TEMP_MONITOR: 'M203 P1' + CMD_TERMINATOR,
    DISABLE_TEMP_MONITOR: 'M203 P0' + CMD_TERMINATOR,

    GET_TEMP:          'M105' + CMD_TERMINATOR,
    SET_BDTEMP:        'M140 S',
    SET_EXTEMP:        'M104 S',
    POSITION:          'M114' + CMD_TERMINATOR,
    CAPABILITIES:      'M115' + CMD_TERMINATOR,
    ENDSTOP_STATE:     'M119' + CMD_TERMINATOR,
    MEM_SETTINGS:      'M503' + CMD_TERMINATOR,
    FREE_RAM:          'M603' + CMD_TERMINATOR,
    FMWARE_INFO:       'M608' + CMD_TERMINATOR,
    MOTORS_OFF:        'M84'  + CMD_TERMINATOR,
    SET_WAIT_BDTEMP:   'M190 S',
    SET_WAIT_EXTEMP:   'M109 S',

    JOB_PAUSE:  'M226 P1' + CMD_TERMINATOR,
    JOB_RESUME: 'M226 P0' + CMD_TERMINATOR,
    JOB_ABDN:   'M226 P-255' + CMD_TERMINATOR,

    BOOT: []
};

commands.BOOT[0] = commands.ENABLE_TEMP_MONITOR;
commands.BOOT[1] = commands.SET_ABS_EXT;
commands.BOOT[2] = commands.GET_TEMP;
commands.BOOT[3] = commands.POSITION;
commands.BOOT[4] = commands.CAPABILITIES;
commands.BOOT[5] = commands.ENDSTOP_STATE;
commands.BOOT[6] = commands.MEM_SETTINGS;
commands.BOOT[7] = commands.FREE_RAM;
