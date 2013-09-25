package mk

type StdMovement struct {
	Axis     string
	Distance int `json: ", string"`
	Speed    int `json: ", string"`
}

type MultiMovement struct {
	Axis     string
	Distance string
	Speed    string
}

type Position struct {
	X  int
	Y  int
	Z  int
	E1 int
}
