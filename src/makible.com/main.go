package main

import (
    
)

var (
    defServPort = "8080"
    uiDir       = "/ui/"
    // openBrowser = true
    // dbg         = false

    //  === [ DEBUGGING USE ]
    openBrowser = false
    dbg         = true

    devc, clientc           chan *Message
    devices                 map[string] *device.Device
    workingDir              string
    launchBrowserArgs       []string
    deviceListenerRunning   bool
)

func main() {
    log.Pringln("5DPrint starting..")
    // runtime.GOMAXPROCS(2)

    devices = make(map[string] *device.Device)
    devc, clientc   = make(chan *Message), make(chan *Message)

    initOSVars()
    go initDeviceListener()
    initHttpServer()
}