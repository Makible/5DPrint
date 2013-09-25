// +build darwin, !linux, !windows
package serial

const (
	TTYPREFIX      = "/dev/tty.usbmodem"
	DFSERIALPREFIX = "001"
)
