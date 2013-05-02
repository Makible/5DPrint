package main

import (
    "code.google.com/p/go.net/websocket"
    "device"
    "encoding/json"
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
    // "strconv"
    "time"
)

var (
    defServPort = "8080"
    uiDir       = "/ui/"
    openBrowser = true

    //  [ TODO ]
    //  break out into .conf flag
    // openBrowser = false
    // defServPort = "8081"

    devc, clientc, jobc     chan *device.Message
    errc                    chan error
    devices                 map[string] *device.Device
    workingDir              string
    launchBrowserArgs       []string
)

func main() {
    log.Println("[INFO] 5DPrint starting...")

    devices              = make(map[string] *device.Device)
    devc, clientc, jobc  = make(chan *device.Message), make(chan *device.Message), make(chan *device.Message)
    errc                 = make(chan error, 1)

    //  init OS specific variables
    initOSVars()

    initDeviceController()
    initJobQueueController()
    initHttpServer()
}

func initOSVars() {
    var err error

    switch runtime.GOOS {
    case "darwin":
        workingDir          = "/Applications/5DPrint.app/Contents/MacOS"
        launchBrowserArgs   = []string{"open"}
    case "windows":
        workingDir, err     = os.Getwd()
        launchBrowserArgs   = []string{"cmd", "/c", "start"}
    default:
        workingDir, err     = os.Getwd()
        launchBrowserArgs   = []string{"xdg-open"}
    }

    if err != nil {
        log.Println("[ERROR] unable to get a valid working directory: ", err)
        os.Exit(1)
    }
}

//
//  start the loop that will check for valid devices
//  attached and update the list accordingly
func initDeviceController() {
    go func() {
        for {
            select {
            case msg := <-devc:
                if devices != nil && len(devices) > 0 && devices[msg.Device] != nil {
                    dev := devices[msg.Device]
                    if dev.JobRunning && msg.Action == "job" {
                        clientc <- &device.Message {
                            Type:   "response",
                            Device: dev.Name,
                            Action: "error",
                            Body:   `{
                                        error:  'unable to run multiple jobs on single device',
                                        action: '` + msg.Action + `',
                                        body:   '` + msg.Body + `',
                                    }`,
                        }
                        checkDevices()
                    } else {
                        jobc <- msg
                        checkDevices()
                    }
                } 

            default:
                //  default will be to check for device attach / detach
                //  and do a quick sleep so that we don't we don't ping
                //  the existing devices _too_ much
                checkDevices()
                time.Sleep(500 * time.Millisecond) 
            }
        }
    }()
}

func initJobQueueController() {
     go func() {
        queue, hold := make([]device.Command, 100), make([]device.Command, 100)

        for {
            select {
            case msg := <-jobc:
                if devices[msg.Device] == nil {
                    clientc <- &device.Message {
                        Type:   "response",
                        Device: msg.Device,
                        Action: "error",
                        Body:   `{
                                    error:  'invalid device provided',
                                    action: '` + msg.Action + `',
                                    body:   '` + msg.Body + `'
                                }`,

                    }
                    hit(&queue, &hold)
                }

                dev := devices[msg.Device]
                if msg.Action == "job" {
                    for _, line := range strings.Split(dev.GCode.Data, "\n") {
                        cmd := &device.Command {
                            Devicename: dev.Name,
                            Command:    line,
                        }
                        queue = append(queue, *cmd)
                    }

                    dev.JobRunning = true
                    hit(&queue, &hold)
                }

                if !dev.JobRunning {
                    r, err := dev.Do(msg.Action, msg.Body)
                    if err != nil {
                        if strings.HasSuffix(err.Error(), device.NSF) || strings.HasSuffix(err.Error(), device.DNC) {
                            delete(devices, msg.Device)
                        } else {
                            log.Println("[ERROR] unable to complete action: ", err)
                        }
                    }

                    if r != nil { clientc <- r }
                    hit(&queue, &hold)

                } else {
                    if msg.Action == "status" {
                        r, err := dev.Do(msg.Action, msg.Body)
                        if err != nil {
                            if strings.HasSuffix(err.Error(), device.NSF) || strings.HasSuffix(err.Error(), device.DNC) {
                                delete(devices, msg.Device)
                            } else {
                                log.Println("[ERROR] unable to complete action: ", err)
                            }
                        }

                        if r != nil { clientc <- r }
                        hit(&queue, &hold)
                    }

                    if msg.Action == "resume" && dev.JobPaused {
                        //  [ TODO ]
                        //  mull through the hold list and copy
                        //  the commands to the queue list, removing
                        //  from the hold


                        
                        hit(&queue, &hold)
                    }

                    if msg.Action == "interrupt" {
                        //  [ TODO ]
                        //  mull through the queue list and copy
                        //  the commands to the hold list, removing
                        //  from the queue

                        hit(&queue, &hold)
                    }
                }

            default:
                hit(&queue, &hold)
            }
        }
    }()
}

func initHttpServer() {
    var ip string

    //  we need to get the hostname in order to get the IP
    host, err := os.Hostname()
    if err != nil {
        log.Println("[ERROR] unable to get app server address: ", err)
        os.Exit(1)
    }

    //  list out the available IP's according to the hostname
    ipList, err := net.LookupIP(host)
    if err != nil {
        log.Println("[ERROR] unable to get app server address: ", err)
        os.Exit(1)
    }

    //  check if an IPv4 is avialable and set to to 'localhost' if not
    //  we aren't going to work with IPv6 address at the moment, so
    //  ignore / exclude and just use the available IPv4 if ipList > 1
    if len(ipList) < 1 || (len(ipList) == 1 && strings.Contains(ipList[0].String(), ":")) {
        //  [ TODO ]
        //  double check and see if this is still valid when no network connection is available
        log.Println("[WARN] you will not be able to connect any external devices with a valid address")
        ip = "localhost"
    } else {
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

    addr := ip + ":" + defServPort
    dir  := workingDir + uiDir + "/default"

    //  [ TODO ]
    //  check .config to see if a specified UI is set,
    //  if not just use default

    fs := http.FileServer(http.Dir(dir))
    http.Handle("/favicon.ico", fs)
    http.Handle("/css/", fs)
    http.Handle("/js/", fs)
    http.Handle("/img/", fs)
    http.Handle("/fonts/", fs)

    http.Handle("/abs", websocket.Handler(clientWsHandler))
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
        url := "http://" + addr
        if wait(url) && openBrowser && launchBrowser(url) {
            log.Printf("[INFO] a browser window should open. If not, please visit %s\n", url)
        } else {
            log.Printf("[INFO] unable to open your browser. Please open and visit %s\n", url)
        }
    }()
    log.Fatal(http.ListenAndServe(addr, nil))
}

//  
//  === [ HELPERS ]
//  

//  wait a bit for the web server to start
func wait(url string) bool {
    tries := 20
    for tries > 0 {
        resp, err := http.Get(url)
        if err == nil {
            resp.Body.Close()
            return true
        }
        time.Sleep(100 * time.Millisecond)
        tries --
    }
    return false
}

func launchBrowser(url string) bool {
    cmd := exec.Command(launchBrowserArgs[0], append(launchBrowserArgs[1:], url)...)
    return cmd.Start() == nil
}

func renderUI(w io.Writer, wd string) error {
    i := "/index.html"
    t, err := template.ParseFiles(wd + i)
    if err != nil {
        panic(err)
    }

    t.Execute(w, "")
    return nil
}

func clientWsHandler(c *websocket.Conn) {
    //  [ TODO ]
    //  do we need a check in each of these routines
    //  that will return when the channels are closed?
    //  will this hold open memory after the application
    //  hask "shutdown"?

    go func() {
        dec := json.NewDecoder(c)
        for {
            var msg device.Message
            if err := dec.Decode(&msg); err != nil {
                errc <- err
                return
            }
            devc <- &msg
        }
    }()

    go func() {
        enc := json.NewEncoder(c)
        for msg := range clientc {
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

func checkDevices() {
    dn, err := device.GetAttachedDevices(&devices)
    if err != nil {
        if !strings.HasSuffix(err.Error(), device.NSF) && !strings.HasSuffix(err.Error(), device.DNC) {
            if strings.HasSuffix(err.Error(), device.RM) {
                //  notify device detached
                clientc <- &device.Message {
                    Type:   "response",
                    Device: (strings.Split(err.Error(), " "))[0],
                    Action: "connection",
                    Body:   "detached",
                }
            }else {
                //  display error
                log.Println(err)

                //  [ TODO ] 
                //  handle this better
            }
        }
    }

    //  this means a new device was attached
    //  and someone should be notified
    if len(dn) > 1 {
        clientc <- &device.Message {
            Type:   "response",
            Device: dn,
            Action: "connection",
            Body:   "attached",
        }
    }
}

func hit(q *[]device.Command, h *[]device.Command) {
    // queue, hold := *q, *h
    queue := *q

    dn, cmd := (queue[0]).Devicename, (queue[0]).Command
    if devices[dn] == nil {
        clientc <- &device.Message {
            Type:   "response",
            Device: dn,
            Action: "error",
            Body:   `{
                        error:   'device not available',
                        command: '` + cmd + `',
                    }`,
        }

        //  [ TODO ]
        //  remove all commands in queue related dn
        return
    }
}