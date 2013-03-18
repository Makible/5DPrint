package main

import (
	"code.google.com/p/go.net/websocket"
	"device"
	"encoding/json"
	"flag"
	"fmt"
    // "html"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

var (
	httpListen  = flag.String("http", "localhost:8080", "host:port to listen on")
	htmlOutput  = flag.Bool("html", false, "render output as HTML")
	// openBrowser = flag.Bool("openbrowser", true, "open browser automagically")
	openBrowser = flag.Bool("openbrowser", false, "open browser automagically")

    devices     = make(map[string]*device.Device)

    sockOut     chan *device.Message
    errc        chan error
	localAddr   string
)

//  5DPrint launcher that will start
//  device listener, the core server
//  that will manage data flow from the
//  UI and / or other external apps
//  and feed that into the device
func main() {
    //  init "core"
    flag.Parse()
    sockOut = make(chan *device.Message)
    errc    = make(chan error, 1)

    // devices = make(map[string]*device.Device)
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
    localAddr = host + ":" + port

    //  init default server and push out the
    //  it's UI plus dependencies
    fs := http.FileServer(http.Dir("ui/default/"))
    http.Handle("/favicon.ico", fs)
    http.Handle("/css/", fs)
    http.Handle("/js/", fs)
    http.Handle("/img/", fs)
    http.Handle("/fonts/", fs)

    //  core websocket handler
    http.Handle("/abs", websocket.Handler(coreWsHandler))



    //  handle the index page
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/" {
            if err := renderUI(w); err != nil {
                log.Fatal(fmt.Printf("[ERROR] unable to reneder default UI: %v\n", err))
            }
            return
        }
        http.Error(w, "not found", 404)
    })

    //  init device listener to know when
    //  compatable devices are attached
    go initDeviceListener()

    //  init webserver that is capable of
    //  listening for connections on the 
    //  same network or possibly through
    //  a 'secure' web connection
    go initExternListener()

    //  for now, we're going to launch the
    //  base A6 printer UI, but in the future
    //  we'll want to launch the admin and
    //  signal the device UI
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

func initDeviceListener() {
	//  start a go function that looks for
	//  devices to be attached and adds to
    //  the devices map if it's not connected
	go func() {
		for {
            dn, err := device.GetAttachedDevices(&devices)
            if err != nil || len(dn) == 0 {
                if len(devices) < 1 {
                    log.Printf("[WARN] no device detected. Please attach or power on a valid device")
                }
            }

            if len(dn) > 0 {
                log.Printf("[INFO] device attached and being tracked")
                d := devices[dn]

                go func() {
                    for {
                        //  read in from the device's action 
                        //  queue and send to socket channel
                        m := <- d.AQOut

                        if m.Type == "error" {
                            errc <- fmt.Errorf("[ERROR] issue in device queue: %s", m.Body)
                        } else {
                            sockOut <-m
                        }
                    }
                }()
            }
			time.Sleep(1000 * time.Millisecond)
		}
	}()
}

func initExternListener() {
    //  ===[ TODO ]
}

//  === [ HELPER FUNCS ]

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
func renderUI(w io.Writer) error {
	t, _ := template.ParseFiles("ui/default/index.html")
	t.Execute(w, "")
	return nil
}

//  websocket handler that will manage the
//  traffic to and from the UI and Core
func coreWsHandler(c *websocket.Conn) {
	in := make(chan *device.Message)

	//  decode incoming client messages
	//  and push to in channel
	go func() {
		dec := json.NewDecoder(c)
		for {
			var msg device.Message
			if err := dec.Decode(&msg); err != nil {
				errc <- err
				return
			}
			in <- &msg
		}
	}()

	//  encode out messages and push
	//  to client
	go func() {
		enc := json.NewEncoder(c)
		for msg := range sockOut {
			if err := enc.Encode(msg); err != nil {
				errc <- err
				return
			}
		}
	}()

	//  === [ TODO ]
	//  depending on the message type, have this send
	//  the messages to the appropriate listening channel
	for {
		select {
		case m := <-in:
            if m.Type == "core" {
                //  do some "core" related task
                if m.Action == "dc" {
                    n, b := "", ""
                    if len(devices) > 0 {
                        var names []string
                        for n, _ := range devices {
                            names = append(names, n)
                        }

                        d := devices[names[0]]
                        n = d.Name
                        b = d.Greeting

                        if d.Printing {
                            b = "{status: \"printing\", "
                            b += "fname: \"" + d.GCode.Name + "\"}"
                        }

                        sockOut <- &device.Message {
                            Type:   "response",
                            Action: "dc",
                            Device: n,
                            Body:   b,
                        }
                    }
                }
            }

            if m.Type == "device" {
                if len(devices) > 0 && devices != nil {
                    dev := devices[m.Device]
                    if dev != nil {
                        dev.AQIn <- m
                    }
                }
            }
		case err := <-errc:
			//  TODO(?)
			//  something bad happened
			//  and we may need to die
			if err != io.EOF {
				log.Printf("[ERROR] %v\n", err)
			}
			return
		}
	}
}

//  websocket handler that will manage the
//  external api traffic from other user
//  approved applications
func externalWsHandler(c *websocket.Conn) {
    //  ===[ TODO ]
}