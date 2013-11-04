const ZEDIST = 3;
const DEFSPEED = 2000;

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
    var _sl = this;
    _sl.el.onclick = function(evt) {
        if(!_sl.enabled || evt.target.classList.contains('slider')) return;

        if(evt.target.id == 'y')
            evt.offsetY = ui.pa.phi.x + POINTER_OFFSET;
        else
            evt.offsetX = ui.pa.phi.y + POINTER_OFFSET;
        ui.canvasCl(evt);
    };

    _sl.el.children[0].onmouseup = function(evt) {
        if(!_sl.enabled) return;

        _sl.mdh = undefined;
        ui.disableMovers();

        var dist = util.pixelToMillimeter(ui.pa.phi.y) + 
                    ',' + util.pixelToMillimeter(ui.pa.phi.x);
        active.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED });
        ui.enableMovers();
    };

    //  
    //  will trigger mouseup event from anywhere on the page
    //  if the mouse is in a space far outside the handles bounds
    document.onmouseup = function(evt) {
        if(_sl.mdh && _sl.mdh !== undefined) {
            _sl.mdh.onmouseup();
            _sl.mdh = undefined;
        }
    };
};

Slider.attachDraggers = function() {
    var xtb, xbb, ylb, yrb;

    //  x draggable limits
    xtb = ui.pa.xSlider.el.offsetTop + ui.xTrim;
    xbb = xtb + ui.pa.xSlider.el.offsetHeight;

    //  y draggable limits
    ylb = ui.pa.ySlider.el.offsetLeft + ui.yTrim;
    yrb = ylb + ui.pa.ySlider.el.offsetWidth;

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

Layer.prototype.closePath = function() { this.ctx.closePath(); }

function PrintArea() {
    this.el = document.getElementById('print-area');

    //  sliders
    this.xSlider = new Slider(document.getElementById('x'));
    this.ySlider = new Slider(document.getElementById('y'));

    this.xSlider.init();
    this.ySlider.init();

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

    this.ct  = undefined;
    this.pp  = undefined;

    this.phi = new Indicator();
    this.phi.color = RED_INDICATOR;
    this.phi.x = 0;
    this.phi.y = 0;

}

PrintArea.prototype.resetAndDrawPaths = function() {
    this.objLayer.clear();
    if(ui.paths.length < 1) return;

    this.objLayer.startPath(ui.paths[0].x, ui.paths[0].y);
    for(var i = 1; i < paths.length; i++) {
        var _x = ui.paths[i].x,
            _y = ui.paths[i].y,
            _c = (ui.paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST;

        this.objLayer.drawPathTo(_x, _y, _c);
        this.objLayer.startPath(_x, _y)
    }
    this.bgLayer.closePath();
};

PrintArea.prototype.movePrintHead = function(offsetX, offsetY) {
    this.phi.x = offsetX;
    this.phi.y = offsetY;

    ui.disableMovers();
    this.moveSliders(offsetX, offsetY);
    this.redrawIndicators();
    ui.enableMovers();
};

PrintArea.prototype.redrawIndicators = function() {
    this.phLayer.clear();
    this.phi.drawHEFill();

    if(this.ct !== undefined) 
        this.ct.drawHEStroke();
};

PrintArea.prototype.moveSliders = function(offsetX, offsetY) {
    var t, l;
    t = this.phi.y - Math.floor(this.xSlider.handle.offsetHeight / 2) + Math.floor(POINTER_OFFSET / 2);
    this.xSlider.handle.style.top = t+'px';

    l = this.phi.x - Math.floor(this.xSlider.handle.offsetWidth / 2) + Math.floor(POINTER_OFFSET / 2);
    this.ySlider.handle.style.left = l+'px';
};

function UI() {
    //  header controls
    this.settingsBtn  = document.getElementById('settings');
    this.loadJobBtn   = document.getElementById('file-picker');
    this.jobActionBtn = document.getElementById('print-pause');
    this.jobResetBtn  = document.getElementById('reset');
    this.devicesBtn   = document.getElementById('devices');
    this.adnameEl     = document.getElementById('active-dname');

    this.settings   = document.getElementById('settings-overlay');
    this.devices    = document.getElementById('devices-overlay');

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
    this.deviceTpl.appendChild(dn);
    this.deviceTpl.appendChild(ds);
    this.deviceTpl.appendChild(dt);
    this.deviceTpl.appendChild(df);

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

    this.settingsBtn.onclick = function(evt) {
        if(ui.settingsBtn.classList.contains('selected') ||
            ui.devicesBtn.classList.contains('selected') ||
            document.getElementById('print-actions').getElementsByClassName('selected').length > 0) {
            return;
        }

        evt.target.classList.add('selected');
        ui.settings.style.display = 'block';

        document.getElementById('settings-close').onclick = function(evt) {
            ui.settings.style.display = 'none';
            ui.settingsBtn.classList.remove('selected');
        };

        var _settingsClickHandler = function(evt) {
            if(evt.target.classList.contains('selected'))
                return;

            //  remove selected class on previous item
            ui.settings.getElementsByClassName('selected')[0].classList.remove('selected');

            evt.target.classList.add('selected');
            ui.settings.children[1].innerHTML = '';

            switch(evt.target.id) {
            case 'basic':
                break;
            case 'advanced':
                break;
            case 'profiles':
                break;
            case 'about':
                var m    = chrome.runtime.getManifest(),
                    str  = '',
                    desc = '';

                desc = '<strong>5DPrint <i>/ fai·di·print /</i> </strong>is '
                    + 'tailor-made for the MakiBox A6 and modern 3D printing. '
                    + 'The UI is designed for simplicity and letting the user '
                    + 'get straight to printing. Devices are automatically '
                    + 'detected and connected to. Moving the extruder around has '
                    + 'never been easier with the interactive print area.';

                str += '<div class="author">' + m.author + '</div>'; 
                str += '<div class="desc">' + desc + '</div>'; 
                str += '<div class="ver">v' + m.version + '</div>';

                ui.settings.children[1].innerHTML = str; 
                break;
            default:
                //  shouldn't really get here
                break;
            }
        };

        var _lis = ui.settings.getElementsByTagName('li');
        for(var j = 0; j < _lis.length; j++)
            _lis[j].onclick = _settingsClickHandler;

        //  start with the basics
        document.getElementById('basic').click();
    };

    this.consoleIn.onkeydown = function(evt) {
        //  enter / return
        if(evt.which == 13) {
            if(evt.target.value !== '' && evt.target.value.length > 2) {
                active.console(evt.target.value.toUpperCase());
                ui.consoleBottom.click();
            }

            evt.target.value = '';
            evt.target.focus();
            return;
        }
    };

    this.consoleIn.onblur = function(evt) { 
        evt.target.classList.add('ghost');
        evt.target.value = '';
    };

    this.consoleIn.onfocus = function(evt) { 
        evt.target.value = '';
        if(evt.target.classList.contains('ghost'))
            evt.target.classList.remove('ghost');

        if(!jQuery(ui.consoleOut).is(':visible'))
            ui.expandConsoleOutput();
    };

    this.consoleToggle.onclick = function(evt) {
        if(!jQuery(ui.consoleOut).is(':visible'))
            ui.expandConsoleOutput();
        else
            ui.collapseConsoleOutput(); 
    };

    this.consoleTop.onclick = function(evt) {
        jQuery(ui.consoleOut).animate({ scrollTop: 0 }, 800);
    };

    this.consoleBottom.onclick = function(evt) { 
        jQuery(ui.consoleOut).animate({ scrollTop: ui.consoleOut.scrollHeight }, 800);
    };

    //  show / hide console output on esc
    document.body.onkeydown = function(evt) {
        if(evt.which == 27) {
            if(jQuery(ui.consoleOut).is(':visible'))
                ui.collapseConsoleOutput();
            else
                ui.expandConsoleOutput();
        }
    };

    //  debug
    // this.attachActionListeners();
}

UI.prototype.setSlideTrimmers = function() {
    var shim = 14;
    this.xTrim = this.pa.el.offsetTop - shim;
    this.yTrim = this.pa.el.offsetLeft - shim;
};

UI.prototype.attachActionListeners = function() {
    var _navSelected = function() {
        if(ui.settingsBtn.classList.contains('selected') ||
            ui.devicesBtn.classList.contains('selected') ||
            document.getElementById('print-actions').getElementsByClassName('selected').length > 0) {
            return !0;
        }
        return 0;
    };

    //  
    //  Nav Handlers
    this.devicesBtn.onclick = function(evt) { 
        if(_navSelected()) return;

        evt.target.classList.add('selected');
        ui.devices.style.display = 'block';
        document.getElementById('devices-close').onclick = function(evt) {
            ui.devices.style.display = 'none';
            ui.devicesBtn.classList.remove('selected');
        };
    };

    this.loadJobBtn.onclick = function(evt) { 
        if(_navSelected()) return;

        var inp = document.getElementById('fl');
        inp.onchange = function(evt) {
            var f = evt.target.files[0],
                fr = new FileReader();

            fr.readAsText(f, 'UTF-8');
            fr.onload = function(evt) { };
            fr.onerror = function(err) {
                notify({ title: "File Load Issue", message: "Error loading file. Please try again." });
            };

            fr.onloadend = function(evt) {
                var fname   = f.name,
                    content = evt.target.result.split('\n');

                active.job.filename = fname;
                active.job.content  = content;
                active.job.status   = 'pending';

                ui.loadContentToPrintArea(content);
                notify({ title: "File Loaded", message: "File loaded and ready for printing" });
            };
        };
        inp.click();

        ui.paths = [];
        ui.pa.resetAndDrawPaths();
    };

    this.jobActionBtn.onclick = function(evt) { 
        if(!active.job.filename || active.job.filename === '') {
            notify({ 
                title: "No File",
                message: "Please load a valid gcode file to print"
            });
            return;
        }

        var _pbtn = document.getElementById('print-pause');

        //  do it
        if(active.job.status == 'pending') {
            _pbtn.classList.remove('icon-play');
            _pbtn.classList.add('icon-pause');

            active.job.status = 'running';
            active.startPendingJob();

            paths = [];
            resetAndDrawPaths();
            return;
        } 

        //  since we update active.job.status here
        //  the print queue will see this and send
        //  over the pause cmd and leave the queue
        if(active.job.status == 'running') {
            _pbtn.classList.remove('icon-pause');
            _pbtn.classList.add('icon-play');

            active.job.status = 'paused';
            return;
        }

        if(active.job.status == 'paused') {
            _pbtn.classList.remove('icon-play');
            _pbtn.classList.add('icon-pause');
            
            active.job.status = 'running';
            active.resumeJob();
            return;
        }
    };

    this.jobResetBtn.onclick = function(evt) {
        if(active.job.status == 'running')
            active.hardStop = !0;

        if(active.job.status == 'paused')
            active.resetJob();

        active.job = new Job();

        var _pbtn = document.getElementById('print-pause');
        if(_pbtn.classList.contain('icon-pause')) {
            _pbtn.classList.remove('icon-pause');
            _pbtn.classList.add('icon-play');
        }

        //  reset progress bar
        document.getElementById('progress').style.height = 0;

        paths = [];
        hlLayer.clear();
        objLayer.clear();
    };

    //
    //  PrintArea Handlers
    this.pa.phLayer.canvas.onclick = ui.canvasCl;
    this.pa.phLayer.canvas.onmousemove = function(evt) {
        if(ui.pa.ct === undefined) {
            ui.pa.ct = new Indicator();
            ui.pa.ct.color = 'rgba(222, 222, 222, 0.4)';
        }

        ui.pa.ct.x = evt.offsetX - POINTER_OFFSET;
        ui.pa.ct.y = evt.offsetY - POINTER_OFFSET;
        ui.pa.redrawIndicators();
    };

    this.pa.phLayer.canvas.onmouseout = function(evt) {
        ui.pa.ct = undefined;
        ui.pa.redrawIndicators();
    };

    //  homing handlers
    this.pa.homeAllBtn.onclick = function(evt) {
        var _nh = document.getElementsByClassName('not-homed');
        for(var i = 0; i < _nh.length; i++)
            _nh[i].classList.remove('not-homed');
        ui.pa.movePrintHead(0, 0);
        active.home(evt.target.innerHTML);
    };

    this.pa.homeXBtn.onclick = function(evt) {
        if(this.classList.contains('not-homed'))
            this.classList.remove('not-homed');
        ui.pa.movePrintHead(0, ui.pa.phi.y);
        active.home(evt.target.innerHTML);
    };
    
    this.pa.homeYBtn.onclick = function(evt) {
        if(this.classList.contains('not-homed'))
            this.classList.remove('not-homed');
        ui.pa.movePrintHead(ui.pa.phi.x, 0);
        active.home(evt.target.innerHTML);
    };
    
    this.pa.homeZBtn.onclick = function(evt) {
        if(this.classList.contains('not-homed'))
            this.classList.remove('not-homed');
        active.home(evt.target.innerHTML);
    };

    //  E / Z mover handler
    var _ezmov = function(evt) {
        var mvr, axis = evt.target.dataset.axis;

        active.pos[axis] += (evt.target.classList.contains('minus')) ? ZEDIST * -1: ZEDIST;
        mvr = { Axis: axis, Distance: active.pos[axis], Speed: DEFSPEED };
        active.sendMovement(mvr);
    };

    this.pa.ePlus.onclick  = _ezmov;
    this.pa.eMinus.onclick = _ezmov;
    this.pa.zPlus.onclick  = _ezmov;
    this.pa.zMinus.onclick = _ezmov;

    //  E / Z power toggle handlers
    var _pon  = function(evt) {
        if(evt.target.classList.contains('selected')) return;

        var temp = 0,
            axis;

        if(evt.target.id.indexOf('z-') > -1) {
            if(ui.pa.zTempRequested.value < 0) return;

            axis = 'z';
            temp = ui.pa.zTempRequested.value;
            ui.pa.zOff.classList.remove('selected');
        } else { 
            if(ui.pa.eTempRequested.value < 0) return;

            axis = 'e';
            temp = ui.pa.eTempRequested.value;
            ui.pa.eOff.classList.remove('selected');
        };

        this.classList.add('selected');
        active.setTemp({ Name: axis, Value: temp });
    };

    var _poff = function(evt) {
        if(evt.target.classList.contains('selected')) return;

        var axis;

        if(evt.target.id.indexOf('z-') > -1) {
            axis = 'z';
            ui.pa.zTempRequested.value = 0;
            ui.pa.zOn.classList.remove('selected');
        } else { 
            axis = 'e';
            ui.pa.eTempRequested.value = 0;
            ui.pa.eOn.classList.remove('selected');
        };

        this.classList.add('selected');
        active.setTemp({ Name: axis, Value: 0 });
    };

    var _inb  = function(evt) {
        var temp = parseInt(evt.target.value, 10),
            max  = parseInt(evt.target.max, 10),
            axis;


        if(isNaN(temp) || temp < 0 || temp > max) {
            evt.target.value = '';
            return;
        }

        if(this.id.indexOf('z-') > -1) {
            axis = 'z';
            if(!ui.pa.zOn.classList.contains('selected')) {
                ui.pa.zOff.classList.remove('selected');
                ui.pa.zOn.classList.add('selected');
            }
        } else {
            axis = 'e';
            if(!ui.pa.eOn.classList.contains('selected')) {
                ui.pa.eOff.classList.remove('selected');
                ui.pa.eOn.classList.add('selected');
            }
        }

        active.setTemp({ Name: axis, Value: temp });
    };

    var _okd  = function(evt) {
        if(evt.which == 13) {
            evt.preventDefault();
            evt.target.blur();
        }
    };

    this.pa.eOn.onclick  = _pon;
    this.pa.eOff.onclick = _poff;
    this.pa.zOn.onclick  = _pon;
    this.pa.zOff.onclick = _poff;

    this.pa.eTempRequested.onclick = function(evt) { evt.target.value = ''; };
    this.pa.zTempRequested.onclick = function(evt) { evt.target.value = ''; };

    this.pa.eTempRequested.onblur = _inb;
    this.pa.zTempRequested.onblur = _inb;

    this.pa.eTempRequested.onkeydown = _okd;
    this.pa.zTempRequested.onkeydown = _okd;
};

UI.prototype.canvasCl = function(evt) {
    if((evt.offsetX == ui.pa.phi.y && evt.offsetY == ui.pa.phi.x) ||
        evt.offsetX < 0 || evt.offsetX > ui.pa.width ||
        evt.offsetY < 0 || evt.offsetY > ui.pa.height) return;  //  don't need to do anything

    ui.disableMovers();

    var osx, osy;
    osx = evt.offsetX - POINTER_OFFSET;
    osy = evt.offsetY - POINTER_OFFSET;

    var dist = util.pixelToMillimeter(osy) + ',' + util.pixelToMillimeter(osx);
    active.sendMovement({ Axis: 'X,Y', Distance: dist, Speed: DEFSPEED });

    ui.pa.pp = new Indicator();
    ui.pa.pp.x = osx;
    ui.pa.pp.y = osy;
    ui.pa.pp.color = RED_IND_GHOST;

    ui.pa.movePrintHead(osx, osy);
};

UI.prototype.detachActionListeners = function() {
    this.devicesBtn.onclick = undefined;
    this.loadJobBtn.onclick = undefined;
    this.jobActionBtn.onclick = undefined;
    this.jobResetBtn.onclick = undefined;
    this.pa.phLayer.canvas.onclick = undefined;
    this.pa.phLayer.canvas.onmousemove = undefined;
    this.pa.phLayer.canvas.onmouseout = undefined;
    this.pa.homeAllBtn.onclick = undefined;
    this.pa.homeXBtn.onclick = undefined;
    this.pa.homeYBtn.onclick = undefined;
    this.pa.homeZBtn.onclick = undefined;
    this.pa.ePlus.onclick = undefined;
    this.pa.eMinus.onclick = undefined;
    this.pa.zPlus.onclick = undefined;
    this.pa.zMinus.onclick = undefined;
    this.pa.eOn.onclick = undefined;
    this.pa.eOff.onclick = undefined;
    this.pa.zOn.onclick = undefined;
    this.pa.zOff.onclick = undefined;
    this.pa.eTempRequested.onclick = undefined;
    this.pa.eTempRequested.onblur = undefined;
    this.pa.zTempRequested.onclick = undefined;
    this.pa.zTempRequested.onblur = undefined;
};

UI.prototype.enableMovers = function() {
    ui.pa.xSlider.enabled = !0;
    ui.pa.ySlider.enabled = !0;
    Slider.attachDraggers();
};

UI.prototype.disableMovers = function() {
    ui.pa.xSlider.enabled = 0;
    ui.pa.ySlider.enabled = 0;
    jQuery('.handle:ui-draggable').draggable('destroy');
};

UI.prototype.attachDevice = function(device) {
    var _li = ui.deviceTpl.cloneNode(!0);

    _li.dataset.dn = device.name;
    _li.getElementsByClassName('dev-name')[0].innerHTML = device.name;
    _li.getElementsByClassName('dev-status')[0].innerHTML = device.job.status;
    _li.getElementsByClassName('dev-temp')[0].innerHTML = 'E:0 / B:0';
    _li.getElementsByClassName('dev-file')[0].innerHTML = 'no print loaded';
    _li.onclick = function(evt) {
        var _d = evt.currentTarget;
        if(_d.classList.contains('selected')) return;

        ui.settings.getElementsByClassName('selected')[0].classList.remove('selected');
        _d.classList.add('selected');
        document.getElementById('devices-close').click();

        active = devices[_d.dataset.dn];
        ui.adnameEl.innerHTML = active.name;
    };

    ui.devices.getElementsByTagName('ul')[0].appendChild(_li);

    if(this.adnameEl.innerHTML === 'no device') {
        _li.classList.add('selected');
        this.setAsActiveDevice(device);
        Slider.attachDraggers();
    }
};

UI.prototype.setAsActiveDevice = function(device) {
    this.adnameEl.innerHTML = device.name;
    if(this.adnameEl.classList.contains('no-device'))
        this.adnameEl.classList.remove('no-device');

    active = device;

    this.detachActionListeners();
    this.attachActionListeners();
    this.pa.movePrintHead(0, 0);
};

UI.prototype.detachDevice = function(device) {
    var _d,
        _dns = ui.devices.getElementsByTagName('li');
    for(var i = 0; i < _dns.length; i++) {
        if(_dns[i].data.dn == device) {
            _dns[i].remove();
            break;
        }
    }

    if(active.name == device) {
        if(ui.devices.getElementsByTagName('li').length > 0) {

        } else {
            active = undefined;
            ui.adnameEl.innerHTML = 'no device';
            ui.adnameEl.classList.add('no-device');

            ui.pa.eTempRequested.value = 0;
            ui.pa.eTempActual.innerHTML = 0;

            ui.pa.zTempRequested.value = 0;
            ui.pa.zTempActual.innerHTML = 0;

            if(ui.pa.zOn.classList.contains('selected')) {
                ui.pa.zOn.classList.remove('selected');
                ui.pa.zOff.classList.add('selected');
            }

            if(ui.pa.eOn.classList.contains('selected')) {
                ui.pa.eOn.classList.remove('selected');
                ui.pa.eOff.classList.add('selected');
            }

            ui.detachActionListeners();
            ui.disableMovers();
        }
    }
};

UI.prototype.loadContentToPrintArea = function(gcode) {
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
};

UI.prototype.digestCmd = function(prCmd) {
    if(prCmd.indexOf(cmd.MOVE) > -1) {
        var _pa = this.pa;
        if(prCmd.indexOf('Z') > -1) {
            //  clear prev++ layer and prep
            //  for prev layer plotting
            _pa.hlLayer.clear();
            _pa.hlLayer.startPath(paths[0].x, paths[0].y);

            //  plot prev layer and draw
            for(var i = 1; i < paths.length; i++) {
                var _c = (paths[i].e !== undefined) ? RED_IND_GHOST : BLU_IND_GHOST;
                _pa.hlLayer.drawPathTo(paths[i].x, paths[i].y, _c);
                _pa.hlLayer.startPath();
            }
            _pa.hlLayer.closePath();

            //  reset "active" layer
            _pa.objLayer.clear();
            _paths = [];
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

        this.paths.push({ x: mx, y: my, e: me });
        _pa.ph.x = mx, this.pa.ph.y = my;

        //  only draw the new path here
        var _c = (me !== undefined) ? RED_INDICATOR : BLU_INDICATOR;
        _pa.objLayer.drawPathTo(mx, my, _c);
        _pa.objLayer.startPath();

        var yw, xh,
            xHandle = _pa.xSlider.children[0],
            yHandle = _pa.ySlider.children[0];
        yw = mx - (Math.floor(yHandle.offsetWidth / 2)) - Math.floor(POINTER_OFFSET / 2);
        xh = my - (Math.floor(xHandle.offsetHeight / 2)) - Math.floor(POINTER_OFFSET / 2);

        yHandle.style.left = yw + 'px';
        xHandle.style.top = xh + 'px';
        _pa.redrawIndicators();
    }

    if(prCmd.indexOf(cmd.HOME) > -1) {
        var _nh = document.getElementsByClassName('not-homed');
        for(var i = 0; i < _nh.length; i++)
            _nh[i].classList.remove('not-homed');
        ui.pa.movePrintHead(0, 0);
    }

    if(prCmd.indexOf(cmd.SET_WAIT_BDTEMP) > -1 || 
        prCmd.indexOf(cmd.SET_WAIT_EXTEMP) > -1) {

        //  toggle the on switch and set the requested temp
        if(prCmd.indexOf(cmd.SET_WAIT_BDTEMP) > -1) {
            if(!this.pa.zOn.classList.contains('selected')) {
                this.pa.zOn.classList.add('selected');
                this.pa.zOff.classList.remove('selected');
            }

            this.pa.zTempRequested.value = parseInt(prCmd.split(' ')[1].split('S')[1], 10);
        } else {
            if(!this.pa.eOn.classList.contains('selected')) {
                this.pa.eOn.classList.add('selected');
                this.pa.eOff.classList.remove('selected');
            }
            this.pa.eTempRequested.value = parseInt(prCmd.split(' ')[1].split('S')[1], 10);
        }
    }
};

UI.prototype.expandConsoleOutput = function() {
    jQuery(ui.consoleOut).show().animate({
        height:             '330px',
        'padding-top':      '8px',
        'padding-bottom':   '8px',
        top:                '-347px'
    }, 140, function() {
        jQuery('#console-nav').fadeIn(800);
        ui.consoleBottom.click();
    });
};

UI.prototype.collapseConsoleOutput = function() {
    jQuery('#console-nav').fadeOut(200, function() {
        jQuery(ui.consoleOut).animate({
            height:             '0px',
            'padding-top':      '0px',
            'padding-bottom':   '0px',
            top:                '-1px'
        }, 140, function() { 
            jQuery(ui.consoleOut).hide(); 
        });
    });
};

UI.prototype.updateConsole = function(data) {
    var _data = data.replace(/\n/g, '<br>');

    //  truncate output after ~200 rows (ignoring extra <br>)
    var LINE_COUNT = 200;

    var opTxt = ui.consoleOut.innerHTML,
        olen  = opTxt.split('<br>').length,
        nlen  = _data.split('<br>').length;

    if(nlen == LINE_COUNT)
        opTxt = _data + '<br>';
    else {
        if(nlen < LINE_COUNT) {
            if(olen + nlen <= LINE_COUNT) 
                opTxt += _data + '<br>';
            else {
                var tmp = '',
                    ots = opTxt.split('<br>').slice((olen + nlen) - LINE_COUNT - 1);
                for(var i in ots) 
                    tmp += ots[i] + '<br>';
                opTxt = tmp + _data;
            }
        } else {
            opTxt = '';
            var extra = nlen - LINE_COUNT;
            for(var j = extra; j < nlen; j++)
                opTxt += _data.split('<br>')[j];
            opTxt += '<br>';
        }
    }
    ui.consoleOut.innerHTML = opTxt;
};

UI.prototype.updateStats = function(stats) {
    ui.updateConsole(stats);

    //  update active dev UI temps
    ui.pa.eTempActual.innerHTML = active.ETemp;
    ui.pa.zTempActual.innerHTML = active.BTemp;

    //  update device list info
    // $('#devices-overlay > ul > li').each(function() {
    //     var li  = this,
    //         dn  = $(li).children('.dev-name').html(),
    //         d   = devices[dn];

    //     if(d === undefined) {
    //         $(this).remove();
    //         return;
    //     }

    //     if($(li).children('.dev-status').html() != d.job.status)
    //         $(li).children('.dev-status').html(d.job.status);

    //     if(d.job.filename !== '')
    //         $(li).children('.dev-file').html(d.job.filename);
    //     else 
    //         $(li).children('.dev-file').html('no pending / running prints');

    //     $(li).children('.dev-temp').html('E:' + d.ETemp + ' / B:' + d.BTemp);
    // });

    //  process full stat list
    if(stats.indexOf('--FULL STATS') > -1) {
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
            }

            ui.pa.movePrintHead(ui.pa.phi.x, ui.pa.phi.y);
        }
    }
};

UI.prototype.updateProgress = function(val) {
    ui.progress.style.width = val.toString() + '%';
};

UI.prototype.resetWithContent = function() {
    //  uses the completed job content
    this.jobActionBtn.classList.remove('icon-pause');
    this.jobActionBtn.classList.add('icon-play');
    this.loadContentToPrintArea(active.job.content);
};