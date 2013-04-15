// +build windows
package serial

import (
	"fmt"
	"io"
	"os"
	"sync"
	"syscall"
	"unsafe"
)

type SerialDevice struct {
	f  *os.File
	fd syscall.Handle
	rl sync.Mutex
	wl sync.Mutex
	ro *syscall.Overlapped
	wo *syscall.Overlapped
}

type DCB struct {
	DCBlength, BaudRate                            uint32
	flags                                          [4]byte
	wReserved, XonLim, XoffLim                     uint16
	ByteSize, Parity, StopBits                     byte
	XonChar, XoffChar, ErrorChar, EofChar, EvtChar byte
	wReserved1                                     uint16
}

type Timeouts struct {
	ReadIntervalTimeout         uint32
	ReadTotalTimeoutMultiplier  uint32
	ReadTotalTimeoutConstant    uint32
	WriteTotalTimeoutMultiplier uint32
	WriteTotalTimeoutConstant   uint32
}

var (
	nSetCommState,
	nSetCommTimeouts,
	nSetCommMask,
	nSetupComm,
	nGetOverlappedResult,
	nCreateEvent,
	nResetEvent,
	nWaitCommEvent uintptr
)

func init() {
	k32, err := syscall.LoadLibrary("kernel32.dll")
	if err != nil {
		panic(fmt.Sprintf("[ERROR] LoadLibrary %v", err))
	}
	defer syscall.FreeLibrary(k32)

	nSetCommState = getProcAddr(k32, "SetCommState")
	nSetCommTimeouts = getProcAddr(k32, "SetCommTimeouts")
	nSetCommMask = getProcAddr(k32, "SetCommMask")
	nSetupComm = getProcAddr(k32, "SetupComm")
	nGetOverlappedResult = getProcAddr(k32, "GetOverlappedResult")
	nCreateEvent = getProcAddr(k32, "CreateEventW")
	nResetEvent = getProcAddr(k32, "ResetEvent")
	nWaitCommEvent = getProcAddr(k32, "WaitCommEvent")
}

func getProcAddr(lib syscall.Handle, name string) uintptr {
	addr, err := syscall.GetProcAddress(lib, name)
	if err != nil {
		panic(fmt.Sprintf("[ERROR] getProcAddr %s: %v", name, err))
	}

	return addr
}

func ListDevices() string {
	//  TODO

	//  WARN: for now we're defaulting to
	//  COM3 because it appears to be ok
	//  on Windows... need to actually
	//  use proper list logic here
	// return ""

	return "COM3"
}

func OpenPort(name string, baud int) (rwc io.ReadWriteCloser, err error) {
	if len(name) > 0 && name[0] != '\\' {
		name = "\\\\.\\" + name
	}

	fd, err := syscall.CreateFile(syscall.StringToUTF16Ptr(name),
		syscall.GENERIC_READ|syscall.GENERIC_WRITE,
		0,
		nil,
		syscall.OPEN_EXISTING,
		syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_OVERLAPPED,
		0)
	if err != nil {
		fmt.Printf("[ERROR] open %s: %v\n", name, err)
		return nil, err
	}

	f := os.NewFile(uintptr(fd), name)
	defer func() {
		if err != nil {
			f.Close()
		}
	}()

	if err = syscallEvent(fd, "state"); err != nil {
		fmt.Printf("[ERROR] oops! %#v\n", err)
		return
	}
	if err = syscallEvent(fd, "setup"); err != nil {
		fmt.Printf("[ERROR] oops! %#v\n", err)
		return
	}
	if err = syscallEvent(fd, "timeouts"); err != nil {
		fmt.Printf("[ERROR] oops! %#v\n", err)
		return
	}
	if err = syscallEvent(fd, "mask"); err != nil {
		fmt.Printf("[ERROR] oops! %#v\n", err)
		return
	}

	ro, err := genOverlap()
	if err != nil {
		return
	}
	wo, err := genOverlap()
	if err != nil {
		return
	}

	dev := new(SerialDevice)
	dev.f = f
	dev.fd = fd
	dev.ro = ro
	dev.wo = wo

	return dev, nil
}

func (dev *SerialDevice) Close() error {
	return dev.f.Close()
}

func (dev *SerialDevice) Write(buf []byte) (int, error) {
	dev.wl.Lock()
	defer dev.wl.Unlock()

	if err := syscallEvent(dev.wo.HEvent, "reset"); err != nil {
		return 0, err
	}

	var n uint32
	err := syscall.WriteFile(dev.fd, buf, &n, dev.wo)
	if err != nil && err != syscall.ERROR_IO_PENDING {
		fmt.Printf("%v\n", err)
		return int(n), fmt.Errorf("%#v", err)
	}

	return getOverlapResult(dev.fd, dev.wo)
}

func (dev *SerialDevice) Read(buf []byte) (int, error) {
	if dev == nil || dev.f == nil {
		return 0, fmt.Errorf("[ERROR] invalid port on read: %v %v", dev, dev.f)
	}

	dev.rl.Lock()
	defer dev.rl.Unlock()

	if err := syscallEvent(dev.ro.HEvent, "reset"); err != nil {
		fmt.Printf("[errr] %v\n", err)
		return 0, err
	}

	var done uint32
	err := syscall.ReadFile(dev.fd, buf, &done, dev.ro)
	if err != nil && err != syscall.ERROR_IO_PENDING {
		fmt.Printf("[errr] %v\n", err)
		return int(done), err
	}

	return getOverlapResult(dev.fd, dev.ro)
}

func syscallEvent(handle syscall.Handle, event string) error {
	switch event {
	case "setup":
		const cio = 64
		if r, _, err := syscall.Syscall(nSetupComm, 3, uintptr(handle), cio, cio); r == 0 {
			return err
		}
		return nil

	case "state":
		var params DCB
		params.DCBlength = uint32(unsafe.Sizeof(params))
		params.flags[0] = 0x01  // fBinary
		params.flags[0] |= 0x10 // Assert DSR
		params.BaudRate = uint32(250000)
		// params.BaudRate = uint32(115200)
		params.ByteSize = 8

		if r, _, err := syscall.Syscall(nSetCommState, 2, uintptr(handle), uintptr(unsafe.Pointer(&params)), 0); r == 0 {
			return err
		}
		return nil

	case "timeouts":
		//
		//  we have to set some actual values here
		//  or else the Read() will only return 1
		//  character and nothing else
		var timeouts Timeouts
		timeouts.ReadIntervalTimeout = 20
		timeouts.ReadTotalTimeoutMultiplier = 10
		timeouts.ReadTotalTimeoutConstant = 100

		if r, _, err := syscall.Syscall(nSetCommTimeouts, 2, uintptr(handle), uintptr(unsafe.Pointer(&timeouts)), 0); r == 0 {
			return err
		}
		return nil

	case "mask":
		const EV_RXFLAG = 0x0002
		if r, _, err := syscall.Syscall(nSetCommMask, 2, uintptr(handle), EV_RXFLAG, 0); r == 0 {
			return err
		}
		return nil

	case "reset":
		if r, _, err := syscall.Syscall(nResetEvent, 1, uintptr(handle), 0, 0); r == 0 {
			return err
		}
		return nil

	default:
		return fmt.Errorf("[ERROR] invalid event type: %v", event)
	}

	return nil
}

func genOverlap() (*syscall.Overlapped, error) {
	var overlap syscall.Overlapped
	r, _, err := syscall.Syscall6(nCreateEvent, 4, 0, 1, 1, 0, 0, 0)
	if r == 0 {
		return nil, err
	}
	overlap.HEvent = syscall.Handle(r)
	return &overlap, nil
}

func getOverlapResult(handle syscall.Handle, overlap *syscall.Overlapped) (int, error) {
	var n int
	r, _, err := syscall.Syscall6(nGetOverlappedResult, 4,
		uintptr(handle),
		uintptr(unsafe.Pointer(overlap)),
		uintptr(unsafe.Pointer(&n)), 1, 0, 0)
	if r == 0 {
		return n, err
	}
	return n, nil
}
