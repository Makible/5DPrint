package main

import (
	"flag"
	"fmt"
	"github.com/makible/5DPrint/device"
	"github.com/makible/5DPrint/ui"
	"runtime"
)

var (
	//	flags
	debug  = flag.Bool("dbg", false, "Set this in order to print all device output and any other debug to console")
	help   = flag.Bool("help", false, "Display usage")
	obstop = flag.Bool("ui", true, "Set this to false to prevent the default browser from being launched")
)

//	TODO ::
//	init device listener
//	init device print queue
//	init device cmd queue
//	init application listener
//	init web server (for UI)
func main() {
	flag.Parse()
	if *help {
		flag.Usage()
		return
	}

	runtime.GOMAXPROCS(4) //	errrm...
	// runtime.GOMAXPROCS(2)	//	errrm...

	go device.InitDeviceListener()

	ui.SetOBFlag(*obstop)
	ui.InitUIServer()

	fmt.Println("WOW... how'd we get here?!")
}
