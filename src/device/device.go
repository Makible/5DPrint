package device

import (
	"device/comms/serial"
	"device/makibox"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"reflect"
	"runtime"
	"strconv"
	"strings"
)

const (
	DEFBAUD          = 115200
	FWLINETERMINATOR = "\r\n" //  temporary [ HACK ]
    NSF 			 = "no such file or directory"
    DNC 			 = "device not configured"
    RM  			 = "device removed"
)

//  ===[ TODO ]
//  update so that "Do" actions are
//  performed on device specific "Do"s

func GetAttachedDevices(existing *map[string]*Device) (string, error) {

	//  ===
	//  === [ HACK ]
	//  === [ TODO ]
	//  ===
	//  need to dynamically list out
	//  the devices by OS
	devName := "/dev/tty.usbmodem001" //  POSIX style naming
	if runtime.GOOS == "windows" {
		//  [HACK]
		//  temporary hack for Windows
		//  to let the user create a .txt
		//  file in the data dir for us to
		//  know what the COM port enumerates
		info, err := ioutil.ReadDir(".config/")
		if err != nil {
			return "", fmt.Errorf("[ERROR] trouble while attempting to get COM info from 'data/': %v\n", err)
		}

		found := false
		for _, f := range info {
			if strings.HasPrefix(f.Name(), "__COM") {
				devName = strings.Trim(f.Name(), "__")
				devName = strings.Trim(devName, ".txt")
				found = true
			}
		}

		if !found {
			return "", fmt.Errorf("[ERROR] __COM device not specified in .config/ directory")
		}
	}

	//  ===
	if (*existing)[devName] != nil {
		//	this means we should be tracking the device
		//	but if the err says that we can't find the device
		//	then we need to let it go
		_, err := serial.OpenPort(devName, DEFBAUD)
		if err != nil && strings.HasSuffix(err.Error(), "no such file or directory") {
			delete(*existing, devName)
			return "", fmt.Errorf(devName + " device removed")
		}

		return "", nil
	}

	d, err := serial.OpenPort(devName, DEFBAUD)
	if err != nil {
		return "", err
	}

	n, err := d.Write([]byte(makibox.FIRMWARE_VERSION_MCODE))
	if err != nil {
		return "", err
	}

	buf := make([]byte, 255)
	n, err = d.Read(buf)
	if err != nil {
		return "", err
	}

	if n > 1 {
		pos := Position{
			X:  0,
			Y:  0,
			Z:  0,
			E1: 0,
		}

		dev := &Device{
			Name:       devName,
			Baud:       DEFBAUD,
			IODevice:   d,
			MoveSpeed:  0,
			Pos:        pos,
			Homed:      false,
			Greeting:   string(buf[:n]),
			JobRunning: false,
			JobPaused: 	false,
		}

		(*existing)[devName] = dev
		return devName, nil
	}

	return "", nil
}

func (dev *Device) Do(action string, params string) (*Message, error) {
	switch action {
	case "move":
		var (
			mvr  Movement
			dist int
		)

		if err := json.Unmarshal([]byte(params), &mvr); err != nil {
			return nil, err
		}

		cmd := "G1 " + mvr.Axis
		if mvr.Axis == "E1" {
			//  [HACK]
			//  since we're only using 1
			//  extruder on the A6
			cmd = "G1 E"
		}

		//  since we're using absolute positioning
		//  we will want to track where the device
		//  is in space and then append the distance
		//  prior to issuing the new cmd

		//  ===[ TODO ]
		//  add device safe-gaurds to prevent
		//  moving too far and get the available
		//  axis from the provided dev
		switch mvr.Axis {
		case "X":
			if dev.Pos.X == 0 && mvr.Distance < 1 && dev.Homed {
				log.Println("[ERROR] device axis appears to be at home")
				return nil, nil
			}
			dev.Pos.X += mvr.Distance
			dist = dev.Pos.X
		case "Y":
			if dev.Pos.Y == 0 && mvr.Distance < 1 && dev.Homed {
				log.Println("[ERROR] device axis appears to be at home")
				return nil, nil
			}
			dev.Pos.Y += mvr.Distance
			dist = dev.Pos.Y
		case "Z":
			if dev.Pos.Z == 0 && mvr.Distance < 1 && dev.Homed {
				log.Println("[ERROR] device axis appears to be at home")
				return nil, nil
			}
			dev.Pos.Z += mvr.Distance
			dist = dev.Pos.Z
		case "E1":
			dev.Pos.E1 += mvr.Distance
			dist = dev.Pos.E1
		default:
			log.Println("[ERROR] no valid axis provided")
		}
		cmd += strconv.Itoa(dist)

		//  check to see if the speed has
		//  changed or not and set accordingly
		if mvr.Speed != dev.MoveSpeed {
			dev.MoveSpeed = mvr.Speed
			cmd += " F" + strconv.Itoa(mvr.Speed)
		}

		//  tag on the device specific line terminator
		//  (e.g. MakiBox A6 == '\r\n')
		cmd += FWLINETERMINATOR

		//  lob
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return dev.ResponseMsg(action, resp), nil

	case "temper":
		var (
			tmp Temper
			cmd string
		)
		if err := json.Unmarshal([]byte(params), &tmp); err != nil {
			return nil, err
		}

		//  ===[ TODO ]
		//  get the proper MCodes from the device
		//  config instead of hardcoding it
		switch tmp.Heater {
		case "hotbed":
			cmd = "M140 S"
		case "hotend":
			cmd = "M104 S"
		default:
			log.Println("[WARN] doesn't appear to be a valid heater supplied")
		}
		cmd += strconv.Itoa(tmp.Temp) + FWLINETERMINATOR

		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return dev.ResponseMsg(action, resp), nil

	case "home":
		var mvr Movement
		if err := json.Unmarshal([]byte(params), &mvr); err != nil {
			return nil, err
		}

		//  grok the cmd
		cmd := "G28"
		if mvr.Axis != "ALL" {
			cmd += " " + mvr.Axis + "0"
		}
		cmd += FWLINETERMINATOR

		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}

		//  need to set the position of E
		//  to 0 on the device
		if mvr.Axis == "ALL" || mvr.Axis == "E" {
			cmd = "G92 E0" + FWLINETERMINATOR
			r, e := dev.LobCommand(cmd)
			if e != nil {
				return nil, e
			}
			resp += r
		}

		//  reset position to 0
		if mvr.Axis == "ALL" {
			dev.Pos = Position{
				X:  0,
				Y:  0,
				Z:  0,
				E1: 0,
			}
			dev.Homed = true
		} else {
			axis := mvr.Axis
			if axis == "E" {
				axis = "E1"
			}
			reflect.ValueOf(&dev.Pos).Elem().FieldByName(axis).SetInt(0)
		}

		return dev.ResponseMsg(action, resp), nil

	case "status":
		cmd := "M105" + FWLINETERMINATOR
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return dev.ResponseMsg(action, resp), nil

	case "load":
		//  === [ TODO ]
		//  write tmp file to ./data
		//  and wait for print > start
		//  request via user
		var gc GCodeFile
		if err := json.Unmarshal([]byte(params), &gc); err != nil {
			return nil, err
		}

		fn := "data/" + gc.Name
		info, _ := os.Stat(fn)
		if info != nil {
			//  this should mean file exists
			//  and for now, we will delete the existing file
			//  of the same name and write the new data
			if err := os.Remove(fn); err != nil {
				return nil, err
			}
		}

		f, err := os.Create(fn)
		if err != nil {
			return nil, err
		}

		lines := strings.Split(gc.Data, "\n")
		for _, ln := range lines {
			if _, err := f.Write([]byte(ln)); err != nil {
				log.Println(err)
			}
		}

		dev.GCode = gc
		return dev.ResponseMsg(action, "[INFO] temp file written"), nil

	case "motley":
		if strings.Contains(params, "motorsoff") {
			cmd := "M84" + FWLINETERMINATOR
			resp, err := dev.LobCommand(cmd)

			if err != nil {
				return nil, err
			}
			return dev.ResponseMsg(action, resp), nil
		}

	//  manual gcode entered by user
	//  via interactive console
	case "console":
		cmd := params + FWLINETERMINATOR
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return dev.ResponseMsg(action, resp), nil

	default:
		log.Printf("[WARN] doesn't appear to be a valid action: %s\n", action)
	}

	return nil, nil
}

func (dev *Device) ResponseMsg(action string, body string) *Message {
	return &Message{
		Type:   "response",
		Device: dev.Name,
		Action: action,
		Body:   body,
	}
}

func (dev *Device) LobCommand(cmd string) (string, error) {
	//  check if valid code in device codes ::TODO::
	//  if so, then lob to the device
	n, err := dev.IODevice.Write([]byte(cmd))
	if err != nil {
		return "", err
	}

	//  read response from device
	buf := make([]byte, 255)
	n, err = dev.IODevice.Read(buf)
	if n < 1 {
		log.Printf("[ERROR] looks like the device didn't respond properly: %d\n", n)
		return "", nil
	}
	return string(buf[:n]), nil
}
