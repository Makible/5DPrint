package daemon

import (
	"fmt"
	// "github.com/makible/5DPrint/cli"
	"github.com/makible/5DPrint/device"
	"github.com/makible/5DPrint/ui"
	"os"
	"time"
)

var (
	debug bool

	//  comm channels
	mastrChan chan int //  channel the master appserv kill signal is sent on
	asSigChan chan int //  channel the appserv listener signal is sent on
	asKilChan chan int //  channel the appserv listener kill signal is sent on
	uiSigChan chan int //  channel the appserv ui listener signal is sent on
)

func init() {
	debug = false

	mastrChan = make(chan int)
	asSigChan = make(chan int)
	asKilChan = make(chan int)
	uiSigChan = make(chan int)
}

func SendMasterKillSignal() { mastrChan <- 1 }
func SetDebugFlag(dbg bool) { debug = dbg }

func Go() {

	go device.InitDeviceListener()
	go ui.InitUIServer()

	// go cli.ListenAndDigest()
	// go initAppServListener()

	//
	//  run until we receive the kill signal
	select {
	case ksig := <-mastrChan:
		os.Exit(ksig)
	}

	_ = time.Now().String()
	fmt.Println("WOW... how'd we get here?!")
}

//  not used ?
func initAppServListener() {
	//
	//  run appserv listener til told not to
	select {
	case <-asKilChan:
		return
	}
}
