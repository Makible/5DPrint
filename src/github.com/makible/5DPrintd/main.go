package main

import (
	"flag"
	"fmt"
	"github.com/makible/5DPrint/daemon"
	"github.com/makible/5DPrint/ui"
	"runtime"
	"time"
)

var (
	//	flags
	debug  = flag.Bool("dbg", false, "Set this in order to print all device output and any other debug to console")
	help   = flag.Bool("help", false, "Display usage")
	obstop = flag.Bool("ui", false, "Set this to true in order to use the default browser instead of CEFClient")
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

	daemon.SetDebugFlag(*debug)
	ui.SetOBFlag(*obstop)

	daemon.Go()

	_ = time.Now().String()
	fmt.Println("WOW... how'd we get here?!")
}
