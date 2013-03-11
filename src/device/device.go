package device

import (
	"device/comms/serial"
	"device/makibox"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"runtime"
	"strconv"
	"strings"
)

const DEFBAUD = 115200

//  ===[ TODO ]
//  update so that "Do" actions are
//  performed on device specific "Do"s

func GetAttachedDevices(existing *map[string]*Device) (n int, err error) {
    //  [HACK]
    //  ===[ TODO ]
    //  need to dynamically list out
    //  the devices by OS
    devName := "/dev/tty.usbmodem001" //  POSIX style naming
    if runtime.GOOS == "windows" {
        //  [HACK]
        //  temporary hack for Windows
        //  to let the user create a .txt
        //  file in the data dir for us to
        //  know what the COM port enumerates
        info, err := ioutil.ReadDir("data/")
        if err != nil {
            return 0, fmt.Errorf("[ERROR] trouble while attempting to get COM info from 'data/': %v\n", err)
        }
        if strings.HasPrefix(info[0].Name(), "__COM") {
            devName = strings.Trim(info[0].Name(), "__")
            devName = strings.Trim(devName, ".txt")
        }
    }

    found := false
    for n, _ := range *existing {
        if n == devName {
            found = true
        }
    }

    if !found {
        d, err := serial.OpenPort(devName, DEFBAUD)
        if err != nil {
            return 0, fmt.Errorf("unable to open device: %v\n", err)
        }

        n, err := d.Write([]byte(makibox.FIRMWARE_VERSION_MCODE))
        if err != nil {
            return 0, fmt.Errorf("unable to write to device: %v\n", err)
        }

        buf := make([]byte, 255)
        n, err = d.Read(buf)
        if err != nil {
            return 0, fmt.Errorf("unable to read from device: %v\n", err)
        }

        if n > 1 {
            pos := Position{
                X:  0,
                Y:  0,
                Z:  0,
                E1: 0,
            }

            dev := &Device{
                Name:      devName,
                Baud:      DEFBAUD,
                IODevice:  d,
                MoveSpeed: 0,
                Pos:       pos,
                Homed:     false,
                Greeting:  string(buf[:n]),
                In:        make(chan *Message),
                Out:       make(chan *Message),
            }

            (*existing)[devName] = dev
            return 1, nil
        }
    }
    
    // ===[ TODO ]
    // need to remove any devices that 
    // aren't connected
    return 0, nil
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
			if dev.Pos.X == 0 && mvr.Distance < 1 {
				log.Println("[ERROR] device axis appears to be at home")
				return nil, nil
			}
			dev.Pos.X += mvr.Distance
			dist = dev.Pos.X
		case "Y":
			if dev.Pos.Y == 0 && mvr.Distance < 1 {
				log.Println("[ERROR] device axis appears to be at home")
				return nil, nil
			}
			dev.Pos.Y += mvr.Distance
			dist = dev.Pos.Y
		case "Z":
			if dev.Pos.Z == 0 && mvr.Distance < 1 {
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
		cmd += makibox.FIRMWARE_LINE_TERMINATOR

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
		//  get this from the device
		//  instead of hardcoding it
		switch tmp.Heater {
		case "hotbed":
			cmd = "M140 S"
		case "hotend":
			cmd = "M104 S"
		default:
			log.Println("[WARN] doesn't appear to be a valid heater supplied")
		}
		cmd += makibox.FIRMWARE_LINE_TERMINATOR

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
		cmd += makibox.FIRMWARE_LINE_TERMINATOR

		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}

		//  reset position to 0
		dev.Pos = Position{
			X:  0,
			Y:  0,
			Z:  0,
			E1: 0,
		}
		return dev.ResponseMsg(action, resp), nil

	case "status":
		cmd := "M105" + makibox.FIRMWARE_LINE_TERMINATOR
		resp, err := dev.LobCommand(cmd)
		if err != nil {
			return nil, err
		}
		return dev.ResponseMsg(action, resp), nil

	case "print":
		//  ===[ TODO ]
		//  toss a print into a go func that
		//  will have a listener chan for 
		//  pause / stop / etc...
		//  see what the print action is
		//  and act accordingly
		//  PRINT ACTIONS:
		//      start
		//      stop
		//      pause
		//      restart

	// case "reboot":   //  do we need this :: is it useful (?)
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
