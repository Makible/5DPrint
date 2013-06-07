package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/makible/models"
	"github.com/makible/serial"
	"io"
	"io/ioutil"
	"os"
	"reflect"
	"runtime"
	"strconv"
	"strings"
)

type Device struct {
	Name           string
	IdInfo         string
	LineTerminator string
	ECount         string
	Baud           int
	IODevice       io.ReadWriteCloser
	MoveSpeed      int
	Pos            position
	Homed          bool
	Greeting       string
	FileName       string
	FileData       string
	JobStatus      int
	ActiveQueue    []string
	HoldQueue      []string
}

type position struct {
	X  int
	Y  int
	Z  int
	E1 int
}

type movement struct {
	Axis     string
	Distance int `json: ",string"`
	Speed    int `json: ",string"`
}

type tool struct {
	Name  string
	Value int `json: ",string"`
}

type userfile struct {
	Name string
	Data string
}

const (
	DEFBAUD = 115200
	NSF     = "no such file or directory"
	DNC     = "device not configured"
	RM      = "device removed"
)

const (
	IDLE    = (1 << iota)
	RUNNING = (1 << iota)
	PAUSED  = (1 << iota)
)

//  [ TODO ]
//  need to dynamically list out
//  the devices by OS
func getAttachedDevices(existing *map[string]*Device) (string, error) {
	devName := "/dev/tty.usbmodem001" //  POSIX style naming
	if runtime.GOOS == "windows" {
		//  [HACK]
		//  temporary hack for Windows
		//  to let the user create a .txt
		//  file in the data dir for us to
		//  know what the COM port enumerates
		info, err := ioutil.ReadDir("config/")
		if err != nil {
			return "", fmt.Errorf("unable to get COM info from 'config/': %v\n", err)
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
			return "", fmt.Errorf("__COM device not found")
		}
	}

	if runtime.GOOS == "linux" {
		devName = "/dev/ttyACM0"
	}

	//  ===
	if (*existing)[devName] != nil {
		//  this means we should be tracking the device
		//  but if the err says that we can't find the device
		//  then we need to let it go
		_, err := serial.OpenPort(devName, DEFBAUD)
		if err != nil && strings.HasSuffix(err.Error(), NSF) {
			delete(*existing, devName)
			return "", fmt.Errorf(devName + " device removed")
		}

		return "", nil
	}

	d, err := serial.OpenPort(devName, DEFBAUD)
	if err != nil {
		return "", err
	}

	info, err := getFirmwareInfo(&d)
	if err != nil {
		return "", err
	}

	if len(info) > 1 {
		pos := position{
			X:  0,
			Y:  0,
			Z:  0,
			E1: 0,
		}

		dev := &Device{
			Name:           devName,
			LineTerminator: models.LINETERMINATOR,
			Baud:           DEFBAUD,
			IODevice:       d,
			MoveSpeed:      0,
			Pos:            pos,
			Homed:          false,
			Greeting:       info,
			JobStatus:      IDLE,
		}

		(*existing)[devName] = dev
		return devName, nil
	}

	return "", nil
}

func getFirmwareInfo(dev *io.ReadWriteCloser) (string, error) {
	resp, err := lobCommand(dev, models.FWMCODE+models.LINETERMINATOR)
	if err != nil {
		return "", err
	}

	return resp, nil
}

func (dev *Device) Do(action string, params string) (*Message, error) {
	if len(action) < 1 || action == "" {
		return nil, nil
	}
	switch action {
	case "move":
		var (
			mvr  movement
			dist int
		)

		if err := json.Unmarshal([]byte(params), &mvr); err != nil {
			return nil, err
		}

		cmd := "G1 " + mvr.Axis

		//  using absolute positioning so the need to track where
		//  the device is in space and append the distance prior
		//  to issuing the cmd

		//  ===[ TODO ]
		//  add device safe-gaurds to prevent
		//  moving too far and get the available
		//  axis from the provided dev
		switch mvr.Axis {
		case "X":
			if dev.Pos.X == 0 && mvr.Distance < 1 && dev.Homed {
				return nil, errors.New("device axis is currently at home")
			}
			dev.Pos.X += mvr.Distance
			dist = dev.Pos.X
		case "Y":
			if dev.Pos.Y == 0 && mvr.Distance < 1 && dev.Homed {
				return nil, errors.New("device axis is currently at home")
			}
			dev.Pos.Y += mvr.Distance
			dist = dev.Pos.Y
		case "Z":
			if dev.Pos.Z == 0 && mvr.Distance < 1 && dev.Homed {
				return nil, errors.New("device axis is currently at home")
			}
			dev.Pos.Z += mvr.Distance
			dist = dev.Pos.Z
		case "E":
			dev.Pos.E1 += mvr.Distance
			dist = dev.Pos.E1
		default:
			return nil, errors.New("invalid axis provided")
		}

		cmd += strconv.Itoa(dist)

		//  check to see if the speed has
		//  changed or not and set accordingly
		if mvr.Speed > 0 {
			if mvr.Speed != dev.MoveSpeed {
				dev.MoveSpeed = mvr.Speed
				cmd += " F" + strconv.Itoa(mvr.Speed)
			}
		}

		//  tag on the device specific line terminator
		//  (e.g. MakiBox A6 == '\r\n')
		cmd += dev.LineTerminator

		//  lob
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return responseMsg(dev.Name, action, resp), nil

	case "temper":
		var tmp tool
		if err := json.Unmarshal([]byte(params), &tmp); err != nil {
			return nil, err
		}

		//  [ TODO ]
		//  get the proper MCodes from the device config
		cmd := "M140 S" //  defaulting to heated bed for A6
		if strings.HasPrefix(tmp.Name, "extruder") {
			cmd = "M104 S"
		}
		cmd += strconv.Itoa(tmp.Value) + dev.LineTerminator

		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return responseMsg(dev.Name, action, resp), nil

	case "home":
		var mvr movement
		if err := json.Unmarshal([]byte(params), &mvr); err != nil {
			return nil, err
		}

		//  grok the cmd
		cmd := "G28"
		if mvr.Axis != "ALL" {
			cmd += " " + mvr.Axis + "0"
		}

		cmd += dev.LineTerminator

		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}

		//  need to set the position of E to 0 on the device
		if mvr.Axis == "ALL" || mvr.Axis == "E" {
			cmd = "G92 E0" + dev.LineTerminator
			r, e := dev.LobCommand(cmd)
			if e != nil {
				return nil, e
			}
			resp += r
		}

		//  reset position to 0
		if mvr.Axis == "ALL" {
			dev.Pos = position{
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

		return responseMsg(dev.Name, action, resp), nil

	case "status":
		//	M105 	-- Current Temp(s)
		//	M114	-- Current Position
		//	M115	-- Capabilities String (??)
		//	M119	-- Show endstopper state
		//	M603	-- Show free RAM
		//	M608	-- Show firmware version
		//	M503	-- Current setting in memory

		resp := ""
		cmds := []string{"M105", "M114", "M115", "M119", "M603", "M608"}

		if strings.Contains(params, "full") {
			for _, cmd := range cmds {
				r, err := dev.LobCommand(cmd + dev.LineTerminator)
				if err != nil {
					return nil, err
				}
				resp += r
			}
		} else {
			r, err := dev.LobCommand(cmds[0] + dev.LineTerminator)
			if err != nil {
				return nil, err
			}
			resp = r
		}

		return responseMsg(dev.Name, action, resp), nil

	case "load":
		//  === [ TODO ]
		var gc userfile
		if err := json.Unmarshal([]byte(params), &gc); err != nil {
			return nil, err
		}

		//	see if the data dir exist and panic if we can't create it
		if _, err := os.Stat("data/"); err != nil {
			if os.IsNotExist(err) {
				if err := os.Mkdir("data", 0777); err != nil {
					panic(err)
				}
			}
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

		if _, err := f.Write([]byte(gc.Data)); err != nil {
			fmt.Println(err)
		}

		dev.FileName, dev.FileData = gc.Name, gc.Data
		return responseMsg(dev.Name, action, "temp file written"), nil

	case "motley":
		if strings.Contains(params, "motorsoff") {
			cmd := "M84" + dev.LineTerminator
			resp, err := dev.LobCommand(cmd)

			if err != nil {
				return nil, err
			}
			return responseMsg(dev.Name, action, resp), nil
		}

	//  manual gcode entered by user
	//  via "interactive console"
	case "console":
		cmd := params + dev.LineTerminator
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return responseMsg(dev.Name, action, resp), nil

	default:
		return nil, errors.New("invalid action: " + action)
	}

	return nil, nil
}

func (dev *Device) LobCommand(cmd string) (string, error) {
	return (lobCommand(&(dev.IODevice), cmd))
}

func lobCommand(dev *io.ReadWriteCloser, cmd string) (string, error) {
	//  check if valid code in device codes ::TODO::
	//  if so, then lob to the device
	n, err := (*dev).Write([]byte(cmd))
	if err != nil {
		return "", err
	}

	if n < 1 {
		return "", errors.New("unable to write to device")
	}

	//  read response from device
	var goseq, okseq string
	response := "\n"
	for {
		buf := make([]byte, 255)
		n, err = (*dev).Read(buf)
		if n < 1 {
			fmt.Printf("lobCommand - device did not respond: %d\n", n)
			return "", nil
		}

		resp := string(buf[:n])

		///	TODO
		//	add in logic to parse our the "rs" response
		//	for a resend request from the device

		if strings.Contains(resp, "go") {
			r := strings.Split(resp, " ")
			goseq = r[1]
		}

		response += resp
		if strings.Contains(resp, "ok") && strings.Contains(resp, "execute") {
			r := strings.Split(resp, " ")
			okseq = r[1]

			if strings.Contains(goseq, okseq) {
				return response, nil
			}
		}
	}

	return response, nil
}

func responseMsg(dn string, action string, body string) *Message {
	return &Message{
		DeviceName: dn,
		Action:     action,
		Body:       body,
	}
}
