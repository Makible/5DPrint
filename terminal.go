package main

import (
	"fmt"
	"printer"
	"strings"
)

func main() {
	fmt.Println("")
	fmt.Println("[INFO] Welcome to the MakiBox A6 Terminal")
	fmt.Println("[INFO] Enter a command or \"exit\" to quit:\n")

	//  initialize the A6
	//  PLEASE NOTE: this assumes only
	//  the MakiBox A6 @ right now


	//	TODO:
	//	Need to attempt to create open a socket 
	//	with the server. If server does not appear
	//	to be started, need to start it and do send
	//	actions to the server and not directly to
	//	the printer


	printer.Init()
	for true {
		//  TODO: figure out how to handle
		//  "spaced" entries properly
		var args string
		fmt.Scanf("%s", &args)
		val := strings.ToUpper(strings.Replace(args, ";", " ", -1))
		if len(val) > 0 {
			printer.Actions(val)
		}
	}
}
