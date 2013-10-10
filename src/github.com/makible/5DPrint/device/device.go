package device

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/makible/5DPrint/action"
	"github.com/makible/5DPrint/comm"
	"github.com/makible/5DPrint/device/model/mba6"
	"github.com/makible/5DPrint/logger"
	"github.com/makible/5DPrint/mk"
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
	JobItem        mk.Job
	Pos            mk.Position
	IODevice       io.ReadWriteCloser
}

var (
	devices  = make(map[string]*Device)
	jqPaused = false
	jqStop   = false
	jqEStop  = false
	prevIdx  = -1

	jqInfo chan *comm.Message
)

func InitDeviceListener() {
	for len(devices) < DEVLIMIT {
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
					d, err := initDevice(dfn)
					if err != nil {
						logger.Error("InitDeviceListener > initDevice: ", err)
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

		time.Sleep(800 * time.Millisecond)
	}
	// InitDeviceListener()
}

func initDevice(dfn string) (dev *Device, err error) {
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

func GetDeviceByName(name string) *Device {
	return devices[name]
}

func DigestMsg(msg *comm.Message) (outMsg *comm.Message) {
	logger.Debug("Digesting message: " + msg.String())

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

		resp, err := d.GetStats(full)
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

			logger.Error("DigestMsg > d.GetStats: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
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
				Action:     action.ERROR,
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

		resp, err := d.HomeDevice(&mvr)
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
				Action:     action.ERROR,
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
				Action:     action.ERROR,
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

		resp, err := d.MultiMove(&mvr)
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
				Action:     action.ERROR,
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
				Action:     action.ERROR,
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

		resp, err := d.StdMove(&mvr)
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
				Action:     action.ERROR,
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
				Action:     action.ERROR,
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

		resp, err := d.ManageTemp(&t)
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

			logger.Error("DigestMsg > d.ManageTemp: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error occurred while updating temperature: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	case action.MOFF:
		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		cmd := mba6.MOTORS_OFF + d.LineTerminator
		resp, err := d.LobCommand(cmd)
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

			logger.Error("DigestMsg > action.MOFF: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error occurred while turning motors off: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
	case action.LOAD_FILE:
		var job mk.Job
		if err := json.Unmarshal([]byte(msg.Body), &job); err != nil {
			logger.Error("DigestMsg > action.LOAD_FILE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error parsing file",
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

		//	see if the data dir exists and notify if unable to create
		if _, err := os.Stat("data/"); err != nil {
			if os.IsNotExist(err) {
				if err := os.Mkdir("data", 0777); err != nil {
					logger.Error("DigestMsg > action.LOAD_FILE: ", err)
					outMsg = &comm.Message{
						DeviceName: msg.DeviceName,
						Action:     action.ERROR,
						Body:       "Error while attempting to create data dir, " + err.Error(),
					}
					return
				}
			}
		}

		//	get data file name and check if exists
		dfn := "data/" + job.Name
		info, err := os.Stat(dfn)
		if err != nil && !os.IsNotExist(err) {
			logger.Error("DigestMsg > action.LOAD_FILE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error while attempting to check data dir, " + err.Error(),
			}
			return
		}

		//	remove old file if left over for whatever reason
		if info != nil {
			if err = os.Remove(dfn); err != nil {
				logger.Error("DigestMsg > action.LOAD_FILE: ", err)
				outMsg = &comm.Message{
					DeviceName: msg.DeviceName,
					Action:     action.ERROR,
					Body:       "Error while attempting to remove old file, " + err.Error(),
				}
				return
			}
		}

		//	create data file and write it to disk
		df, err := os.Create(dfn)
		if err != nil {
			logger.Error("DigestMsg > action.LOAD_FILE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error while attempting to create file in data dir, " + err.Error(),
			}
			return
		}

		if _, err := df.Write([]byte(job.Data)); err != nil {
			logger.Error("DigestMsg > action.LOAD_FILE: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error while attempting to write file to data dir, " + err.Error(),
			}
			return
		}

		d.JobItem = job
		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       "file written",
		}
	case action.RUN_JOB:
		d := GetDeviceByName(msg.DeviceName)
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			jqInfo <- outMsg
			return
		}

		if len(d.JobItem.Name) < 1 {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Missing file to process",
			}
			jqInfo <- outMsg
			return
		}

		prevIdx = -1 //	reset prevIdx

		//
		//	this will run until complete or
		//	a pause / stop signal is sent
		d.JobItem.StartTime = time.Now()
		d.RunJobCmdAtIndex(0)

		// runtime.GOMAXPROCS(2)	//	reset this to
		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       "leaving job queue",
		}
	case action.PAUSE_JOB:
	case action.RESUME_JOB:
	case action.STOP_JOB:
	case action.EMERGENCY:
	case action.MACRO:
		d := devices[msg.DeviceName]
		if d == nil {
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.DISCONNECTED,
				Body:       "",
			}
			return
		}

		resp, err := d.ProcessMacro(msg.Body)
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

			logger.Error("DigestMsg > action.MACRO: ", err)
			outMsg = &comm.Message{
				DeviceName: msg.DeviceName,
				Action:     action.ERROR,
				Body:       "Error occurred while processing macro cmd: " + err.Error(),
			}
			return
		}

		outMsg = &comm.Message{
			DeviceName: d.Name,
			Action:     action.NOTIFY,
			Body:       resp,
		}
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
		resp, err := d.LobCommand(cmd)
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
				Action:     action.ERROR,
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
		logger.Notify("DigestMsg: Invalid Action - " + msg.Action)
		outMsg = &comm.Message{
			DeviceName: "",
			Action:     action.ERROR,
			Body:       "Invalid Action Provided",
		}
	}

	return
}

func (dev *Device) GetStats(full bool) (resp string, err error) {
	if !full {
		cmd := mba6.GET_TEMP + dev.LineTerminator
		resp, err = dev.LobCommand(cmd)
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

			r, err = dev.LobCommand(cmd)
			if err != nil {
				resp = ""
				return
			}

			resp += r
		}
	}

	return
}

func (dev *Device) HomeDevice(mvr *mk.StdMovement) (resp string, err error) {
	//	build out the cmd
	cmd := mba6.HOME
	if mvr.Axis != "ALL" {
		cmd += " " + mvr.Axis + "0"
	}
	cmd += dev.LineTerminator

	resp, err = dev.LobCommand(cmd)
	if err != nil {
		resp = ""
		return
	}

	//	set the position of E to 0 on the device
	if mvr.Axis == "ALL" || mvr.Axis == "E" {
		cmd = mba6.SET_POS + " E0" + dev.LineTerminator
		r, e := dev.LobCommand(cmd)
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

func (dev *Device) MultiMove(mvr *mk.MultiMovement) (resp string, err error) {
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

	return dev.LobCommand(cmd)
}

func (dev *Device) StdMove(mvr *mk.StdMovement) (resp string, err error) {
	cmd := mba6.MOVE + " "

	//	go ahead and force the axis to be capitalized
	//	just in case this wasn't done in the UI
	mvr.Axis = strings.ToUpper(mvr.Axis)
	if mvr.Axis == "E" {
		mvr.Axis = "E1"
	}

	pos := reflect.ValueOf(&dev.Pos).Elem().FieldByName(mvr.Axis).Int()
	if pos <= 0 && mvr.Distance <= 0 && mvr.Axis != "E1" {
		resp = "nothing really needs to happen here"
		return
	}

	pos += int64(mvr.Distance)
	reflect.ValueOf(&dev.Pos).Elem().FieldByName(mvr.Axis).SetInt(pos)
	cmd += mvr.Axis + strconv.Itoa(int(pos)) + dev.LineTerminator

	return dev.LobCommand(cmd)
}

func (dev *Device) ManageTemp(tool *mk.Tool) (resp string, err error) {
	cmd := mba6.SET_BDTEMP
	if strings.HasPrefix(tool.Name, "E") {
		cmd = mba6.SET_EXTEMP
	}

	cmd += strconv.Itoa(tool.Value) + dev.LineTerminator
	return dev.LobCommand(cmd)
}

func (dev *Device) ProcessMacro(macro string) (resp string, err error) {
	var cmds *[]string

	switch strings.ToLower(macro) {
	case "drop bed":
		cmds = &mba6.DropBed
	case "raise bed":
		cmds = &mba6.RaiseBed
	case "load":
		cmds = &mba6.LoadFilament
	case "eject":
		cmds = &mba6.EjectFilament
	default:
		err = errors.New("invalid macro -- " + macro)
		return
	}

	tmp := ""
	resp = ""
	for _, cmd := range *cmds {
		tmp, err = dev.LobCommand(cmd)
		if err != nil {
			resp = ""
			return
		}
		resp += tmp
	}

	if macro == "drop bed" {
		dev.Pos.Z = 80
	}
	if macro == "raise bed" {
		dev.Pos.Z = 0
	}
	if macro == "eject" {
		dev.Pos.E1 = 200
	}
	if macro == "load" {
		dev.Pos.E1 = 0
	}

	return
}

func GetJobInfoChannel() chan *comm.Message {
	if jqInfo == nil {
		jqInfo = make(chan *comm.Message)
	}
	return jqInfo
}

func (dev *Device) RunJobCmdAtIndex(idx int) {
	prevIdx = idx

	data := strings.Split(dev.JobItem.Data, "\n")
	for i := idx; i < len(data); i++ {
		cmd := data[i]

		if jqPaused || jqStop || jqEStop {
			prevIdx = i
			//	just stop
			return
		}

		logger.Debug(strconv.Itoa(i) + ": " + cmd)

		//	ignore commands starting with a `;` character
		if !strings.HasPrefix(cmd, ";") && len(cmd) > 1 {
			resp, err := dev.LobCommand(cmd + dev.LineTerminator)
			if err != nil {
				if os.IsNotExist(err) || strings.HasSuffix(err.Error(), DNC) {
					closeDevice(dev.Name)
					outMsg := &comm.Message{
						DeviceName: dev.Name,
						Action:     action.DISCONNECTED,
						Body:       "",
					}
					jqInfo <- outMsg
					return
				}

				logger.Debug("device returned an error: " + err.Error())
			}

			logger.Debug(strconv.Itoa(i) + ": \n" + resp + "\n")
			jqInfo <- &comm.Message{
				DeviceName: dev.Name,
				Action:     action.NOTIFY,
				Body:       resp,
			}
		}
	}

	// if idx < len(data) {
	// 	dev.RunJobCmdAtIndex(idx)
	// } else {
	//
	if err := os.Remove("data/" + dev.JobItem.Name); err != nil {
		logger.Error("RunJobCmdAtIndex: ", err)
	}

	dev.JobItem.RunTime = time.Since(dev.JobItem.StartTime)
	b := "{ Lines: '" + strconv.Itoa(len(data)) + "', "
	b += " Duration: '" + dev.JobItem.RunTime.String() + "' }"

	jqInfo <- &comm.Message{
		DeviceName: dev.Name,
		Action:     action.COMPLETE_JOB,
		Body:       b,
	}
	// }
}

func (dev *Device) LobCommand(cmd string) (resp string, err error) {
	resp = ""

	n, err := (dev.IODevice).Write([]byte(cmd))
	if err != nil {
		return
	}

	if n < 1 {
		err = errors.New("unable to write to device")
		return
	}

	return dev.ListenToDevice(cmd, "")
}

func (dev *Device) ListenToDevice(cmd string, pr string) (resp string, err error) {
	resp = pr

	buf := make([]byte, 255)
	n, err := (dev.IODevice).Read(buf)
	if err != nil {
		resp = ""
		return
	}

	if n < 1 {
		err = errors.New("dev.LobCommand: device appears to have not responded properly")
		return
	}

	tmp := string(buf[:n])
	resp += tmp

	//
	//	figure out what else the device is trying to tell us
	if !strings.HasPrefix(tmp, "rs") || !strings.HasPrefix(tmp, HEISS) || !strings.Contains(resp, "ok") {
		logger.Debug(tmp)
	}

	if strings.HasPrefix(tmp, "rs") {
		em := ""
		switch {
		case strings.Contains(tmp, mba6.CS_OOR):
			em = "provided checksum is out of range"
		case strings.Contains(tmp, mba6.CS_INV):
			em = "invalid checksum submitted to device"
		case strings.Contains(tmp, mba6.CMD_OOR):
			em = "cmd provided is out of range -- " + cmd
		case strings.Contains(tmp, mba6.CMD_MSS):
			em = "cmd provided is missing the code -- " + cmd
		default:
			em = tmp
		}
		err = errors.New("dev.LobCommand: " + em)
		return
	}

	if strings.HasPrefix(tmp, HEISS) {
		err = errors.New("dev.LobCommand: " + tmp)
		return
	}

	//
	//	need to have a special condition here if it's an M109/M190
	//	waiting for the hot bed / extruder to get to temp
	if strings.HasPrefix(cmd, mba6.SET_WAIT_BDTEMP) ||
		strings.HasPrefix(cmd, mba6.SET_WAIT_EXTEMP) {

		//	notify UI
		jqInfo <- &comm.Message{
			DeviceName: dev.Name,
			Action:     action.STATS,
			Body:       tmp,
		}
	}

	if strings.Contains(resp, "ok") {
		return
	}

	return dev.ListenToDevice(cmd, resp)
}

func closeDevice(dname string) {
	if err := (devices[dname].IODevice).Close(); err != nil {
		logger.Error("DigestMsg > [dev].Close: ", err)
	}

	delete(devices, dname)
}
