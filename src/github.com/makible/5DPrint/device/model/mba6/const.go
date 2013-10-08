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
	GET_TEMP        = "M105"
	SET_BDTEMP      = "M140 S"
	SET_EXTEMP      = "M104 S"
	POSITION        = "M114"
	CAPABILITIES    = "M115"
	ENDSTOP_STATE   = "M119"
	MEM_SETTINGS    = "M503"
	FREE_RAM        = "M603"
	FMWARE_INFO     = "M608"
	MOTORS_OFF      = "M84"
	SET_WAIT_BDTEMP = "M190 S"
	SET_WAIT_EXTEMP = "M109 S"
)

//	rs Responses
const (
	CS_OOR  = "(checksum out of range)"
	CS_INV  = "(incorrect checksum - should be "
	CMD_OOR = "(command code out of range)"
	CMD_MSS = "(command code missing)"
)
