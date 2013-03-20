package main

import (
    "code.google.com/p/go.net/websocket"
    "device"
    "encoding/json"
    "flag"
    "fmt"
    "html/template"
    "io"   
    "log"
    "net"
    "net/http"
    "os"
    "os/exec"
    "runtime"
    "time"
)

var (
    httpListen      = flag.String("http", "localhost:8080", "host:port to listen on")
    htmlOutput      = flag.Bool("html", false, "render output as HTML")
    uiDir           = flag.String("uidir", "/ui/", "working directory for the ui code")
    // dataDir         = flag.String("datadir", "/data/", "working directory for misc data")
    // confDir         = flag.String("confdir", "/.config/", "working directory for app configuration")
    // openBrowser  = flag.Bool("openbrowser", false, "open browser automagically")
    openBrowser     = flag.Bool("openbrowser", true, "open browser automagically")

    done = false

    dIn, dOut chan *device.Message  //  device in / out channels
    cIn, cOut chan *device.Message  //  client (UI) in / out channels

    errc chan error

    devices map[string] *device.Device
)

//  5DPrint launcher that will start
//  device listener, the core server
//  that will manage data flow from the
//  UI and / or other external apps
//  and feed that into the device
func main() {

    //  THE CORE
    log.Println("[INFO] 5DPrint core starting...")

    //  init basics
    flag.Parse()

    //  init core communication channels
    dIn, dOut   = make(chan *device.Message), make(chan *device.Message)
    cIn, cOut   = make(chan *device.Message), make(chan *device.Message)
    errc        = make(chan error, 1)

    //  init the device list
    devices     = make(map[string]*device.Device)

    //  init main controllers
    initSwitchBoard()
    initDeviceController()
    initClientController()

    //  application loop
}

func initSwitchBoard() {
    go func() {
        //  process all client in messages
        for msg := range cIn {
            if msg.Type == "core" {
                //  handle in the core
                if msg.Action == "dc" {
                    n, g := "", ""
                    if len(devices) > 0 {
                        var names []string
                        for n, _ := range devices {
                            names = append(names, n)
                        }

                        //  for the short term, we're assuming
                        //  that only 1 device is attached, most
                        //  -likely the MakiBox A6
                        n = names[0]
                        g = (devices[names[0]]).Greeting

                        cOut <- &device.Message {
                            Type:   "response",
                            Action: "dc",
                            Device: n,
                            Body:   g,
                        }
                    }
                }
            } else {
                //  ship to device out channel
                dOut <- msg
            }
        }
    }()

    go func() {
        for msg := range dIn {
            if msg.Type == "core" {
                //  handle in the core
                if msg.Action == "inform" {
                    cOut <- msg
                }
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
                log.Println(err)
            }

            if len(dn) == 0 && len(devices) < 1 {
                log.Printf("[WARN] no device(s) detected. Please attach or power on a valid device")
            }

            if len(dn) > 1 {
                //  inform the core that a device is attached
                dIn <- &device.Message {
                    Type:   "core",
                    Device: dn,
                    Action: "inform",
                    Body:   "",
                }
            }

            //  do a quick sleep here so that we don't
            //  ping the devices _too_ much
            time.Sleep(1000 * time.Millisecond) 
        }
    }()

    go func() {
        //  process dOut messages here
        // for {
        for msg := range dOut {
            if devices != nil && len(devices) > 0 && devices[msg.Device] != nil {
                dev := devices[msg.Device]
                if !dev.Printing && msg.Action != "print" {
                    r, err := dev.Do(msg.Action, msg.Body)
                    if err != nil {
                        log.Println("[ERROR] unable to complete action: ", err)
                    }

                    if r != nil {
                        dIn <- r
                    }
                } else {
                    if !dev.Printing {

                    } else {
                        if msg.Action == "print" {
                            //  do print
                        }

                        
                    }
                }
            } else {
                log.Println("[ERROR] invalid device provided")
            }
        }
        // }
    }()
}

//  initialize the ui controller
//  that will start a standard ui
//  and start the in / out channels
//  for communication to and from
//  the ui and core
func initClientController() {
    //  
    host, port, err := net.SplitHostPort(*httpListen)
    if err != nil {
        log.Fatal(fmt.Printf("[ERROR] unable to parse host/port: %v\n", err))
        return
    }

    if host == "" {
        host = "localhost"
    }
    if host != "127.0.0.1" && host != "localhost" {
        log.Fatal(fmt.Printf("[ERROR] we shouldn't have gotten here, but it would appear we're not using the localhost: %s\n", host))
        return
    }
    localAddr := host + ":" + port

    wd, err := os.Getwd()
    if err != nil {
        panic(err)
        // log.Println(err)
        // os.Exit(-1)
    }

    //  ===[ TODO ]
    //  we'll use the default UI dir
    //  for now, but should check a 
    //  config file to specify
    dir := wd + *uiDir + "/default"

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
            if err := renderUI(w, dir); err != nil {
                log.Fatal(fmt.Printf("[ERROR] unable to reneder default UI: %v\n", err))
            }
            return
        }
        http.Error(w, "not found", 404)
    })

    go func() {
        url := "http://" + localAddr
        if wait(url) && *openBrowser && launchBrowser(url) {
            log.Printf("[INFO] a browser window should open. If not, please visit %s\n", url)
        } else {
            log.Printf("[WARN] unable to open your browser. Please open and visit %s\n", url)
        }
    }()
    log.Fatal(http.ListenAndServe(localAddr, nil))
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
    var args []string
    switch runtime.GOOS {
    case "darwin":
        args = []string{"open"}
    case "windows":
        args = []string{"cmd", "/c", "start"}
    default:
        args = []string{"xdg-open"}
    }

    cmd := exec.Command(args[0], append(args[1:], url)...)
    return cmd.Start() == nil
}

//  === [ TODO ]
//  for now we'll just render the default
//  UI. But this should take the UI requested
//  by the attached device
//  the "default/index.html" will need to be
//  updated to an "admin panel" for managing
//  external devices like Android or iOS device
func renderUI(w io.Writer, wd string) error {
    t, err := template.ParseFiles(wd + "/index.html")
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