5DPrint
=======

MakiBox host software primary written in Go, with the UI / client code written in HTML/CSS/Javascript

_src/_ contains the code corresponding to the device(s) and communications (i.e. serial / USB / websocket), while the _core_ is maintained in __5DPrint.go__. The _core_ consists of the backend server that will launch a _device listener_, a _websocket listener_ and the users default browser while mantaining *__go channels__* for communications between the devices and client(s). 
>__Please note__ that the currently tested / supported browsers are the stable builds of _Chrome_ and _Firefox_. This will change, but for the early stages this is what we're using.

##Usage##

###Windows###
In the .config directory, you need to create a new .txt file with the name of the COM port the device is attached prefixed with 2 "_" (no quotes)
>Example: if the device is on COM port 6, file name should be __COM6.txt

###OS X and Linux###
This currently assumes that your device is the only "usbmodem" attached. The device should be automatically detected via "/dev/tty.usbmodem001"
You can not double-click on the binary/executable for this due to user space vs. application, so you will need to run from the command line via:
```shell
cd <directory you extracted tar to>/go5d_osx
./5DPrint
```

###The Device Listener###
The device listener has the duty to continuously loop and check for the attachment of a _device_. When a recognizable device is connected, it will store a proper reference and notify the __client__ (the frontend UI) that a new device is attached.
>__Please note__ in the early releases we're only assuming the MakiBox A6 is attached and the code will have some odd references as such

###Web UI###
The UI is kept in the directory _ui/default_ and coded in modern web standards in order to allow for easy modifications and a friendlier cross-platform starting point. 

##Goals // TODO's##
- [ ] tokenized api to allow for other applications to connect (i.e. mobile devices, other computers on the same network)
- [ ] update the core to maintain all the communications via _go channels_
- [ ] include / work in the Chromium Embedded Framework (CEF)
- [ ] generalize the device code more to allow for __configurable device modules__ in order to include other printers / devices instead of _just_ the A6
