// +build darwin, !linux, !windows
package serial

const (
	DEV_DIR        = "/dev"
	TTYPREFIX      = "/tty.usbmodem"
	DFSERIALPREFIX = "001"
)
