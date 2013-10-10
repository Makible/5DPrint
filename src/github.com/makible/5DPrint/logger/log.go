package logger

import (
	"fmt"
	"log"
	"os"
	"time"
)

var (
	dl *os.File
	wl *os.File
	el *os.File
	pl *os.File
)

func Debug(msg string) {
	checkCurrentLogDir()

	log.SetOutput(dl)
	log.Println(msg)
}

func Notify(msg string) {
	//  TODO ::
	fmt.Println("[INFO] ", msg)
}

func Warn(msg string) {
	checkCurrentLogDir()

	log.SetOutput(wl)
	log.Println(msg)
}

func Error(msg string, err error) {
	checkCurrentLogDir()

	log.SetOutput(el)
	log.Println(msg, err)
}

func WriteToPrintLog(msg string) {
	log.SetOutput(pl)
	log.Println(msg)
}

func CreatePrintLog(name string) bool {
	var err error

	ld := getTodaysLogDirName()
	plfn := ld + "/" + name + ".log"

	if _, err = os.Stat(plfn); err != nil {
		if !os.IsNotExist(err) {
			Error("unable to verify print log file name: ", err)
			return false
		}
	}

	pl, err = os.Create(plfn)
	if err != nil {
		panic(err)
	}

	return true
}

func ClosePrintLog() {
	if pl != nil {
		pl.Close()
	}
}

func getTodaysLogDirName() string {
	return "logs/" + time.Now().Format("20060102")
}

func checkCurrentLogDir() {
	var err error

	//  check for logs dir and create if IsNotExit
	if _, err = os.Stat("logs/"); err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
		if err = os.Mkdir("logs", 0777); err != nil {
			panic(err)
		}
	}

	logdir := getTodaysLogDirName()
	if _, err = os.Stat(logdir); err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
		if err = os.Mkdir(logdir, 0777); err != nil {
			panic(err)
		}
	}

	if dl != nil {
		dl.Close()
	}
	dl, err = os.Create(logdir + "/debug.log")
	if err != nil {
		panic(err)
	}

	if wl != nil {
		wl.Close()
	}
	wl, err = os.Create(logdir + "/warn.log")
	if err != nil {
		panic(err)
	}

	if el != nil {
		el.Close()
	}
	el, err = os.Create(logdir + "/error.log")
	if err != nil {
		panic(err)
	}
}
