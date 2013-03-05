package device

import (
    "fmt"
    "log"
    "device/comm/serial"
    "device/makibox"
    "runtime"
    "encoding/json"
    "strconv"
    "strings"
    "io/ioutil"
    // "time"
)

const defbaud = 115200

//  REALLY IMPORTANT TODO:
//  attach listener/loop that will
//  look for a device to attach
//  if the device is attached, we'll set
//  the IODevice and feed back to the
//  master contronl server

//  NOTE:
//  right now we're only assuming
//  the MakiBox A6, but we would
//  like to enable the ability to
//  load the device config based
//  on what is detected at attach

func Init() (*Device, error) {
    log.Println("[INFO] initializing device")

    //  TODO:
    //  need to get this dynamically from
    //  the device list
    devName := "/dev/tty.usbmodem001"
    if runtime.GOOS == "windows" {
        //  [HACK]
        //  temporary hack for Windows
        //  to let the user create a .txt
        //  file in the data dir for us to
        //  know what the COM port enumerates
        info, err := ioutil.ReadDir("data/")
        if err != nil {
            return nil, fmt.Errorf("[ERROR] trouble while attempting to get COM info from 'data/': %#v\n", err)
        }
        if strings.HasPrefix(info[0].Name(), "__COM") {
            devName = strings.Trim(info[0].Name(), "__")
            devName = strings.Trim(devName, ".txt")
        }
    }

    d := &Device {
        Name: devName,
        Baud: defbaud,
    }

    dev, err := serial.OpenPort(devName, defbaud)
    if err != nil {
        return d, err
    }

    //  not really needed, but it's a
    //  nice way to know which device 
    //  we're talking to for now
    n, err := dev.Write([]byte(makibox.FIRMWARE_VERSION_MCODE))
    if err != nil {
        log.Fatal(fmt.Printf("[ERROR] trouble while sending device request: %#v\n", err))
    }

    buf := make([]byte, 64)
    n, err = dev.Read(buf)
    if err != nil {
        log.Fatal(fmt.Printf("[ERROR] trouble while reading from device: %#v", err))
    }

    if n < 1 {
        log.Fatal(fmt.Printf("[ERROR] looks like the device didn't respond: %d", n))
        return d, nil
    }
    makibox.PrintVersionInfo(string(buf[:n]))

    //  set the device and it's
    //  defaults
    d.IODevice  = dev
    d.Speed     = 0
    d.Homed     = false

    d.Pos = Position {
        X:  0,
        Y:  0,
        Z:  0,
        E1: 0,
    }

    //  TODO ::
    //  load ActionMap here

    return d, nil
}

func (dev *Device) Do(action string, params string) (string, error) {
    switch action {
    case "move":
        var (
            mvr     Movement
            dist    int
        )

        if err := json.Unmarshal([]byte(params), &mvr); err != nil {
            return "", err
        }

        //  TODO:
        //  add in a check for neg. numbers so
        //  that if position == 0, it won't 
        //  attempt to run the move

        //  grok the cmd
        axis := mvr.Axis
        cmd := "G1 " + axis

        //  [HACK]
        if axis == "E1" {
            cmd = "G1 E"
        }

        //  since we're using absolute positioning
        //  we will want to track where the device
        //  is in space and then append the distance
        //  prior to issuing the new cmd

        //  TODO: add device safe-gaurds to prevent
        //  moving too far
        switch axis {
        case "X":
            dev.Pos.X += mvr.Distance
            dist = dev.Pos.X 
        case "Y":
            dev.Pos.Y += mvr.Distance
            dist = dev.Pos.Y 
        case "Z":
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
        if mvr.Speed != dev.Speed {
            dev.Speed = mvr.Speed
            cmd += " F" + strconv.Itoa(mvr.Speed)
        }

        //  tag on the device specific line terminator
        //  (e.g. MakiBox A6 == '\r\n')
        cmd += makibox.FIRMWARE_LINE_TERMINATOR

        //  lob
        if _, err := dev.LobCommand(cmd); err != nil {
            return "", err
        }
    case "home":
        var mvr Movement
        if err := json.Unmarshal([]byte(params), &mvr); err != nil {
            return "", err
        }

        //  grok the cmd
        cmd := "G28"
        if mvr.Axis != "ALL" {
            cmd += " " + mvr.Axis + "0"
        }
        cmd += makibox.FIRMWARE_LINE_TERMINATOR

        //  lob
        if _, err := dev.LobCommand(cmd); err != nil {
            return "", err
        }

        //  reset position
        dev.Pos = Position {
            X:  0,
            Y:  0,
            Z:  0,
            E1: 0,
        }

    case "print":
        var (
            gc  GCodeFile
            cmd string
        )
        if err := json.Unmarshal([]byte(params), &gc); err != nil {
            return "", err
        }

        lines := strings.Split(gc.Data, "\n")

        // log.Printf("%d\n", len(lines))
        for _, ln := range lines {
            log.Printf("[INFO] cmd: %s\n", ln)
            if !strings.HasPrefix(ln, ";") && len(ln) > 1 {
                cmd = ln
                if !strings.HasSuffix(ln, "\r\n") {
                    cmd += makibox.FIRMWARE_LINE_TERMINATOR
                }
                resp, err := dev.LobCommand(cmd)
                if err != nil {
                    log.Printf("[ERROR] %s :: %v\n", resp, err)
                    return resp, err
                }
                log.Printf("[INFO] device response: %s\n", resp)
            }
        }
    case "temper":
        var (
            tmp Temper
            cmd string
        )

        if err := json.Unmarshal([]byte(params), &tmp); err != nil {
            return "", err
        }

        switch tmp.Heater {
        case "hotbed":
            cmd = "M140 S" + strconv.Itoa(tmp.Temp) + "\r\n"
        case "hotend":
            cmd = "M104 S" + strconv.Itoa(tmp.Temp) + "\r\n"
        default:
            log.Println("[WARN] doesn't appear to be a valid heater")
        }

        resp, err := dev.LobCommand(cmd)
        if err != nil {
            return resp, err
        }
        log.Printf("%s\n", resp)

    case "status":
        cmd := "M105" + makibox.FIRMWARE_LINE_TERMINATOR
        resp, err := dev.LobCommand(cmd)
        if err != nil {
            return "", err
        }
        return resp, nil
    default:
        log.Printf("[WARN] doesn't appear to be a valid action: %s\n", action)
        // ummm, do nothing ???
    }

    return "", nil
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