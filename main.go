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

type connection struct {
    ws   *websocket.Conn
    send chan *device.Message
}

type hub struct {
    connections map[*connection] bool
    register    chan *connection
    unregister  chan *connection
    broadcast   chan *device.Message
}

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

    wshub             hub
    devices           map[string] *device.Device
    devc              chan *device.Message
    errc              chan error
    workingDir        string
    launchBrowserArgs []string
    listenerRunning   bool
)

func main() {
    log.Println("[INFO] 5DPrint starting...")
    //    runtime.GOMAXPROCS(2)   //  increasing the count for background processes

    devices = make(map[string] *device.Device)
    devc    = make(chan *device.Message)
    errc    = make(chan error, 1)
    wshub = hub {
        connections: make(map[*connection] bool),
        register:    make(chan *connection),
        unregister:  make(chan *connection),
        broadcast:   make(chan *device.Message),
    }

    //  init OS specific variables
    initOSVars()

    go initDeviceListener()
    go initWsSwitchBoard()

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
    for {
        listenerRunning = true

        dn, err := device.GetAttachedDevices(&devices)
        if err != nil {
            if !strings.HasSuffix(err.Error(), device.NSF) && !strings.HasSuffix(err.Error(), device.DNC) {
                if strings.HasSuffix(err.Error(), device.RM) {
                    //  notify device detached
                    wshub.broadcast <- &device.Message {
                        Type:   "response",
                        Device: (strings.Split(err.Error(), " "))[0],
                        Action: "connection",
                        Body:   "detached",
                    }
                } else {
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
            wshub.broadcast <- &device.Message {
                Type:   "response",
                Device: dn,
                Action: "connection",
                Body:   "attached",
            }

            //  we'll just accept the one for now to free up some resources
            listenerRunning = false
            return
        }

        //  do a quick sleep so that we don't we don't ping
        //  the existing devices _too_ much
        time.Sleep(800 * time.Millisecond) 
    }
}

func initWsSwitchBoard() {
    for {
        select {
        case c := <-wshub.register:
            wshub.connections[c] = true
        case c := <-wshub.unregister:
            delete(wshub.connections, c)
            if _, ok := <-c.send; ok { close(c.send) }
        case msg := <-wshub.broadcast:
            for c := range wshub.connections {
                select {
                case c.send <-msg:
                default:
                    delete(wshub.connections, c)
                    close(c.send)
                    go c.ws.Close()
                }
            }
        }
    }
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
            index := "/index.html"
            t, err := template.ParseFiles(dir + index)
            if err != nil {
                log.Fatal(fmt.Printf("[ERROR] unable to reneder default UI: %v\n", err))
            }

            t.Execute(w, "")
            return
        }
        http.Error(w, "not found", 404)
    })

    go func() {
        url := "http://" + addr
        if httpWait(url) && openBrowser && launchBrowser(url) {
            log.Printf("[INFO] a browser window should open. If not, please visit %s\n", url)
        } else {
            log.Printf("[INFO] unable to open your browser. Please open and visit %s\n", url)
        }
    }()

    if err := http.ListenAndServe(addr, nil); err != nil {
        log.Fatal("[ERROR] ListenAndServe: ", err)
    }
}

func initJobQueue(dev *device.Device) {
    go func() {
        done := false
        log.Println("[INFO] Starting job with line count of ", len(dev.JobQueue))

        for !done {
            cmd := dev.JobQueue[0]
            if len(dev.JobQueue) > 1 {
                dev.JobQueue = dev.JobQueue[1:len(dev.JobQueue)-1]  //  pop the zero item off
            } else {
                done = true
            }
            
            //
            //  Do not send over comments or empty commands.
            //  Empty lines are possible depending on the slicer used
            if !strings.HasPrefix(cmd, ";") && cmd != "" {
                //  debug for now; hide later and possible reply back to the UI that the cmd
                //  has been shipped to the device
                log.Println(cmd)

                cmd += device.FWLINETERMINATOR
                resp, err := dev.LobCommand(cmd)
                if err != nil {
                    log.Println("[ERROR] dev.JobQueue processing for device ", dev.Name, err)

                    //  
                    //  This usually means the device was detached.
                    //  We will update the client / UI, clean up values and exit
                    if strings.HasSuffix(err.Error(), device.NSF) || strings.HasSuffix(err.Error(), device.DNC) {
                        wshub.broadcast <-&device.Message {
                            Type:   "response",
                            Device: dev.Name,
                            Action: "error",
                            Body:   `{
                                        error:   'device not available',
                                        command: '` + cmd + `',
                                    }`,
                        }

                        dev.JobQueue   = make([]string, 1)
                        dev.JobRunning = false
                        delete(devices, dev.Name)
                        go initDeviceListener()

                        return
                    }
                }
                wshub.broadcast <-dev.ResponseMsg("job", resp)
            }
        }
        //  cleanup
        dev.JobRunning  = false
        dev.JobQueue    = make([]string, 1)

        log.Println("[INFO] Job complete")
    }()
}

//  
//  === [ HELPERS ]
//  

//  wait a bit for the web server to start
func httpWait(url string) bool {
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

func clientWsHandler(ws *websocket.Conn) {
    wsc := &connection { send: make(chan *device.Message), ws: ws }

    wshub.register <-wsc
    defer func() { wshub.unregister <-wsc }()

    go wsc.write()
    wsc.read()
}



func (conn *connection) write() {
    enc := json.NewEncoder(conn.ws)
    for msg := range conn.send {
        if err := enc.Encode(msg); err != nil {
            log.Println("[ERROR] web socket read: ", err)
            break
        }
    }

    log.Println("[WARN] write: closing socket")
    conn.ws.Close()
}

func (conn *connection) read() {
    dec := json.NewDecoder(conn.ws)
    for {
        var msg device.Message
        if err := dec.Decode(&msg); err != nil  && err != io.EOF {
            log.Println("[ERROR] web socket read: ", err)
            break
        }
        
        if msg.Action != "connection" {
            if devices != nil && len(devices) > 0 && devices[msg.Device] != nil {
                dev := devices[msg.Device]
                if dev.JobRunning && msg.Action == "job" {
                    wshub.broadcast <-&device.Message {
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
                        lines := strings.Split(dev.GCode.Data, "\n")
                        if len(lines) > 1 { 
                            dev.JobQueue = make([]string, 1)

                            for _, line := range lines {
                                dev.JobQueue = append(dev.JobQueue, line) 
                            }

                            dev.JobQueue   = dev.JobQueue[1:len(dev.JobQueue)-1]  //  pop the empty item off
                            dev.JobRunning = true
                            initJobQueue(dev)
                        } else {
                            wshub.broadcast <-&device.Message {
                                Type:   "response",
                                Device: msg.Device,
                                Action: "error",
                                Body:   `{
                                            error:   'invalid job file',
                                            action:  '` + msg.Action + `',
                                            body:    '` + msg.Body + `',
                                        }`,
                            }
                        }
                    } else {
                        if !dev.JobRunning {
                            r, err := dev.Do(msg.Action, msg.Body)
                            if err != nil {
                                if strings.HasSuffix(err.Error(), device.NSF) || strings.HasSuffix(err.Error(), device.DNC) {
                                    wshub.broadcast <-&device.Message {
                                        Type:   "response",
                                        Device: msg.Device,
                                        Action: "error",
                                        Body:   `{
                                                    error:   'device not available',
                                                    action:  '` + msg.Action + `',
                                                    body:    '` + msg.Body + `',
                                                }`,
                                    }
                                    delete(devices, msg.Device)
                                    go initDeviceListener()

                                } else {
                                    log.Println("[ERROR] unable to complete action: ", err)
                                }
                            }
                            if r != nil { wshub.broadcast <-r }    //  send the response even with an error
                        } else {
                            if msg.Action == "status" {
                                r, err := dev.Do(msg.Action, msg.Body)
                                if err != nil {
                                    if strings.HasSuffix(err.Error(), device.NSF) || strings.HasSuffix(err.Error(), device.DNC) {
                                        wshub.broadcast <-&device.Message {
                                            Type:   "response",
                                            Device: msg.Device,
                                            Action: "error",
                                            Body:   `{
                                                        error:   'device not available',
                                                        action:  '` + msg.Action + `',
                                                        body:    '` + msg.Body + `',
                                                    }`,
                                        }
                                        delete(devices, msg.Device)
                                        go initDeviceListener()

                                    } else {
                                        log.Println("[ERROR] unable to complete action: ", err)
                                    }
                                }
                                if r != nil { wshub.broadcast <-r }    //  send the response even with an error
                            } else if msg.Action == "resume" && dev.JobPaused {
                                //
                                //  Shift from HoldQueue to JobQueue
                                dev.JobQueue  = make([]string, len(dev.HoldQueue))
                                copy(dev.JobQueue, dev.HoldQueue)

                                dev.HoldQueue = make([]string, 1)
                                dev.JobPaused = false;
                                initJobQueue(dev)

                            } else if msg.Action == "interrupt" {

                                if msg.Body != "stop" {
                                    //
                                    //  Shift from JobQueue to HoldQueue
                                    dev.HoldQueue = make([]string, len(dev.JobQueue))
                                    copy(dev.HoldQueue, dev.JobQueue)

                                    dev.JobQueue  = make([]string, 1)
                                    dev.JobPaused = true;
                                } else {
                                    //  [ TODO ]
                                    //  Need to determine what we want to do on a 'stop'
                                    //  click... E-Stop or just similar to a pause?

                                    //  MakiBox Emergency Stop
                                    //  dev.Do("console", "M112")

                                    log.Println("[WARN] On the TODO's...")
                                }

                            }
                        }
                    }
                }
            } else {
                wshub.broadcast <-&device.Message {
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
        } else {
            //  check device list, if no list, send back empty connection
            //  else notify there is a device available
            if devices != nil && len(devices) > 0 {
                for dn, _ := range devices {
                    wshub.broadcast <-&device.Message {
                        Type:   "response",
                        Device: dn,
                        Action: "connection",
                        Body:   "attached",
                    }
                    break
                }
            } else {
                if !listenerRunning { go initDeviceListener() }
            }
        }
    }

    log.Println("[WARN] read: closing socket")
    conn.ws.Close()
}