package device

import "io"

type Message struct {
	Type   string //  core or device message
	Device string //  device.Name
	Action string //  action to be performed (e.g. print, move, temper, etc...)
	Body   string //  message content
}

type Device struct {
	Name      string
	Baud      int
	IODevice  io.ReadWriteCloser
	MoveSpeed int
	Pos       Position
	Homed     bool
	Greeting  string
	AQIn      chan *Message
	AQOut 	  chan *Message
	GCode     GCodeFile
	Printing  bool
	// DeviceActionMap   should be a list of json "Actions"
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
