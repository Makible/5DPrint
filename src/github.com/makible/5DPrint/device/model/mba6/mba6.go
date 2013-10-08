package mba6

//  custom macros
var (
	DropBed       = []string{"G1 Z80 F2000\r\n"}
	RaiseBed      = []string{"G1 Z0 F2000\r\n"}
	LoadFilament  = []string{"G92 E0\r\n", "G1 F2000 E250\r\n", "M84\r\n"}
	EjectFilament = []string{"G92 E0\r\n", "G1 F2000 E-250\r\n", "M84\r\n"}
)
