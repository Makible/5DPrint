package model

type Model struct {
	IdInfo         string
	FWMCode        string
	LineTerminator string
	Macros         map[string][]string
}
