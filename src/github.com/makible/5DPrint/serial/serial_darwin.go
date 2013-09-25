// +build darwin, !linux, !windows
package serial

// #include <termios.h>
// #include <unistd.h>
import "C"

import (
	"fmt"
	"io"
	"os"
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

	//
	//	if this one is not attached then the others
	//	definitely won't be, so we can just return
	defDFN := TTYPREFIX + DFSERIALPREFIX
	if _, err = os.Stat(defDFN); err != nil {
		return
	}
	dfnames = append(dfnames, defDFN)

	//	TODO ::
	//	the code below will be commented out for now since not
	//	too many users will have more than 1 MakiBox at this moment
	//	need to look into adding in near future

	//	if the other is attached, we could potentially have
	//	more available, so lets loop up to ARB_MAX and check
	// for i := 1; i <= ARB_MAX; i++ {
	// 	//	sadly if tty.usbmodem1 - n isn't attached that
	// 	//	doesn't necessarily mean another isn't due to the
	// 	//	way OS X enumerates the devices
	// 	dfn := TTYPREFIX + strings.Itoa(i)
	// 	if _, err = os.Stat(dfn); err != nil {
	// 		if !os.IsNotExist(err) {
	// 			logger.Error("GetDevFileNames: ", err)
	// 			os.Exit(2)
	// 		}
	// 		continue
	// 	}

	// 	//	TODO ::
	// 	//	check to see if it's a MakiBox A6 device

	// 	dfnames = append(dfnames, dfn)
	// }

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
