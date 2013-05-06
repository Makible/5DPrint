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
    "time"
)

var (
    defServPort = "8080"
    uiDir       = "/ui/"
    // openBrowser = true
    // dbg = false

    //  [ TODO ]
    //  break out into .conf flag
    // defServPort = "8081"
    openBrowser = false
    dbg = true

    devc, clientc           chan *device.Message
    devices                 map[string] *device.Device
    workingDir              string
    launchBrowserArgs       []string
)

func main() {
    log.Println("[INFO] 5DPrint starting...")
    runtime.GOMAXPROCS(2)   //  increasing the count for background processes

    devices              = make(map[string] *device.Device)
    devc, clientc        = make(chan *device.Message), make(chan *device.Message)

    //  init OS specific variables
    initOSVars()

    initDeviceListener()
    initJobQueueController()
    initHttpServer()
}

func initOSVars() {
    var err error

    switch runtime.GOOS {
    case "darwin":
        // workingDir          = "/Applications/5DPrint.app/Contents/MacOS"
        workingDir, err     = os.Getwd()
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
func initDeviceListener() {
    go func() {
        for {
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
                        //
                        //  [ TODO ] 
                        //  handle this better but for now
                        //  just display the error
                        log.Println("[ERROR] device check: ", err)

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

                //  we'll just accept the one for now to free up some resources
                return
            }

            //  do a quick sleep so that we don't we don't ping
            //  the existing devices _too_ much
            time.Sleep(800 * time.Millisecond) 
        }
    }()
}

func initJobQueueController() {
    go func() {
        cmdq, holdq := make([]device.Command, 1), make([]device.Command, 1)
        for {
            select {
            case msg := <- devc:
                if devices != nil && len(devices) > 0 && devices[msg.Device] != nil {
                    dev := devices[msg.Device]
                    if dev == nil {
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
                    } else if dev.JobRunning && msg.Action == "job" {
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
                    } else {
                        //  load up the cmdq and let the job run
                        if msg.Action == "job" && !dev.JobRunning {
                            for _, line := range strings.Split(dev.GCode.Data, "\n") {
                                var cmd device.Command

                                cmd.Devicename  = dev.Name
                                cmd.Command     = line

                                cmdq = append(cmdq, cmd)

                                //  pop off the empty command
                                if (cmdq[0]).Devicename == "" { 
                                    cmdq = cmdq[1:1] 
                                }
                            }
                            dev.JobRunning = true
                        } else {
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

                                } else if msg.Action == "resume" && dev.JobPaused {

                                    //  go through the holdq list and copy
                                    //  the commands to the cmdq list, removing
                                    //  from the holdq
                                    tmp := make([]device.Command, len(holdq))
                                    copy(tmp, holdq)

                                    holdq = make([]device.Command, 1)
                                    for _, c := range tmp {
                                        if c.Devicename == dev.Name {
                                            cmdq = append(cmdq, c)
                                        } else {
                                            holdq = append(holdq, c)
                                        }
                                    }
                                    dev.JobPaused = true;

                                } else if msg.Action == "interrupt" {

                                    if msg.Body != "stop" {
                                        //  go through the cmdq list and copy
                                        //  the commands to the holdq list, removing
                                        //  from the cmdq
                                        tmp := make([]device.Command, len(cmdq))
                                        copy(tmp, cmdq)

                                        cmdq = make([]device.Command, 1)
                                        for _, c := range tmp {
                                            if c.Devicename == dev.Name {
                                                holdq = append(holdq, c)
                                            } else {
                                                cmdq = append(cmdq, c)
                                            }
                                        }
                                        dev.JobPaused = true;
                                    } else {
                                        dev.Do("console", "M112")   //  MakiBox Emergency Stop
                                    }

                                }
                            }
                        }
                    }
                } else {
                    clientc <- &device.Message {
                        Type:   "response",
                        Device: msg.Device,
                        Action: "error",
                        Body:   `{
                                    error:  'invalid device provided',
                                    action: '` + msg.Action + `',
                                    body:   '` + msg.Body + `',
                                }`,
                    }
                }
            default: 

                if len(cmdq) > 0 {
                    dn, cmd := (cmdq[0]).Devicename, (cmdq[0]).Command
                    if dn != "" {
                        dev := devices[dn]
                        cmdq = cmdq[1:len(cmdq)-1]   //  pop the zero item off

                        log.Println(cmd)

                        if dev == nil {
                            clientc <- &device.Message {
                                Type:   "response",
                                Device: dn,
                                Action: "error",
                                Body:   `{
                                            error:   'device not available',
                                            command: '` + cmd + `',
                                        }`,
                            }

                            //  
                            //  [ TODO ]
                            //  remove all commands in cmdq related dn
                        } else {
                            if !strings.HasPrefix(cmd, ";") && cmd != "" {
                                cmd += device.FWLINETERMINATOR

                                r, err := dev.LobCommand(cmd)
                                if err != nil {
                                    //
                                    //  [ TODO ]
                                    //  handle this better
                                    log.Println("[ERROR] main / dev.LobCommand: ", err)
                                    if err.Error() != device.DNC {
                                        return
                                    } 
                                }

                                clientc <- dev.ResponseMsg("job", r)

                                //  
                                //  [ TODO ]
                                //  clear comm listen buffer
                                //
                            }
                        }
                    } else {
                        if len(cmdq) > 1 { cmdq = cmdq[1:len(cmdq)-1] }
                    }
                }
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
        if len(ipList) == 1 && strings.Contains(ipList[0].String(), ":") {
            log.Println("[WARN] currently not supporting IPv6, defaulting to 'localhost'")
        }
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
        tries--
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
    //  will this holdq open memory after the application
    //  hask "shutdown"?
    go func() {
        enc := json.NewEncoder(c)
        for m := range clientc {
            if err := enc.Encode(m); err != nil {
                log.Println("[ERROR] clientc channel read: ", err)
                return
            }
        }
    }()

    dec := json.NewDecoder(c)
    for {
        var msg device.Message
        if err := dec.Decode(&msg); err != nil  && err != io.EOF {
            log.Println("[ERROR] dec.Decode: ", err)
            return
        }
        devc <- &msg
    }
}
