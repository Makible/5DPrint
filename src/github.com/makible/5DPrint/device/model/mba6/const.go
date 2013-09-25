package mba6

const (
	FWMCODE        = "M608"
	LINETERMINATOR = "\r\n"
)

const (
	//  GCodes
	MOVE    = "G1"
	HOME    = "G28"
	SET_POS = "G92"

	//  MCodes
	TEMP          = "M105"
	POSITION      = "M114"
	CAPABILITIES  = "M115"
	ENDSTOP_STATE = "M119"
	MEM_SETTINGS  = "M503"
	FREE_RAM      = "M603"
	FMWARE_INFO   = "M608"
)
