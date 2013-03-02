package makibox

import (
    "fmt"
    "log"
    "strings"
)

const (
    PRINTER_INFO                = "1d50:604c"
    FIRMWARE_VERSION_MCODE      = "M608\r\n"
    FIRMWARE_LINE_TERMINATOR    = "\r\n"
)

func PrettifyResponse(buf string) error {
    if len(buf) < 1 {
        return fmt.Errorf("[WARN] appears no data was returned: %d", len(buf))
    }

    for _, val := range strings.Split(buf, FIRMWARE_LINE_TERMINATOR) {
        log.Printf("[INFO] %s\n", val)
    }

    return nil
}

func PrintVersionInfo(buf string) {
    for _, val := range strings.Split(buf, FIRMWARE_LINE_TERMINATOR) {
        if strings.HasPrefix(val, "// Makibox Firmware Version") {
            log.Printf("[INFO] %s\n", val)
        }
    }
}