package main

import (
    "code.google.com/p/go.net/websocket"
    "device"
    "encoding/json"
    // "flag"
    "fmt"
    "html/template"
    "io"
    "log"
    "net"
    "net/http"
    "os"
    "os/exec"
    "runtime"
    "strings"
    "strconv"
    "time"
)

var (
    appServPort = "8080"
    uiDir       = "/ui/"
    openBrowser = true
    // openBrowser = false

    dIn, dOut   chan *device.Message  //  device in / out channels
    cIn, cOut   chan *device.Message  //  client (UI) in / out channels
    jIn         chan *device.Message  //  
    errc        chan error
    devices             map[string] *device.Device

    workingDir          string
    browserLaunchArgs   []string
)

//  5DPrint launcher that will start
//  device listener, the core server
//  that will manage data flow from the
//  UI and / or other external apps
//  and feed that into the device
func main() {

    //  THE CORE
    log.Println("[INFO] 5DPrint core starting...")

    //  init core communication channels
    dIn, dOut   = make(chan *device.Message), make(chan *device.Message)
    cIn, cOut   = make(chan *device.Message), make(chan *device.Message)
    jIn         = make(chan *device.Message)
    errc        = make(chan error, 1)

    //  init the device list
    devices     = make(map[string]*device.Device)

    //  just a few OS related values need to be set (sadly)
    setOSSpecifics()

    //  init main controllers
    initSwitchBoard()
    initDeviceController()
    initClientController()
}

func setOSSpecifics() {
    var err error
    switch runtime.GOOS {
    case "darwin":
        workingDir          = "/Applications/5DPrint.app/Contents/MacOS"
        browserLaunchArgs   = []string{"open"}
    case "windows":
        workingDir, err     = os.Getwd()
        browserLaunchArgs   = []string{"cmd", "/c", "start"}
    default:
        workingDir, err     = os.Getwd()
        browserLaunchArgs   = []string{"xdg-open"}
    }

    if err != nil {
        log.Println("[ERROR] unable to get a valid working directory: ", err)
        os.Exit(1)
    }
}

func initSwitchBoard() {
    go func() {
        //  process all client in messages
        for msg := range cIn {
            if msg.Type == "core" {
                //  handle in the core
                if msg.Action == "dc" {
                    // n, g := "", ""
                    n := ""
                    if len(devices) > 0 {
                        var names []string
                        for n, _ := range devices {
                            names = append(names, n)
                        }

                        //  for the short term, we're assuming
                        //  that only 1 device is attached, most
                        //  -likely the MakiBox A6
                        //
                        n = names[0]
                        // g = (devices[names[0]]).Greeting 
                        //  not really doing anything with the "greeting" in the UI

                        cOut <- &device.Message {
                            Type:   "response",
                            Action: "dc",
                            Device: n,
                            Body:   "attached",
                        }
                    }else {
                        //  send no device attached msg
                        //  
                        cOut <- &device.Message {
                            Type:   "response",
                            Action: "dc",
                            Device: "nil",
                            Body:   "nil",
                        }
                    }
                }
            } else {
                //  ship to device out channel
                if devices[msg.Device] != nil {
                    dOut <- msg
                } else {
                    cOut <- &device.Message {
                        Type:   "response",
                        Device: msg.Device,
                        Action: "error",
                        Body:   "[ERROR] invalid device name - " + msg.Device,
                    }
                }
            }
        }
    }()

    go func() {
        for msg := range dIn {
            if msg.Type == "core" {
                //  TODO: handle core messages
                log.Println("[TODO] handle this: ", msg)
            } else {
                //  ship to client out channel
                cOut <- msg
            }
        }
    }()
}

//  initialize the device controller
//  that will listen for a device attach /
//  detach signal and start the in / out
//  channels for communication
func initDeviceController() {
    go func() {
        for {
            dn, err := device.GetAttachedDevices(&devices)
            if err != nil {
                //  we'll log the error for now
                //  but we should prolly look into
                //  doing something with this, depending
                //  on the error type
                if !strings.HasSuffix(err.Error(), "no such file or directory") {
                    if strings.HasSuffix(err.Error(), "device removed") {
                        log.Println("[DEBUG] informing of device removal...")
                        //  inform the core the device is detached
                        dIn <- &device.Message {
                            Type:   "response",
                            Device: (strings.Split(err.Error(), " "))[0],
                            Action: "dc",
                            Body:   "detached",
                        }
                    } else {
                        log.Println(err)
                    }
                }
            }

            if len(dn) > 1 {
                //  inform the core that a device is attached
                //  
                dIn <- &device.Message {
                    Type:   "response",
                    Device: dn,
                    Action: "dc",
                    Body:   "attached",
                }
            }

            //  do a quick sleep here so that we don't
            //  ping the devices _too_ much
            time.Sleep(1000 * time.Millisecond) 
        }
    }()

    go func() {
        for msg := range dOut {
            if devices != nil && len(devices) > 0 && devices[msg.Device] != nil {
                dev := devices[msg.Device]
                if !dev.JobRunning && msg.Action != "job" {
                    r, err := dev.Do(msg.Action, msg.Body)
                    if err != nil {
                        if err.Error() == "no such file or directory" || err.Error() == "device not configured" {
                            delete(devices, msg.Device)
                        } else {
                            log.Println("[ERROR] unable to complete action: ", err)
                        }
                    }

                    if r != nil {
                        dIn <- r
                    }
                } else {
                    if dev.JobRunning {
                        //  send msg to the job queue channel
                        jIn <- msg
                    } else {
                        if msg.Action == "job" {
                            go runExtendedJob(msg)
                        }
                    }
                }
            } else {
                log.Println("[ERROR] invalid device provided")
            }
        }
    }()
}

//  initialize the ui controller
//  that will start a standard ui
//  and start the in / out channels
//  for communication to and from
//  the ui and core
func initClientController() {
    // 
    var ip string

    host, err := os.Hostname()
    if err != nil {
        log.Println("[ERROR] unable to get app server address: ", err)
        os.Exit(1)
    }

    ipList, err := net.LookupIP(host)
    if err != nil {
        log.Println("[ERROR] unable to get app server address: ", err)
        os.Exit(1)
    }

    if len(ipList) < 1 {
        log.Println("[WARN] you will not be able to connect any external devices with a valid address")
        ip = "localhost"
    }else {
        //  handle IPv6 addresses 
        //  (seems they aren't supported at the moment)
        if len(ipList) > 1 {
            for _, i := range ipList {
                if !strings.Contains(i.String(), ":") {
                    ip = i.String()
                }
            }
        } else {
            ip = ipList[0].String()
        }
    }
    addr := ip + ":" + appServPort

    //  ===[ TODO ]
    //  we'll use the default UI dir
    //  for now, but should check a 
    //  config file to specify
    dir := workingDir + uiDir + "/default"

    //  init default server and push out the
    //  it's UI plus dependencies
    fs := http.FileServer(http.Dir(dir))
    http.Handle("/favicon.ico", fs)
    http.Handle("/css/", fs)
    http.Handle("/js/", fs)
    http.Handle("/img/", fs)
    http.Handle("/fonts/", fs)

    //  client websocket handler
    http.Handle("/abs", websocket.Handler(clientWsHandler))

    //  handle the index page
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/" {
            uiType := 0
            if strings.Contains(r.UserAgent(), "Android") {  //  TODO: handle iOS
                uiType = 1;
            }

            if err := renderUI(uiType, w, dir); err != nil {
                log.Fatal(fmt.Printf("[ERROR] unable to reneder default UI: %v\n", err))
            }
            return
        }
        http.Error(w, "not found", 404)
    })

    go func() {
        url := "http://" + addr
        if wait(url) && openBrowser && launchBrowser(url) {
            log.Printf("[INFO] a browser window should open. If not, please visit %s\n", url)
        } else {
            log.Printf("[INFO] unable to open your browser. Please open and visit %s\n", url)
        }
    }()
    log.Fatal(http.ListenAndServe(addr, nil))
}

//  ===
//  === [ HELPERS ]
//  ===

//  wait a bit for the server to start
//  and we'll give her plenty of chances (20)
func wait(url string) bool {
    tries := 20
    for tries > 0 {
        resp, err := http.Get(url)
        if err == nil {
            resp.Body.Close()
            return true
        }
        time.Sleep(100 * time.Millisecond)
        tries--
    }
    return false
}

//  === [ TODO ]
//  use the CEF (Chromium Embedded Framework)
//  and allow the user to decide via a config.
//  in the interim, we'll just launch the users
//  default browser to display the UI in
func launchBrowser(url string) bool {
    cmd := exec.Command(browserLaunchArgs[0], append(browserLaunchArgs[1:], url)...)
    return cmd.Start() == nil
}

//  === [ TODO ]
//  for now we'll just render the default
//  UI. But this should take the UI requested
//  by the attached device
//  the "default/index.html" will need to be
//  updated to an "admin panel" for managing
//  external devices like Android or iOS device
func renderUI(ui int, w io.Writer, wd string) error {
    i := "/index.html"  //  default to desktop ui
    if ui == 1 {
        i = "/sm_index.html"
    }

    t, err := template.ParseFiles(wd + i)
    if err != nil {
        panic(err)
        // log.Println(err)
        // os.Exit(-1)
    }
    t.Execute(w, "")
    return nil
}

//  websocket handler that will manage the
//  traffic to and from the UI and Core
func clientWsHandler(c *websocket.Conn) {
    //  decode incoming client messages
    //  and push to client in channel
    go func() {
        dec := json.NewDecoder(c)
        for {
            var msg device.Message
            if err := dec.Decode(&msg); err != nil {
                errc <- err
                return
            }
            cIn <- &msg
        }
    }()

    //  encode outgoing client messages
    //  and push to the client socket
    go func() {
        enc := json.NewEncoder(c)
        for msg := range cOut {
            if err := enc.Encode(msg); err != nil {
                errc <- err
                return
            }
        }
    }()

    for {
        err := <-errc
        if err != io.EOF {
            log.Println("[ERROR] ", err)
            return
        }
    }
}

func runExtendedJob(msg *device.Message) {
    dev := devices[msg.Device]
    pause := false

    go func() {
        lines   := strings.Split(dev.GCode.Data, "\n")
        idx     := 0

        dev.JobRunning = true   //  flag that job is running
        for {
            if idx == len(lines) {
                dev.JobRunning = false
                dIn <- dev.ResponseMsg("job", "completed")

                jIn <- &device.Message {
                    Type:   "device",
                    Device: dev.Name,
                    Action: "completion",
                    Body:   "",
                }
                return
            }

            ln := lines[idx]

            //  we can exclude commented and empty lines
            if !strings.HasPrefix(ln, ";") && len(ln) > 1 {
                cmd := ln
                if !strings.HasSuffix(ln, "\r\n") {
                    cmd += device.FWLINETERMINATOR
                }

                //  === 
                //  === [ HACK ]
                //  this is assuming we're on a 3D
                //  printer and doesn't generalize
                //  for all devices
                if strings.HasPrefix(ln, "M109") || strings.HasPrefix(ln, "M190") {
                    dev.LobCommand(cmd) //  lob the cmd we want to run first

                    pause = true
                    pre  := "B:"    //  assume hotbed first
                    if strings.HasPrefix(ln, "M109") {
                        pre = "T:"   //  set to hotend if M109
                    }

                    switch pre {
                    case "B:":
                        log.Println("[INFO] waiting for bed to reach temp")
                    case "T:":
                        log.Println("[INFO] waiting for hotend to reach temp")
                    }

                    //  parse out the temp a bit
                    sub := ln[strings.Index(ln, "S")+1:]
                    if strings.Contains(sub, " ") {
                        sub = sub[:strings.Index(sub, " ")]
                    }

                    temp, e := strconv.Atoi(sub)
                    if e != nil {
                        log.Println(e)
                    }

                    //  we'll force a pause in the job
                    //  to allow for the device to get 
                    //  up to temp before sending more
                    //  lines over

                    for pause {
                        time.Sleep(1500 * time.Millisecond)

                        stat := "M105" + device.FWLINETERMINATOR
                        resp, err := dev.LobCommand(stat)
                        if err != nil {
                            //  ===[ TODO ]
                            log.Println(err)
                        }

                        dIn <- dev.ResponseMsg("job", resp) //  inform the UI / user
                        for _, data := range strings.Split(resp, "\n") {
                            if strings.Contains(data, "T:") {
                                for _, val := range strings.Split(data, " ") {
                                    if strings.Contains(val, pre) {
                                        i := strings.Index(val, pre)
                                        t, e := strconv.Atoi(val[i+2:])
                                        if e != nil {
                                            log.Println(e)
                                        }

                                        if t >= temp {
                                            pause = false
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {  //  === [ HACK ]
                    for pause {
                        log.Println("[INFO] Job appears to be paused...")
                        time.Sleep(8000 * time.Millisecond)
                    }

                    jIn <- &device.Message {
                        Type:   "device",
                        Device: dev.Name,
                        Action: "cmd",
                        Body:   cmd,
                    }

                    if idx % 5 == 0 {
                        cmd = "M105" + device.FWLINETERMINATOR
                        jIn <- &device.Message {
                            Type:   "device",
                            Device: dev.Name,
                            Action: "cmd",
                            Body:   cmd,
                        }
                    }
                }
            }
            idx++
        }
    }()

    go func() {
        for m := range jIn {
            log.Println("[DEBUG] current cmd: ", m.Body)

            if m.Type == "device" {
                switch m.Action {
                case "cmd":
                    cmd := m.Body
                    resp, err := dev.LobCommand(cmd)
                    if err != nil {
                        //  ===[ TODO ]
                        log.Println(err)
                    }

                    // log.Println(resp)
                    dIn <- dev.ResponseMsg("job", resp)

                case "pause":
                    pause = true

                case "stop":
                    pause = true

                // case "continue":
                //     pause = false

                case "completion":
                    return
                }
            }
        }
    }()
}
