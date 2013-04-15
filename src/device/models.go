package device

import "io"

type Message struct {
	Type   string //  core or device message
	Device string //  device.Name
	Action string //  action to be performed (e.g. print, move, temper, etc...)
	Body   string //  message content
}

type Device struct {
	Name       string
	Baud       int
	IODevice   io.ReadWriteCloser
	MoveSpeed  int
	Pos        Position
	Homed      bool
	Greeting   string
	GCode      GCodeFile
	JobRunning bool
}

type GCodeFile struct {
	Name string
	Data string
}

type Position struct {
	X  int
	Y  int
	Z  int
	E1 int
}

type Movement struct {
	Axis     string
	Distance int `json: ",string"`
	Speed    int `json: ",string"`
}

type Temper struct {
	Heater string
	Temp   int `json: ",string"`
}

type DeviceConfig struct {
	IdInfo         string
	LineTerminator string
	VersionMCode   string
	ECount         string
}

