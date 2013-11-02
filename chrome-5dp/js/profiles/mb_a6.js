const CMD_TERMINATOR = '\r\n';
const NOTIFY_ICON = 'img/icon_128.png';
const MKB_FLAG ='MakiBox Firmware';
const NATURALS = { 
    'DROP':  'G1 Z80 F2000\r\n', 
    'RAISE': 'G1 Z0 F2000\r\n', 
    'LOAD':  'G92 E0\r\nG1 F2000 E250\r\nM84\r\n', 
    'EJECT': 'G92 E0\r\nG1 F2000 E-250\r\nM84\r\n',
    'MOFF':  'M84\r\n'
};

function Commands() {
    this.MOVE    = 'G1';
    this.HOME    = 'G28';
    this.SET_POS = 'G92';

    this.GET_TEMP        = 'M105' + CMD_TERMINATOR;
    this.SET_BDTEMP      = 'M140 S';
    this.SET_EXTEMP      = 'M104 S';
    this.POSITION        = 'M114' + CMD_TERMINATOR;
    this.CAPABILITIES    = 'M115' + CMD_TERMINATOR;
    this.ENDSTOP_STATE   = 'M119' + CMD_TERMINATOR;
    this.MEM_SETTINGS    = 'M503' + CMD_TERMINATOR;
    this.FREE_RAM        = 'M603' + CMD_TERMINATOR;
    this.FMWARE_INFO     = 'M608' + CMD_TERMINATOR;
    this.MOTORS_OFF      = 'M84' + CMD_TERMINATOR;
    this.SET_WAIT_BDTEMP = 'M190 S';
    this.SET_WAIT_EXTEMP = 'M109 S';

    this.JOB_PAUSE  = 'M226 P1' + CMD_TERMINATOR;
    this.JOB_RESUME = 'M226 P0' + CMD_TERMINATOR;
    this.JOB_ABDN   = 'M226 P-255' + CMD_TERMINATOR;

    this.GET_FSTATS = [ 
            this.GET_TEMP, 
            this.POSITION, 
            this.CAPABILITIES, 
            this.ENDSTOP_STATE, 
            this.MEM_SETTINGS, 
            this.FREE_RAM,
            this.FMWARE_INFO 
        ];
}

//  rs Responses
function Resends() {
    this.CS_OOR  = '(checksum out of range)';
    this.CS_INV  = '(incorrect checksum - should be ';
    this.CMD_OOR = '(command code out of range)';
    this.CMD_MSS = '(command code missing)';
}

var cmd = new Commands(),
    rs  = new Resends();