// +build darwin, !linux, !windows
package serial

// #include <termios.h>
// #include <unistd.h>
import "C"

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"strings"
	"syscall"
)

//
// 	On Mac OS-X, a device file is created automatically which
// 	incorperates the serial number, eg. /dev/tty.usbmodem1234
//	If a device is currently connected with the same serial,
//	the device file will just increment, ignoring the serial
//	eg. /dev/tty.usbmodem5 ... /dev/tty.usbmodem6

func GetDevFileNames() (dfnames []string, err error) {
	dfnames = make([]string, 0)
	err = nil

	dir, err := ioutil.ReadDir(DEV_DIR)
	if err != nil {
		fmt.Println(err)
		os.Exit(2)
	}

	for _, f := range dir {
		if strings.HasPrefix(f.Name(), "tty.usbmodem") {
			dfnames = append(dfnames, DEV_DIR+"/"+f.Name())
		}
	}

	return
}

func OpenPort(name string, baud int) (rwc io.ReadWriteCloser, err error) {
	f, err := os.OpenFile(name, syscall.O_RDWR|syscall.O_NOCTTY|syscall.O_NONBLOCK, 0666)
	if err != nil {
		return
	}

	fd := C.int(f.Fd())
	if C.isatty(fd) != 1 {
		f.Close()
		return nil, fmt.Errorf("[ERROR] not a tty/cu device")
	}

	var st C.struct_termios
	_, err = C.tcgetattr(fd, &st)
	if err != nil {
		f.Close()
		return nil, err
	}
	var speed C.speed_t
	switch baud {
	case 115200:
		speed = C.B115200
	case 57600:
		speed = C.B57600
	case 38400:
		speed = C.B38400
	case 19200:
		speed = C.B19200
	case 9600:
		speed = C.B9600
	default:
		f.Close()
		return nil, fmt.Errorf("Unknown baud rate %v", baud)
	}

	_, err = C.cfsetispeed(&st, speed)
	if err != nil {
		f.Close()
		return nil, err
	}
	_, err = C.cfsetospeed(&st, speed)
	if err != nil {
		f.Close()
		return nil, err
	}

	// Select local mode
	st.c_cflag |= (C.CLOCAL | C.CREAD)

	// Select raw mode
	st.c_lflag &= ^C.tcflag_t(C.ICANON | C.ECHO | C.ECHOE | C.ISIG)
	st.c_oflag &= ^C.tcflag_t(C.OPOST)

	_, err = C.tcsetattr(fd, C.TCSANOW, &st)
	if err != nil {
		f.Close()
		return nil, err
	}

	r1, _, e := syscall.Syscall(syscall.SYS_FCNTL,
		uintptr(f.Fd()),
		uintptr(syscall.F_SETFL),
		uintptr(0))
	if e != 0 || r1 != 0 {
		s := fmt.Sprint("[WARN] clearing NONBLOCK syscall error:", e, r1)
		f.Close()
		return nil, fmt.Errorf("%s", s)
	}

	return f, nil
}

func Ping(dname string) bool {
	_, err := os.Stat(dname)
	if err != nil {
		return false
	}

	return true
}
