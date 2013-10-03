package ui

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"github.com/makible/5DPrint/action"
	"github.com/makible/5DPrint/comm"
	"github.com/makible/5DPrint/device"
	"github.com/makible/5DPrint/logger"
	"html/template"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

var (
	//  flag to start browser automatically
	ob       bool
	execArgs []string

	wsOut     chan *comm.Message
	uiKilChan chan int
)

const (
	DEFAULT_PORT = ":8920"
	CLOSEWS      = "close_ws"
)

func init() {
	ob = true
	uiKilChan = make(chan int)
	wsOut = make(chan *comm.Message)

	//
	//  default to OS X
	//  since that's what I'm working on...
	switch runtime.GOOS {
	case "windows":
		execArgs = []string{"cmd", "/c", "start"}
	case "linux":
		execArgs = []string{"xdg-open"}
	default:
		execArgs = []string{"open"}
	}
}

func SendKillSignal()    { uiKilChan <- 1 }
func SetOBFlag(obs bool) { ob = obs }

//
//  Serves up a HTTP server to deliver a web-like
//  UI via HTML/CSS/JavaScript and communicates
//  over standard websocket protocols
func InitUIServer() {
	var ip string

	//
	//  oddly, have to get the hostname in order to get the available IP's
	host, err := os.Hostname()
	if err != nil {
		logger.Error("InitUIServer: ", err)
		os.Exit(1)
	}

	//
	//  list out the available IP's according to the provided hostname
	ipList, err := net.LookupIP(host)
	if err != nil {
		logger.Error("InitUIServer: ", err)
		os.Exit(1)
	}

	//
	//  check if IPv4 addr is avialable and set to to 'localhost' if not
	//  we aren't going to work with IPv6 address at the moment, so
	//  ignore / exclude and just use the available IPv4 if ipList > 1
	if len(ipList) < 1 || (len(ipList) == 1 && strings.Contains(ipList[0].String(), ":")) {
		ip = "localhost"
		logger.Warn("InitUIServer: Unable to connect via any external devices without a valid IP")

		//  TODO ::
		//  check and see if this is still valid when no network conn. is available
		if len(ipList) == 1 && strings.Contains(ipList[0].String(), ":") {
			logger.Warn("InitUIServer: currently not supporting IPv6, defaulting to \"localhost\"")
		}
	} else {
		ip = ipList[0].String()
		if len(ipList) > 1 && strings.Contains(ip, ":") {
			for _, i := range ipList {
				if !strings.Contains(i.String(), ":") {
					ip = i.String()
				}
			}
		}
	}

	wd, err := os.Getwd()
	if err != nil {
		logger.Error("InitUIServer: ", err)
		os.Exit(1)
	}

	addr := ip + DEFAULT_PORT
	ui := wd + "/5dp-ui/"

	fs := http.FileServer(http.Dir(ui))
	http.Handle("/favicon.ico", fs)
	http.Handle("/css/", fs)
	http.Handle("/js/", fs)
	http.Handle("/img/", fs)
	http.Handle("/fonts/", fs)

	http.Handle("/5dp-ui", websocket.Handler(wsHandler))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		if r.URL.Path == "/" {

			t, err := template.ParseFiles(ui + "/index.html")
			if err != nil {
				logger.Error("InitUIServer > http.HandleFunc: ", err)
				os.Exit(1)
			}
			t.Execute(w, "")
			return
		}

		http.Error(w, "file not found", 404)
	})

	go func() {
		url := "http://" + addr
		if httpWait(url) && ob && launchDefaultBrowser(url) {
			//  done
			logger.Notify("The default browser should have opened. If not, please open a new window and visit " + url)
		} else {
			if !ob {
				logger.Warn("ui flag set to false. I'm assuming you know what you're doing")
			} else {
				logger.Warn("Unable to open the default browser. Please open a new window and visit " + url)
			}
		}
	}()

	if err := http.ListenAndServe(DEFAULT_PORT, nil); err != nil {
		logger.Error("InitUIServer > http.ListAndServe: ", err)
		uiKilChan <- 1

		return
	}

	//  run UI server til told not to
	select {
	case <-uiKilChan:
		return
	}
}

func httpWait(url string) (ok bool) {
	ok = false

	tries := 20 //  arbitrary hard-limit on connection tries
	for tries > 0 {
		resp, err := http.Get(url)
		ok = (err == nil)

		if ok {
			resp.Body.Close()
			return
		}

		time.Sleep(100 * time.Millisecond)
		tries--
	}
	return
}

func launchDefaultBrowser(url string) (ok bool) {
	cmd := exec.Command(execArgs[0], append(execArgs[1:], url)...)
	return cmd.Start() == nil
}

func wsHandler(ws *websocket.Conn) {
	defer ws.Close()
	go func() {
		enc := json.NewEncoder(ws)
		for msg := range wsOut {
			if msg.Action == CLOSEWS {
				logger.Warn("websocket close signal received")
				return
			} else {
				if err := enc.Encode(msg); err != nil {
					logger.Error("wsHandler: ", err)
					return
				}
			}
		}
	}()

	dec := json.NewDecoder(ws)
	if err := decodeIncoming(dec); err != nil {
		return
	}
}

func decodeIncoming(dec *json.Decoder) error {
	var msg comm.Message
	if err := dec.Decode(&msg); err != nil && err != io.EOF {
		logger.Error("decodeIncoming: ", err)
		return err
	}

	if len(msg.Action) < 1 {
		logger.Warn("It would appear that the client is no longer connected")
		logger.Warn("Dumping out of websocket")

		wsOut <- &comm.Message{Action: CLOSEWS}
		return nil
	}

	if msg.Action == action.RUN_JOB {
		//	need a way to get messages from the device
		//	back to the UI, so...
		go func() {
			jqInfo := device.GetJobInfoChannel()
			for msg := range jqInfo {
				wsOut <- msg
				if msg.Action == action.COMPLETE_JOB || msg.Action == action.DISCONNECTED || msg.Action == action.ERROR {
					return
				}
			}
		}()
	}

	outMsg := device.DigestMsg(&msg)
	if outMsg.Action != action.EMPTY {
		wsOut <- outMsg
	}

	return decodeIncoming(dec)
}
