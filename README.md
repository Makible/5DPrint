5DPrint
=======

Host software for the MakiBox 3D Printer

Primary application is written in Go, while the UI / client code is written in HTML/CSS/Javascript

_src/_ contains the server code for the device(s) and communications, while the _core_ is maintained __5DPrint.go__. The _core_ consists of the backend server that will launch a _device listener_, a _websocket listener_ and the users default browser. __Please note__ that the currently tested / supported browsers are the stable builds of _Chrome_ and _Firefox_. This will change, but for the early stages this is what we're using.

##The Device Listener##
The device listener has the duty to continuously loop and check for the attachment of a _device_. When a recognizable device is connected, it will store a proper reference and notify the __client__ (the frontend UI) that a new device is attached.
>_Please note_ in the early releases we're only assuming the MakiBox A6 is attached and the code will have some odd references as such

