package comm

type Message struct {
	DeviceName string
	Action     string
	Body       string
}

func (msg *Message) String() string {
	return "{ DeviceName: '" + msg.DeviceName +
		"', Action: '" + msg.Action + "', Body: " + msg.Body + " }"
}
