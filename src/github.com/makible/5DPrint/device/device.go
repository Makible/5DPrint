package device

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/makible/5DPrint/comm"
	"github.com/makible/5DPrint/daemon/action"
	"github.com/makible/5DPrint/daemon/logger"
	"github.com/makible/5DPrint/daemon/mk"
	"github.com/makible/5DPrint/device/model/mba6"
	"github.com/makible/5DPrint/serial"
	"io"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"
)

type Device struct {
	Name           string
	IdInfo         string
	LineTerminator string
	ECount         string
	Baud           int
	Pos            mk.Position
	IODevice       io.ReadWriteCloser
}

var (
	devices = make(map[string]*Device)
)

func InitDeviceListener() {
	dfns, err := serial.GetDevFileNames()
	if err != nil && !os.IsNotExist(err) {
		logger.Error("InitDeviceListener: ", err)
		os.Exit(2)
	}

	//	if devices attached check to see if they are
	//	being tracked already
	if len(dfns) > 0 {
		//
		//	loop through dfn list, checking to see
		//	which device(s) currently not being
		//	tracked and act accordingly
		for _, dfn := range dfns {
			if devices[dfn] == nil {
				//	generate a device and append to map
				d, err := GetDeviceByDFN(dfn)
				if err != nil {
					logger.Error("InitDeviceListener > GetDeviceByDFN: ", err)
					os.Exit(2)
				} else {
					devices[dfn] = d
				}
			} else {
				//
				//	check if the device is still attached
				//	and clean up if not
				if !serial.Ping(dfn) {
					closeDevice(dfn)
				}
			}
		}
	}

	time.Sleep(3 * time.Second)
	InitDeviceListener()
}

func GetDeviceByDFN(dfn string) (dev *Device, err error) {
	d, err := serial.OpenPort(dfn, DEFBAUD)
	if err != nil {
		return
	}

	//
	pos := mk.Position{X: 0, Y: 0, Z: 0, E1: 0}
	dev = &Device{
		Name:           dfn,
		LineTerminator: mba6.LINETERMINATOR,
		Baud:           DEFBAUD,
		Pos:            pos,
		IODevice:       d,
	}

	return
}

func ListAttachedDevices() {
	fmt.Println("\nCurrently attached devices: ")
	for dn, _ := range devices {
		fmt.Println(dn)
	}
	fmt.Println()
}

func DigestMsg(msg *comm.Message) (outMsg *comm.Message) {
	switch msg.Action {
	case action.CONN:
		if len(devices) > 0 {
			//
			//	for now, just grab the first
			//	device and send it back to the UI
			var dn string
			for k, _ := range devices {
				dn = k
				break
			}

			outMsg = &comm.Message{
				DeviceName: dn,
				Action:     action.CONNECTED,
				Body:       ATTACHED,
			}

			//
			//	TODO ::
			//	provide list of attached devices
			//	rather than just one device
		} else {

			//
			//	no devices are attached
			outMsg = &comm.Message{
				DeviceName: "",
				Action:     action.NO_DEVICES,
				Body:       NO_DEVICES,
			}
		}
	case action.STATS:
		full := false
		if msg.Body == "full" {
			full = true
		}

		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := getStats(d, full)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > getStats: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while getting stats: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.STATS,
			Body:       resp,
		}
	case action.HOME:
		var mvr mk.StdMovement
		if err := json.Unmarshal([]byte(msg.Body), &mvr); err != nil {
			logger.Error("DigestMsg > action.HOME: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error parsing Movement data",
			}
			return
		}

		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := homeDevice(d, &mvr)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > action.HOME: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while processing home cmd: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	case action.MMOVE:
		var mvr mk.MultiMovement
		if err := json.Unmarshal([]byte(msg.Body), &mvr); err != nil {
			fmt.Println(msg.Body)

			logger.Error("DigestMsg > action.MMOVE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error parsing Movement data",
			}
			return
		}

		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := multiMove(d, &mvr)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > action.MMOVE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while processing move cmd: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	case action.SMOVE:
		var mvr mk.StdMovement
		if err := json.Unmarshal([]byte(msg.Body), &mvr); err != nil {
			logger.Error("DigestMsg > action.SMOVE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error parsing Movement data",
			}
			return
		}

		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := stdMove(d, &mvr)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > action.SMOVE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while processing  cmd: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	case action.TEMP:
		var t mk.Tool
		if err := json.Unmarshal([]byte(msg.Body), &t); err != nil {
			logger.Error("DigestMsg > action.TEMP: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error parsing Tool data",
			}
			return
		}

		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := manageTemp(d, &t)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > manageTemp: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while updating temperature: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			// Action:		action.TEMP,
			Action: action.NOTIFY,
			Body:   resp,
		}
	// case action.:
	// case action.:

	case action.CONSOLE:
		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		cmd := msg.Body + d.LineTerminator
		resp, err := lobCommand(&d.IODevice, cmd)
		if err != nil {
			if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
				closeDevice(d.Name)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.DISCONNECTED,
					Body:       "",
				}
				return
			}

			logger.Error("DigestMsg > action.CONSOLE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.NOTIFY,
				Body:       "Error occurred while processing console cmd: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	default:
		logger.Notify("DigestMsg: Invalid Action")
		outMsg = &comm.Message{
			DeviceName: "",
			Action:     action.NOTIFY,
			Body:       "Invalid Action Provided",
		}
	}

	return
}

func getStats(dev *Device, full bool) (resp string, err error) {
	if !full {
		cmd := mba6.GET_TEMP + dev.LineTerminator
		resp, err = lobCommand(&dev.IODevice, cmd)
		if err != nil {
			return
		}

	} else {
		//	prefix for UI
		resp = "--FULL STATS\n"
		cmds := []string{
			mba6.GET_TEMP,
			mba6.POSITION,
			mba6.CAPABILITIES,
			mba6.ENDSTOP_STATE,
			mba6.MEM_SETTINGS,
			mba6.FREE_RAM,
			mba6.FMWARE_INFO,
		}

		for _, base := range cmds {
			cmd := base + dev.LineTerminator
			r := ""

			r, err = lobCommand(&dev.IODevice, cmd)
			if err != nil {
				resp = ""
				return
			}

			resp += r
		}
	}

	return
}

func homeDevice(dev *Device, mvr *mk.StdMovement) (resp string, err error) {
	//	build out the cmd
	cmd := mba6.HOME
	if mvr.Axis != "ALL" {
		cmd += " " + mvr.Axis + "0"
	}
	cmd += dev.LineTerminator

	resp, err = lobCommand(&dev.IODevice, cmd)
	if err != nil {
		resp = ""
		return
	}

	//	set the position of E to 0 on the device
	if mvr.Axis == "ALL" || mvr.Axis == "E" {
		cmd = mba6.SET_POS + " E0" + dev.LineTerminator
		r, e := lobCommand(&dev.IODevice, cmd)
		if e != nil {
			resp = ""
			return
		}

		resp += r
	}

	//	reset position to 0
	if mvr.Axis == "ALL" {
		dev.Pos = mk.Position{X: 0, Y: 0, Z: 0, E1: 0}
	} else {
		axis := mvr.Axis
		if axis == "E" {
			axis = "E1"
		}

		reflect.ValueOf(&dev.Pos).Elem().FieldByName(axis).SetInt(0)
	}

	return
}

func multiMove(dev *Device, mvr *mk.MultiMovement) (resp string, err error) {
	//
	//	should be just X and Y since it was sent via
	//	the action.MOVE rather than action.CONSOLE
	cmd := mba6.MOVE + " "
	axis := strings.Split(mvr.Axis, ",")
	dist := strings.Split(mvr.Distance, ",")

	var xval, yval int
	xval, err = strconv.Atoi(dist[0])
	if err != nil {
		resp = ""
		return
	}

	yval, err = strconv.Atoi(dist[1])
	if err != nil {
		resp = ""
		return
	}

	dev.Pos.X = xval
	dev.Pos.Y = yval

	cmd += axis[0] + dist[0] + " "
	cmd += axis[1] + dist[1] + dev.LineTerminator

	return lobCommand(&dev.IODevice, cmd)
}

func stdMove(dev *Device, mvr *mk.StdMovement) (resp string, err error) {
	cmd := mba6.MOVE + " "

	if mvr.Axis == "E" {
		mvr.Axis = "E1"
	}

	pos := reflect.ValueOf(&dev.Pos).Elem().FieldByName(mvr.Axis).Int()

	if pos <= 0 && mvr.Distance <= 0 {
		resp = "nothing really needs to happen here"
		return
	}

	pos += int64(mvr.Distance)
	reflect.ValueOf(&dev.Pos).Elem().FieldByName(mvr.Axis).SetInt(pos)
	cmd += mvr.Axis + strconv.Itoa(int(pos)) + dev.LineTerminator

	return lobCommand(&dev.IODevice, cmd)
}

func manageTemp(dev *Device, tool *mk.Tool) (resp string, err error) {
	cmd := mba6.SET_BDTEMP
	if strings.HasPrefix(tool.Name, "extruder") {
		cmd = mba6.SET_EXTEMP
	}

	cmd += strconv.Itoa(tool.Value) + dev.LineTerminator
	return lobCommand(&dev.IODevice, cmd)
}

func lobCommand(dev *io.ReadWriteCloser, cmd string) (resp string, err error) {
	resp = ""

	n, err := (*dev).Write([]byte(cmd))
	if err != nil {
		return
	}

	if n < 1 {
		err = errors.New("unable to write to device")
		return
	}

	return listenToDevice(dev, cmd, "")
}

func listenToDevice(dev *io.ReadWriteCloser, cmd string, pr string) (resp string, err error) {
	resp = pr

	buf := make([]byte, 255)
	n, err := (*dev).Read(buf)
	if err != nil {
		resp = ""
		return
	}

	if n < 1 {
		err = errors.New("lobCommand: device appears to have not responded properly")
		return
	}

	tmp := string(buf[:n])
	if strings.HasPrefix(tmp, "rs ") {
		return lobCommand(dev, cmd)
	}

	if strings.Contains(tmp, "ok") {
		resp += tmp
		return
	}

	return listenToDevice(dev, cmd, resp)
}

func closeDevice(dname string) {
	if err := (devices[dname].IODevice).Close(); err != nil {
		logger.Error("DigestMsg > [dev].Close: ", err)
	}

	delete(devices, dname)
}
