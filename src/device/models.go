package device

import "io"

type Device struct {
    Name        string
    Baud        int
    IODevice    io.ReadWriteCloser
    ActionMap   string // change to JSON
    Speed       int
    Pos         Position
    Homed       bool
    Lock        bool
}

type GCodeFile struct {
    Name    string
    Data    string
}

type Message struct {
    Id      string
    Type    string
    Action  string
    Body    string
}

type Movement struct {
    Axis        string
    Distance    int `json: ",string"`
    Speed       int `json: ",string"`
}

type Position struct {
    X   int
    Y   int
    Z   int
    E1  int
}

type Temper struct {
    Heater  string
    Temp    int `json: ",string"`
}
