var ZEDIST = 3
    DEFSPEED = 800;

function Indicator() {
    this.r = POINTER_OFFSET;
    this.x = 0;
    this.y = 0;
    this.color = '';
}

Indicator.prototype.drawHEFill = function() {
    ui.pa.phLayer.ctx.beginPath();
    ui.pa.phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
    ui.pa.phLayer.ctx.strokeStyle = this.color;
    ui.pa.phLayer.ctx.fillStyle   = this.color;
    ui.pa.phLayer.ctx.closePath();
    ui.pa.phLayer.ctx.fill();
};

Indicator.prototype.drawHEStroke = function() {
    ui.pa.phLayer.ctx.beginPath();
    ui.pa.phLayer.ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, false);
    ui.pa.phLayer.ctx.strokeStyle = this.color;
    ui.pa.phLayer.ctx.closePath();
    ui.pa.phLayer.ctx.stroke();
};

function Slider(el) {
    this.el = el;
    this.mdh = undefined;
    this.handle = el.children[0];
    this.enabled  = 0;
}

Slider.prototype.init = function() {
    var _sl = this,
        mu = function(evt) {
            if(!_sl.enabled) return;

            _sl.mdh = undefined;
            ui.disableMovers();

            var dist = util.pixelToMillimeter(ui.pa.phi.y) +
                        ',' + util.pixelToMillimeter(ui.pa.phi.x) +
                        ',' + util.pixelToMillimeter(ui.pa.zSlider.handle.offsetTop + 14);

            fdp.device.sendMovement({ Axis: 'X,Y,Z', Distance: dist, Speed: DEFSPEED });
            ui.enableMovers();
        };

    _sl.handle.onmousedown = function(evt) {
        _sl.mdh = evt.currentTarget;
    };

    //  will trigger mouseup event from anywhere on the page
    //  if the mouse is in a space far outside the handles bounds
    document.onmouseup = function(evt) {
        if(_sl.mdh && _sl.mdh !== undefined)
            _sl.mdh.onmouseup();
    };

    _sl.handle.onmouseup = mu;
};

Slider.attachDraggers = function() {
    var xtb, xbb, ylb, yrb, ztb, zbb;

    //  x draggable limits
    xtb = ui.pa.xSlider.el.offsetTop + ui.xTrim;
    xbb = xtb + ui.pa.xSlider.el.offsetHeight;

    //  y draggable limits
    ylb = ui.pa.ySlider.el.offsetLeft + ui.yTrim;
    yrb = ylb + ui.pa.ySlider.el.offsetWidth;

    //  x draggable limits
    ztb = ui.pa.zSlider.el.offsetTop + ui.zTrim;
    zbb = ztb + ui.pa.zSlider.el.offsetHeight;

    jQuery(ui.pa.xSlider.handle).draggable({
        axis: 'y',
        containment: [0, xtb, 0, xbb],
        drag: function(evt) {
            var _mdh = evt.target;
            ui.pa.phi.y = _mdh.offsetTop + Math.floor(_mdh.offsetHeight / 2) + Math.floor(POINTER_OFFSET / 2);

            ui.pa.xSlider.mdh = _mdh;
            ui.pa.redrawIndicators();
        }
    });

    jQuery(ui.pa.ySlider.handle).draggable({
        axis: 'x',
        containment: [ylb, 0, yrb, 0],
        drag: function(evt) {
            var _mdh = evt.target;
            ui.pa.phi.x = _mdh.offsetLeft + Math.floor(_mdh.offsetWidth / 2) + Math.floor(POINTER_OFFSET / 2);

            ui.pa.ySlider.mdh = _mdh;
            ui.pa.redrawIndicators();
        }
    });

    jQuery(ui.pa.zSlider.handle).draggable({
        axis: 'y',
        containment: [0, ztb, 0, zbb]
    });
};

function Layer(c) {
    this.canvas = c;
    this.ctx    = c.getContext('2d');
    this.width  = c.width;
    this.height = c.height;
}

Layer.prototype.clear = function() {
    this.ctx.clearRect(0, 0, ui.pa.width, ui.pa.height);
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

Layer.prototype.closePath = function() { this.ctx.closePath(); };

function PrintArea() {
    this.el = document.querySelector('#print-area');

    //  sliders
    this.xSlider = new Slider(document.querySelector('#x'));
    this.ySlider = new Slider(document.querySelector('#y'));
    this.zSlider = new Slider(document.querySelector('#z'));

    this.xSlider.init();
    this.ySlider.init();
    this.zSlider.init();

    //  home buttons
    this.homeAllBtn = document.querySelector('#ico-home');
    this.homeXBtn = document.querySelector('#x-home');
    this.homeYBtn = document.querySelector('#y-home');
    this.homeZBtn = document.querySelector('#z-home');

    //  canvas / print area
    this.bgLayer  = new Layer(document.querySelector('#grid-layer'));
    this.hlLayer  = new Layer(document.querySelector('#highlight-layer'));
    this.subLayer = new Layer(document.querySelector('#sub-layer'));
    this.objLayer = new Layer(document.querySelector('#obj-layer'));
    this.phLayer  = new Layer(document.querySelector('#ph-layer'));

    //  extrusion controllers
    this.extFwd = document.querySelector('#ext-fwd');
    this.extRev = document.querySelector('#ext-rev');
    this.extValue = document.querySelector('.extrusion input');

    this.extTempActual    = document.querySelector('#ext-temp .actual');
    this.extTempRequested = document.querySelector('#ext-temp input');
    this.extTempOff       = document.querySelector('.ext-off');
    this.extTempSet       = document.querySelector('.ext-set');

    this.bedTempActual    = document.querySelector('#bed-temp .actual');
    this.bedTempRequested = document.querySelector('#bed-temp input');
    this.bedTempOff       = document.querySelector('.bed-off');
    this.bedTempSet       = document.querySelector('.bed-set');

    this.width  = this.bgLayer.width;
    this.height = this.bgLayer.height;

    this.ct  = undefined;
    this.pp  = undefined;

    this.phi   = new Indicator();
    this.phi.x = 0;
    this.phi.y = 0;
    this.phi.color = RED_INDICATOR;
};

PrintArea.prototype.resetAndDrawPaths = function() {
    this.objLayer.clear();
    if(ui.paths.length < 1) return;

    this.objLayer.startPath(ui.paths[0].x, ui.paths[0].y);
    for(var i = 1; i < ui.paths.length; i++) {
        var _x = ui.paths[i].x,
            _y = ui.paths[i].y,
            _c = (ui.paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST;

        this.objLayer.drawPathTo(_x, _y, _c);
        this.objLayer.startPath(_x, _y);
    }
    this.bgLayer.closePath();
};

PrintArea.prototype.movePrintHead = function(offsetX, offsetY) {
    this.phi.x = offsetX;
    this.phi.y = offsetY;

    ui.disableMovers();
    this.moveXYSliders();
    this.redrawIndicators();
    ui.enableMovers();
};

PrintArea.prototype.redrawIndicators = function() {
    this.phLayer.clear();
    this.phi.drawHEFill();

    if(this.ct !== undefined)
        this.ct.drawHEStroke();
};

PrintArea.prototype.moveXYSliders = function() {
    var t, l;
    t = this.phi.y - Math.floor(this.xSlider.handle.offsetHeight / 2);
    this.xSlider.handle.style.top = t + 'px';

    l = this.phi.x - Math.floor(this.xSlider.handle.offsetWidth / 2);
    this.ySlider.handle.style.left = l +'px';
};

PrintArea.prototype.moveZSlider = function(offset) {
    var val = offset - (this.zSlider.handle.offsetHeight / 2);
    this.zSlider.handle.style.top =  val + 'px';
};

function DeviceConfiguration() {
    this.fields = [
        ['steps', 'M92', ['x', 'y', 'z', 'e'], /M92 X(\d+) Y(\d+) Z(\d+) E(\d+)/],
        ['feedrate', 'M202', ['x', 'y', 'z', 'e'], /M202 X(\d+\.\d+) Y(\d+\.\d+) Z(\d+\.\d+) E(\d+\.\d+)/],
        ['max-acceleration', 'M201', ['x', 'y', 'z', 'e'], /M201 X(\d+) Y(\d+) Z(\d+) E(\d+)/],
        ['acceleration', 'M204', ['s', 't'], /M204 S(\d+\.\d+) T(\d+\.\d+)/],
        ['advanced', 'M205', ['s', 't', 'x', 'z', 'e'], /M205 S(\d+\.\d+) T(\d+\.\d+) XY(\d+\.\d+) Z(\d+\.\d+) E(\d+\.\d+)/],
        ['pid', 'M301', ['p', 'i', 'd'], /M301 P(\d+) I(\d+) D(\d+)/]
    ];
    this.settings = this.fields.map(function(attrs) {
        return new Setting(attrs[0], attrs[1], attrs[2], attrs[3]);
    });
};

DeviceConfiguration.prototype.set = function(deviceStats) {
    this.settings.forEach(function(e) {
        e.enable(deviceStats);
    });
    document.querySelector('#settings-basic-submit').disabled = false;
    document.querySelector('#settings-advanced-submit').disabled = false;
};

DeviceConfiguration.prototype.clear = function() {
    this.settings.forEach(function(e) {
        e.disable();
    });
    document.querySelector('#settings-basic-submit').disabled = true;
    document.querySelector('#settings-advanced-submit').disabled = true;
};

DeviceConfiguration.prototype.persist = function() {
    ui.settings.configuration.settings.forEach(function(e) { e.persist(); });
    // we're sending the settings all at once, we need to loop through each setting and save per item
    fdp.device.send('M500');
};

function Setting(id, devCmd, params, regExp) {
    this.id = id;
    this.devCmd = devCmd;
    this.regExp = regExp;
    this.params = params;
    this.fields = this.params.map(function(e) {
        return document.querySelector('#settings-' + this.id + '-' + e);
    }, this);
};

Setting.prototype.enable = function(deviceStats) {
    var values = this.regExp.exec(deviceStats);
    if(values != null) {
        this.fields.forEach(function(field, index) {
            field.value = values[index + 1];
            field.disabled = false;
        });
    }
};

Setting.prototype.disable = function() {
    this.fields.forEach(function(field) {
        field.value = '';
        field.disabled = true;
    });
};

Setting.prototype.persist = function() {
    args = [this.devCmd].concat(this.params.map(function(param, index) {
        return param + this.fields[index].value;
    }, this));
    fdp.device.send(args.join(' ').toUpperCase() + CMD_TERMINATOR);
};

var ui = {
    //  header controls
    loadJobBtn:   document.querySelector('#file-picker'),
    jobActionBtn: document.querySelector('#print-pause'),
    jobResetBtn:  document.querySelector('#reset'),
    moffBtn:      document.querySelector('#moff'),
    adnameEl:     document.querySelector('#active-dname'),

    settings: {
        configuration: new DeviceConfiguration(),
        button:  document.querySelector('#settings'),
        overlay: document.querySelector('#settings-overlay'),
        pane: {
            about:    document.querySelector('#settings-about'),
            advanced: document.querySelector('#settings-advanced'),
            basic:    document.querySelector('#settings-basic'),
        },
        tab: {
            about:    document.querySelector('#about'),
            advanced: document.querySelector('#advanced'),
            basic:    document.querySelector('#basic'),
        }
    },

    pa: new PrintArea(),

    //  command area
    commandIn:     document.querySelector('#command-input'),

    //  console output
    console:       document.querySelector('#console-output'),
    consoleTop:    document.querySelector('#console-nav .up'),
    consoleBottom: document.querySelector('#console-nav .down'),
    consoleToggle: document.querySelector('#console'),

    //  progress indicator
    progress: document.querySelector('#progress'),

    paths: [],
    xTrim: 0,
    yTrim: 0,
    zTrim: 0,

    displayGrid: function() {
        //  display grid
        var _inc = util.millimeterToPixel(5);
        ui.pa.bgLayer.ctx.strokeStyle = '#555';
        for(var x = _inc; x <= ui.pa.width; x+=_inc) {
            ui.pa.bgLayer.ctx.moveTo(x, 0);
            ui.pa.bgLayer.ctx.lineTo(x, ui.pa.height);
        }

        for(var y = _inc; y <= ui.pa.height; y+=_inc) {
            ui.pa.bgLayer.ctx.moveTo(0, y);
            ui.pa.bgLayer.ctx.lineTo(ui.pa.width, y);
        }
        ui.pa.bgLayer.ctx.stroke();
        ui.setSlideTrimmers();
    },

    setSlideTrimmers: function() {
        var shim = 14;
        ui.xTrim = ui.pa.el.offsetTop - shim;
        ui.yTrim = ui.pa.el.offsetLeft - shim;
        ui.zTrim = ui.pa.el.offsetTop - shim;
    },

    attachActionListeners: function() {
        var _navSelected = function() {
            if(ui.settings.button.classList.contains('selected') ||
                document.querySelector('#print-actions > .selected') !== null) {
                return !0;
            }
            return 0;
        };

        //  Nav Handlers
        ui.loadJobBtn.onclick = function(evt) {
            var inp = document.querySelector('#fl');
            inp.value = '';
            inp.onchange = function(evt) {
                var f = evt.target.files[0],
                    fr = new FileReader();

                fr.readAsText(f, 'UTF-8');
                fr.onload = function(evt) { /*console.log('loading');*/ };
                fr.onerror = function(err) {
                    notify({ title: "File Load Issue", message: "Error loading file. Please try again." });
                };

                fr.onloadend = function(evt) {
                    var fname   = f.name,
                        content = evt.target.result.split('\n');

                    fdp.device.job.filename = fname;
                    fdp.device.job.content  = content;
                    fdp.device.job.status   = 'pending';

                    ui.loadContentToPrintArea(content);
                    notify({ title: "File Loaded", message: "File loaded and ready for printing" });
                };
            };
            inp.click();

            ui.paths = [];
            ui.pa.hlLayer.clear();
            ui.pa.objLayer.clear();
            ui.pa.resetAndDrawPaths();
        };

        ui.jobActionBtn.onclick = function(evt) {
            if(!fdp.device.job.filename || fdp.device.job.filename === '') {
                notify({
                    title: "No File",
                    message: "Please load a valid gcode file to print"
                });
                return;
            }

            var _pbtn = document.querySelector('#print-pause');

            //  do it
            if(fdp.device.job.status == 'pending') {
                _pbtn.classList.remove('ion-play');
                _pbtn.classList.add('ion-pause');
                _pbtn.title = "Pause Print Job"

                fdp.device.job.status = 'running';
                var msg = 'The warming process can take some time. Please be patient.'
                        + ' During the print, your display may go to sleep (depending'
                        + ' on your OS settings) though your system will not. Once'
                        + ' the print is complete, your system will resume using the'
                        + ' OS settings previously set.\n';
                notify({ title: "Starting Print", message: msg });

                chrome.power.requestKeepAwake('system');

                ui.midPrintQueue = new Array();

                ui.paths = [];
                ui.pa.resetAndDrawPaths();

                fdp.device.job.start = new Date().getTime();
                fdp.device.runAtIdx(0);

                return;
            }

            //  since we update fdp.device.job.status here the print queue should 
            //  see this and send over the pause cmd, leaving the queue
            if(fdp.device.job.status == 'running') {
                _pbtn.classList.remove('ion-pause');
                _pbtn.classList.add('ion-play');
                _pbtn.title = "Restart Print Job"

                fdp.device.job.status = 'paused';
                return;
            }

            if(fdp.device.job.status == 'paused') {
                _pbtn.classList.remove('ion-play');
                _pbtn.classList.add('ion-pause');
                _pbtn.title = "Pause Print Job"

                fdp.device.job.status = 'running';
                fdp.device.send(commands.JOB_RESUME);
                return;
            }
        };

        ui.jobResetBtn.onclick = function(evt) {
            if(fdp.device.job.status == 'running')
                fdp.device.hardStop = !0;

            if(fdp.device.job.status == 'paused') {
                fdp.device.send(commands.JOB_ABDN, function(sendInfo) {
                    if(sendInfo.bytesSent > 0)
                        notify({ title: 'Print Abandoned', message: 'Abandon request sent to device' });
                });
            }

            fdp.device.job = new Job();
            fdp.device.pos.e = 0;
            fdp.device.send(commands.SET_POS + ' E0' + CMD_TERMINATOR);

            var _pbtn = document.querySelector('#print-pause');
            if(_pbtn.classList.contains('ion-pause')) {
                _pbtn.classList.remove('ion-pause');
                _pbtn.classList.add('ion-play');
            }

            //  reset progress bar
            ui.progress.style.width = 0;

            ui.paths = [];
            ui.pa.hlLayer.clear();
            ui.pa.objLayer.clear();
        };

        ui.moffBtn.onclick = function(evt) {
            fdp.device.send('M84' + CMD_TERMINATOR);
        };

        ui.pa.phLayer.canvas.onclick = function(evt) {
            if((evt.offsetX == ui.pa.phi.y && evt.offsetY == ui.pa.phi.x) ||
                evt.offsetX < 0 || evt.offsetX > ui.pa.width ||
                evt.offsetY < 0 || evt.offsetY > ui.pa.height) return;  //  don't need to do anything

            ui.disableMovers();

            var osx, osy;
            osx = evt.offsetX - POINTER_OFFSET;
            osy = evt.offsetY - POINTER_OFFSET;

            var dist = util.pixelToMillimeter(osy) + ',' + util.pixelToMillimeter(osx);
            fdp.device.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED });

            ui.pa.pp = new Indicator();
            ui.pa.pp.x = osx;
            ui.pa.pp.y = osy;
            ui.pa.pp.color = RED_IND_GHOST;

            ui.pa.movePrintHead(osx, osy);
        };

        ui.pa.phLayer.canvas.onmousemove = function(evt) {
            if(ui.pa.ct === undefined) {
                ui.pa.ct = new Indicator();
                ui.pa.ct.color = 'rgba(222, 222, 222, 0.4)';
            }

            ui.pa.ct.x = evt.offsetX - POINTER_OFFSET;
            ui.pa.ct.y = evt.offsetY - POINTER_OFFSET;
            ui.pa.redrawIndicators();
        };

        ui.pa.phLayer.canvas.onmouseout = function(evt) {
            ui.pa.ct = undefined;
            ui.pa.redrawIndicators();
        };

        //  homing handlers
        ui.pa.homeAllBtn.onclick = function(evt) {
            var _nh = document.querySelectorAll('.not-homed');
            if(_nh && _nh !== undefined) {
                for(var i = 0; i < _nh.length; i++)
                    _nh[i].classList.remove('not-homed');
            }
            
            ui.pa.movePrintHead(0, 0);
            ui.pa.moveZSlider(0);
            fdp.device.home(evt.target.innerHTML);
        };

        ui.pa.homeXBtn.onclick = function(evt) {
            if(evt.target.classList.contains('not-homed'))
                evt.target.classList.remove('not-homed');
            ui.pa.movePrintHead(ui.pa.phi.x, 0);
            fdp.device.home(evt.target.innerHTML);
        };

        ui.pa.homeYBtn.onclick = function(evt) {
            if(evt.target.classList.contains('not-homed'))
                evt.target.classList.remove('not-homed');
            ui.pa.movePrintHead(0, ui.pa.phi.y);
            fdp.device.home(evt.target.innerHTML);
        };

        ui.pa.homeZBtn.onclick = function(evt) {
            if(evt.target.classList.contains('not-homed'))
                evt.target.classList.remove('not-homed');
            ui.pa.moveZSlider(0);
            fdp.device.home(evt.target.innerHTML);
        };

        //  extrusion handler
        var _extrude = function(evt) {
            if(ui.pa.extValue.value.length > 0) {
                var val = parseFloat(ui.pa.extValue.value);

                if(typeof val != 'number')
                    return;

                if(evt.currentTarget.id === 'ext-rev')
                    val *= -1;

                fdp.device.pos.e += val;
                fdp.device.sendMovement({ Axis: 'e', Distance: fdp.device.pos.e, Speed: DEFSPEED });
            }
        };

        var _pwr = function(evt) {
            var heater = (evt.currentTarget.classList.contains('bed-off')) ? 'bed' : 'ext';
            document.querySelector('#' + heater + '-temp input.temp').value = '';
            fdp.device.setTemp({ Name: heater, Value: 0 });
        };

        var _setTemp = function(evt) {
            var heater = (evt.currentTarget.classList.contains('bed-set')) ? 'bed' : 'ext';
            var val = parseInt(document.querySelector('#' + heater + '-temp input.temp').value);

            if(typeof val != 'number' || val < 0)
                return;

            fdp.device.setTemp({ Name: heater, Value: val });
        };

        var _keyedSetTemp = function(evt) {
            if(evt.which == 13) {
                _setTemp(evt);
                evt.currentTarget.blur();
            }
        };

        ui.pa.extFwd.onclick = _extrude;
        ui.pa.extRev.onclick = _extrude;

        ui.pa.extTempOff.onclick = _pwr;
        ui.pa.bedTempOff.onclick = _pwr;

        ui.pa.extTempSet.onclick = _setTemp;
        ui.pa.bedTempSet.onclick = _setTemp;

        ui.pa.extTempSet.onkeydown = _keyedSetTemp;
        ui.pa.bedTempSet.onkeydown = _keyedSetTemp;
    },

    detachActionListeners: function() {
        ui.loadJobBtn.onclick = undefined;
        ui.jobActionBtn.onclick = undefined;
        ui.jobResetBtn.onclick = undefined;
        ui.moffBtn.onclick = undefined;
        ui.pa.phLayer.canvas.onclick = undefined;
        ui.pa.phLayer.canvas.onmousemove = undefined;
        ui.pa.phLayer.canvas.onmouseout = undefined;
        ui.pa.homeAllBtn.onclick = undefined;
        ui.pa.homeXBtn.onclick = undefined;
        ui.pa.homeYBtn.onclick = undefined;
        ui.pa.homeZBtn.onclick = undefined;
        ui.pa.extFwd.onclick = undefined;
        ui.pa.extRev.onclick = undefined;
        ui.pa.extTempOff.onclick = undefined;
        ui.pa.bedTempOff.onclick = undefined;
        ui.pa.extTempSet.onclick = undefined;
        ui.pa.bedTempSet.onclick = undefined;
    },

    enableMovers: function() {
        ui.pa.xSlider.enabled = !0;
        ui.pa.ySlider.enabled = !0;
        ui.pa.zSlider.enabled = !0;
        Slider.attachDraggers();
    },

    disableMovers: function() {
        ui.pa.xSlider.enabled = 0;
        ui.pa.ySlider.enabled = 0;
        ui.pa.zSlider.enabled = 0;
        jQuery('.handle:ui-draggable').draggable('destroy');
    },

    attachDevice: function(device) {
        if(ui.adnameEl.classList.contains('no-device')) {
            ui.adnameEl.innerHTML = fdp.device.path;
            if(ui.adnameEl.classList.contains('no-device'))
                ui.adnameEl.classList.remove('no-device');

            ui.detachActionListeners();
            ui.attachActionListeners();
            ui.pa.movePrintHead(0, 0);

            Slider.attachDraggers();
        }
    },

    detachDevice: function() {
        fdp.device = undefined;

        ui.adnameEl.innerHTML = 'looking for device';
        ui.adnameEl.classList.add('no-device');

        ui.pa.extTempActual.innerHTML = '0&deg;';
        ui.pa.bedTempActual.innerHTML = '0&deg;';
        ui.pa.extTempRequested.value = '';
        ui.pa.bedTempRequested.value = '';

        if(!ui.pa.homeXBtn.classList.contains('not-homed'))
            ui.pa.homeXBtn.classList.add('not-homed');
        if(!ui.pa.homeYBtn.classList.contains('not-homed'))
            ui.pa.homeYBtn.classList.add('not-homed');
        if(!ui.pa.homeZBtn.classList.contains('not-homed'))
            ui.pa.homeZBtn.classList.add('not-homed');

        ui.detachActionListeners();
        ui.disableMovers();

        ui.settings.configuration.clear();
    },

    loadContentToPrintArea: function(gcode) {
        ui.paths = [];
        ui.paths.push({ x:0, y:0, e:0 });

        //  loop through the file, getting each 'G1' line and loading the
        //  x / y coords into the paths array, ignoring the commented rows
        for(var i = 0; i < gcode.length; i++) {
            if(gcode[i] && gcode[i] !== undefined
                && (gcode[i].indexOf(';') == -1 || gcode[i].indexOf(';') > 1)
                && (gcode[i].indexOf('G1 X') > -1 || gcode[i].indexOf('G1 Y') > -1)) {

                var mx, my, me, move = gcode[i].split(' ');
                for(var j = 0; j < move.length; j++) {
                    if(move[j].indexOf('X') > -1)
                        mx = util.millimeterToPixel(move[j].substring(1));

                    if(move[j].indexOf('Y') > -1)
                        my = util.millimeterToPixel(move[j].substring(1));

                    if(move[j].indexOf('E') > -1)
                        me = util.millimeterToPixel(move[j].substring(1));
                }
                ui.paths.push({ x: my, y: mx, e: me });
            }
        }

        if(ui.paths.length == 1)
            ui.paths = [];
        ui.pa.resetAndDrawPaths();
    },

    digestCmd: function(prCmd) {
        if(prCmd.indexOf(commands.MOVE) > -1) {
            var _pa = ui.pa;
            if(prCmd.indexOf('Z') > -1) {
                //  clear prev++ layer and prep
                //  for prev layer plotting
                _pa.hlLayer.clear();
                _pa.hlLayer.startPath(ui.paths[0].x, ui.paths[0].y);

                //  plot prev layer and draw
                for(var i = 1; i < ui.paths.length; i++) {
                    var _c = (ui.paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST;
                    _pa.hlLayer.drawPathTo(ui.paths[i].x, ui.paths[i].y, _c);
                    _pa.hlLayer.startPath(ui.paths[i].x, ui.paths[i].y);
                }
                _pa.hlLayer.closePath();

                //  reset "active" layer
                _pa.objLayer.clear();
                ui.paths = [];

                //  move the z slider
                var _prCmd = prCmd.split(' ');
                for(var i = 0; i < _prCmd.length; i++) {
                    if(_prCmd[i].indexOf('Z') > -1)
                        fdp.device.pos.z = parseFloat(_prCmd[i].substring(1));
                }
                ui.pa.moveZSlider(Math.floor(util.millimeterToPixel(fdp.device.pos.z)));
            }

            //  need to flip the X and Y here because of the way the
            //  physical printer X/Y is vs. virtual via screen X/Y
            var mx, my, me, _prCmd = prCmd.split(' ');
            for(var i = 0; i < _prCmd.length; i++) {
                if(_prCmd[i].indexOf('X') > -1)
                    my = util.millimeterToPixel(_prCmd[i].substring(1));

                if(_prCmd[i].indexOf('Y') > -1)
                    mx = util.millimeterToPixel(_prCmd[i].substring(1));

                if(_prCmd[i].indexOf('E') > -1)
                    me = util.millimeterToPixel(_prCmd[i].substring(1));
            }

            ui.paths.push({ x: mx, y: my, e: me });
            _pa.phi.x = mx, _pa.phi.y = my;

            //  only draw the new path here
            var _c = (me !== undefined) ? RED_INDICATOR : BLU_INDICATOR;
            _pa.objLayer.drawPathTo(mx, my, _c);
            _pa.objLayer.startPath(mx, my);

            var yw, xh;
            yw = mx - (Math.floor(_pa.ySlider.handle.offsetWidth / 2)) - Math.floor(POINTER_OFFSET / 2);
            xh = my - (Math.floor(_pa.xSlider.handle.offsetHeight / 2)) - Math.floor(POINTER_OFFSET / 2);

            _pa.ySlider.handle.style.left = yw + 'px';
            _pa.xSlider.handle.style.top = xh + 'px';
            _pa.redrawIndicators();
        }

        if(prCmd.indexOf(commands.HOME) > -1) {
            ui.pa.homeXBtn.classList.remove('not-homed');
            ui.pa.homeYBtn.classList.remove('not-homed');
            ui.pa.homeZBtn.classList.remove('not-homed');
            ui.pa.movePrintHead(0, 0);
        }

        if(prCmd.indexOf(commands.SET_WAIT_BDTEMP) > -1 ||
            prCmd.indexOf(commands.SET_WAIT_EXTEMP) > -1) {

            //  toggle the on switch and set the requested temp
            if(prCmd.indexOf(commands.SET_WAIT_BDTEMP) > -1)
                ui.pa.bedTempRequested.value = parseInt(prCmd.split(' ')[1].split('S')[1], 10);
            else
                ui.pa.extTempRequested.value = parseInt(prCmd.split(' ')[1].split('S')[1], 10);
        }
    },

    updateStats: function(stats) {
        //  update active dev UI temps
        ui.pa.extTempActual.innerHTML = fdp.device.extTemp + '&deg;';
        ui.pa.bedTempActual.innerHTML = fdp.device.bedTemp + '&deg;';

        var rows = stats.split('\n'),
            homedData,
            posData,
            fwData,
            limits,
            esteps;

        for(var i = 0; i < rows.length; i++) {
            var row     = rows[i],
                ahFlag  = '-- Axes Homed',
                posFlag = '-- C:',
                fwFlag  = 'Firmware Version',
                lmtFlag = '// X_MAX_LENGTH',
                esFlag  = 'Steps per unit:';

            if(row.indexOf(ahFlag) > -1) {
                homedData = row.substring(row.indexOf(ahFlag) + ahFlag.length + 1).split(' ');
                continue;
            }

            if(row.indexOf(posFlag) > -1) {
                posData = row.substring(row.indexOf(posFlag) + posFlag.length + 1).split(' ');
                continue;
            }

            if(row.indexOf(fwFlag) > -1) {
                fwData = row;
                continue;
            }

            if(row.indexOf(lmtFlag) > -1) {
                limits = row.substring(2).split(' ');
                continue;
            }

            if(row.indexOf(esFlag) > -1) {
                esteps = rows[i+1].split(' ')[4];
                continue;
            }
        }

        if(homedData && homedData !== undefined) {
            for(var j = 0; j < homedData.length; j++) {
                var axis = homedData[j].replace(/\s/g, '').split(':'),
                    el   = document.getElementById(axis[0].toLowerCase() + '-home');
                if(axis[1] == '0' && !el.classList.contains('not-homed'))
                    el.classList.add('not-homed');

                if(axis[1] == '1' && el.classList.contains('not-homed'))
                    el.classList.remove('not-homed');
            }
        }

        if(posData && posData !== undefined) {
            for(var k = 0; k < posData.length; k++) {
                if(posData[k].indexOf(':') == -1) continue;

                var coord = posData[k].split(':'),
                    pos   = util.millimeterToPixel(coord[1]);

                if(coord[0].toLowerCase() == 'x') ui.pa.phi.y = pos;
                if(coord[0].toLowerCase() == 'y') ui.pa.phi.x = pos;
                if(coord[0].toLowerCase() == 'z') ui.pa.moveZSlider(pos);
            }

            ui.pa.movePrintHead(ui.pa.phi.x, ui.pa.phi.y);
        }
    },

    updateProgress: function(val) {
        ui.progress.style.width = val.toString() + '%';
    },

    resetWithContent: function() {
        //  uses the completed job content
        ui.jobActionBtn.classList.remove('ion-pause');
        ui.jobActionBtn.classList.add('ion-play');
        ui.jobActionBtn.title = "Start Print Job";
        ui.loadContentToPrintArea(fdp.device.job.content);
    },

    init: function() {
        // Set the active settings tab and pane
        ui.settings.tab.active = ui.settings.tab.basic;
        ui.settings.pane.active = ui.settings.pane.basic;

        // Hide inactive settings panes
        ui.settings.pane.advanced.style.display = 'none';
        ui.settings.pane.about.style.display = 'none';

        ui.settings.configuration.clear();

        // Set the about pane's dynamic information
        var manifest = chrome.runtime.getManifest();
        document.querySelector('.author').innerHTML = manifest.author;
        document.querySelector('.ver').innerHTML = 'v' + manifest.version;

        ui.settings.button.onclick = function(evt) {
            
            // console.log(evt);
            // console.log(ui.settings);
            
            evt.target.classList.add('selected');
            var _mt = (ui.settings.overlay.offsetTop <= 0) ? '3em' : '-54em';
            jQuery(ui.settings.overlay).animate({ 'margin-top': _mt }, 600, function() {});
        };

        var _settingsClickHandler = function(evt) {
            if(evt.target.classList.contains('selected'))
                return;

            // Hide the inactive settings tab and pane
            ui.settings.tab.active.classList.remove('selected');
            ui.settings.pane.active.style.display = 'none';

            // Show the active settings tab and pane
            ui.settings.tab.active = evt.target;
            ui.settings.tab.active.classList.add('selected');
            ui.settings.pane.active = ui.settings.pane[evt.target.id];
            ui.settings.pane.active.style.display = 'block';
        };

        var _lis = [ui.settings.tab.basic, ui.settings.tab.advanced,
                    ui.settings.tab.about];
        for(var j = 0; j < _lis.length; j++)
            _lis[j].onclick = _settingsClickHandler;

        document.querySelector('#settings-basic-submit').onclick = ui.settings.configuration.persist;
        document.querySelector('#settings-advanced-submit').onclick = ui.settings.configuration.persist;

        ui.commandIn.onfocus = function(evt) { evt.currentTarget.value = ''; }
        ui.commandIn.onkeydown = function(evt) {
            if(evt.which == 13) {
                var t = evt.currentTarget;
                if(t.value !== '' && t.value.length > 2)
                    fdp.device.manual(t.value.toUpperCase());

                t.value = '';
                t.focus();
            }
        };

        ui.consoleToggle.onclick = function(evt) {

            // console.log(evt);
            // console.log(ui.settings);

            var _mt = (ui.settings.overlay.offsetTop == -1512) ? '-54em' : '-126em';
            jQuery(ui.settings.overlay).animate({ 'margin-top': _mt }, 600);
        };

        ui.consoleTop.onclick = function(evt) {
            jQuery(ui.console).animate({ scrollTop: 0 }, 600);
        };

        ui.consoleBottom.onclick = function(evt) {
            jQuery(ui.console).animate({ scrollTop: ui.console.scrollHeight }, 600);
        };

        ui.settings.overlay.style.display = 'block';
        ui.displayGrid();
    },

    //  needed ??
    // digestDeviceResponse: function(cmd, data) {
    //     ui.prependToConsole(data);
    //     if(cmd + CMD_TERMINATOR == commands.POSITION ||
    //         cmd + CMD_TERMINATOR == commands.GET_TEMP) {
    //         fdp.device.updateDeviceStats(data);
    //     }
    // },

    prependToConsole: function(data) {
        data = data.replace(/\r\n/g, '<br>');
        var p = '<p>' + data + '</p>';

        ui.console.innerHTML = p + ui.console.innerHTML;

        // if(ui.console.scrollTop > 0)
        //     ui.console.scrollTop += (jQuery(p).height() * 2);
    }
};
