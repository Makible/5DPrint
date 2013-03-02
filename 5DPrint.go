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
	"os/exec"
	"runtime"
	"time"
)

var (
	httpListen  = flag.String("http", "localhost:8080", "host:port to listen on")
	htmlOutput  = flag.Bool("html", false, "render output as HTML")
	openBrowser = flag.Bool("openbrowser", true, "open browser automagically")

	httpAddr string
	ioDev    *device.Device
)

const warning = `
    DANGER!!! DANGER!!!

    WE'RE LISTENING ON AN ADDRESS THAT IS NOT THE localhost.
    ANYONE WITH ACCESS TO THIS ADDRESS AND PORT WILL HAVE ACCESS
    TO THIS MACHINE AS THE USER RUNNING 5DPrint

    IF THIS DOESN'T MAKE SENSE TO YOU, THEN YOU SHOULD HIT Control-C to
    END THIS PROCESS/APPLICATION

    DANGER!!! DANGER!!!
`

//  5DPrint launcher that will start 
//  device listener, the core server
//  that will manage data flow from the
//  UI and / or other external apps
//  and feed that into the device
func main() {
    //  [TEMPORARY :: TODO]
    //  change to a "initDeviceListener"
    //  and have it report back to the 
    //  "core" that a device is attached
	dev, err := device.Init()
	if err != nil {
		//  log.Fatal(fmt.Printf("[ERROR] unable to initialize device: %v\n", err))
        //  for now, don't die via fatal but inform that 
        //  no device is attached instead ... will "fix"
        //  with a proper "listener"
        log.Printf("[ERROR] unable to initialize device: %v\n", err)
	}
	ioDev = dev

    // initDeviceListener() //  TODO ::
    initCore()
    // initExtListener()    //  TODO ::
}

func initCore() {
	flag.Parse()

    //  configure the host:port (use localhost)
	host, port, err := net.SplitHostPort(*httpListen)
	if err != nil {
		log.Fatal(fmt.Printf("[ERROR] unable to parse host/port: %v\n", err))
	}
	if host == "" {
		host = "localhost"
	}
	if host != "127.0.0.1" && host != "localhost" {
		log.Print(warning)
	}
	httpAddr = host + ":" + port

    //  init file server and push out the
    //  default UI plus it's dependencies
	fs := http.FileServer(http.Dir("ui/default/")) // open the ui path
	http.Handle("/favicon.ico", fs)
	http.Handle("/css/", fs)
	http.Handle("/js/", fs)
	http.Handle("/img/", fs)
	http.Handle("/fonts/", fs)
	http.Handle("/socket", websocket.Handler(wsHandler))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			if err := renderUI(w); err != nil {
				log.Println(err)
			}
			return
		}

		http.Error(w, "not found", 404)
	})

	go func() {
		url := "http://" + httpAddr
		if wait(url) && *openBrowser && launchBrowser(url) {
			log.Printf("[INFO] a browser window should open. If not, please visit %s\n", url)
		} else {
			log.Printf("[WARN] please open your web browser and visit %s\n", url)
		}
	}()
	log.Fatal(http.ListenAndServe(httpAddr, nil))
}

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

//  TODO: 
//  use the CEF (Chromium Embedded Framework)
//  and allow the user to decide, but for now
//  we'll just launch the users default
//  browser to display the UI in
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

//  for now we'll just render the default
//  UI. But this should take the UI requested
//  by the attached device
//  the "default/index.html" will need to be
//  updated to an "admin panel" for managing
//  external devices like Android or iOS devices
func renderUI(w io.Writer) error {
	t, _ := template.ParseFiles("ui/default/index.html")
	t.Execute(w, "")
	return nil
}

//  websocket that will manage the 
//  traffic to and from the UI and Core
func wsHandler(c *websocket.Conn) {
	in, out := make(chan *device.Message), make(chan *device.Message)
	errc := make(chan error, 1)

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
		for msg := range out {
			if err := enc.Encode(msg); err != nil {
				errc <- err
				return
			}
		}
	}()

	for {
		select {
		case m := <-in:
            switch m.Type {
            case "core":
                //  do some "core" related task
            case "device":
                if err := ioDev.Do(m.Action, m.Body); err != nil {
                    log.Printf("[ERROR] device didn't do action: %v\n", err)
                }
            default:
                log.Printf("[WARN] not a valid message type: %s\n", m.Type)
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
