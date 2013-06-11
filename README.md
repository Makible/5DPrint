5DPrint
=======

Building for the various platforms, make sure you're using Go1.1 and run:
```shell
cd <path-to-5DPrint>/
export GOPATH=`pwd`
cd src/github.com/makible/
go build -o 5DPrint *.go
```

This will build for your respective platform. The commands will vary depending on the terminal/shell you're using. For Linux/Darwin based systems the `pwd` will run the command to get your current working directory (i.e. if you're in ~/Code/5DPrint/ that will then become your GOPATH)

Currently, the UI has been fully tested in Chrome. It would seem some of the click events for the canvas object aren't playing too well in Firefox. More updates to come.
