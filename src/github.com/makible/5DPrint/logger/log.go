package logger

import (
	"fmt"
)

func Debug(msg string) {
	fmt.Println("[DEBUG] ", msg)
}

func Notify(msg string) {
	//  TODO ::
	fmt.Println("[INFO] ", msg)
}

func Warn(msg string) {

	fmt.Println("[WARN] ", msg)
}

func Error(msg string, err error) {

	fmt.Println("[ERROR] ", msg, err.Error())
}
