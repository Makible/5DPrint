const ZEDIST = 3;
const DEFSPEED = 2000;

function Indicator() {
    this.r = POINTER_OFFSET;
    this.x = 0;
    this.y = 0;
    this.color = '';
}

Indicator.prototype.drawHEFill = function() {
    ui.phLayer.ctx.beginPath();
    ui.phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
    ui.phLayer.ctx.strokeStyle = this.color;
    ui.phLayer.ctx.fillStyle   = this.color;
    ui.phLayer.ctx.closePath();
    ui.phLayer.ctx.fill();
};

Indicator.prototype.drawHEStroke = function() {
    ui.phLayer.ctx.beginPath();
    ui.phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
    ui.phLayer.ctx.strokeStyle = this.color;
    ui.phLayer.ctx.closePath();
    ui.phLayer.ctx.stroke();
};

function Layer(c) {
    this.canvas = c;
    this.ctx    = c.getContext('2d');
    this.width  = $(c).attr('width');
    this.height = $(c).attr('height');
}

Layer.prototype.clear = function() {
    this.ctx.clearRect(0, 0, ui.witdh, ui.height);
};

Layer.prototype.startPath = function(x, y) {
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
};

Layer.prototype.drawPathTo = function(x, y, color) {
    this.ctx.strokeStyle = color;
    this.ctx.lineTo(x, y);
    this.ctx.closePath();
    this.ctx.stroke();
};

Layer.prototype.closePath = function() { this.ctx.closePath(); }

function PrintArea() {
    this.el = document.getElementById('print-area');

    //  sliders
    this.xSlider = document.getElementById('x');
    this.ySlider = document.getElementById('y');

    //  home buttons
    this.homeAllBtn = document.getElementById('all-home');
    this.homeXBtn = document.getElementById('x-home');
    this.homeYBtn = document.getElementById('y-home');
    this.homeZBtn = document.getElementById('z-home');

    //  canvas / print area
    this.bgLayer  = new Layer(document.getElementById('grid-layer'));
    this.hlLayer  = new Layer(document.getElementById('highlight-layer'));
    this.subLayer = new Layer(document.getElementById('sub-layer'));
    this.objLayer = new Layer(document.getElementById('obj-layer'));
    this.phLayer  = new Layer(document.getElementById('ph-layer'));

    //  Z / E controllers
    this.ePlus  = document.getElementById('e-plus');
    this.eMinus = document.getElementById('e-minus');
    this.eOn  = document.getElementById('e-on');
    this.eOff = document.getElementById('e-off');

    this.zPlus  = document.getElementById('z-plus');
    this.zMinus = document.getElementById('z-minus');
    this.zOn  = document.getElementById('z-on');
    this.zOff = document.getElementById('z-off');

    //  temperature inputs
    this.eTempRequested = document.getElementById('e-requested');
    this.eTempActual    = document.getElementById('e-actual');

    this.zTempRequested = document.getElementById('z-requested');
    this.zTempActual    = document.getElementById('z-actual');

    this.width  = this.bgLayer.width;
    this.height = this.bgLayer.height;

    this.phi = { color: RED_INDICATOR, x: 0, y: 0 };
    this.ct  = undefined;
    this.pp  = undefined;

}

function UI() {
    //  header controls
    this.settingsBtn  = document.getElementById('settings');
    this.loadJobBtn   = document.getElementById('file-picker');
    this.jobActionBtn = document.getElementById('print-pause');
    this.jobResetBtn  = document.getElementById('reset');
    this.devicesBtn   = document.getElementById('devices');
    this.adnameEl     = document.getElementById('active-dname');

    this.pa = new PrintArea();

    //  console area
    this.consoleIn      = document.getElementById('console-input');
    this.consoleOut     = document.getElementById('console-output');
    this.consoleToggle  = document.getElementById('console-handle');
    this.consoleTop     = document.getElementById('console-nav').children[0];
    this.consoleBottom  = document.getElementById('console-nav').children[1];

    //  progress indicator
    this.progress = document.getElementById('progress');

    this.paths = [];
    this.xTrim = 0;
    this.yTrim = 0;

    this.deviceTpl = document.createElement('li');

    var dn = document.createElement('div');
    var ds = document.createElement('div');
    var dt = document.createElement('div');
    var df = document.createElement('div');

    dn.className = 'dev-name';
    ds.className = 'dev-status';
    dt.className = 'dev-temp icon-celcius';
    df.className = 'dev-file';

    this.deviceTpl.className = 'btn';
    this.deviceTpl.innerHTML = dn + ds + dt + df;

    //  display grid
    var _inc = util.millimeterToPixel(5);
    this.pa.bgLayer.ctx.strokeStyle = '#555';
    for(var x = _inc; x <= this.pa.width; x+=_inc) {
        this.pa.bgLayer.ctx.moveTo(x, 0);
        this.pa.bgLayer.ctx.lineTo(x, this.pa.height);
    }

    for(var y = _inc; y <= this.pa.height; y+=_inc) {
        this.pa.bgLayer.ctx.moveTo(0, y);
        this.pa.bgLayer.ctx.lineTo(this.pa.width, y);
    }
    this.pa.bgLayer.ctx.stroke();
    this.setSlideTrimmers();
}

UI.prototype.setSlideTrimmers = function() {
    var shim = 14;
    this.xTrim = this.pa.el.offsetTop - shim;
    this.yTrim = this.pa.el.offsetLeft - shim;
};


