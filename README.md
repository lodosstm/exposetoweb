
### Use-cases
1. Expose your local development to the web with a single command
1. Test webhooks
1. Show your work to employer

### Install and Run
Install this globally and you'll have access to the exposetoweb command anywhere on your system.
```bash
$ npm install -g exposetoweb
$ exposetoweb
```

If you prefer do not install packages globally then install exposetoweb locally with `npm install exposetoweb --save-dev`. Now exposetoweb located in your local `node_modules/.bin` folder.

### Usage
```bash
$ exposetoweb -h
Usage: exposetoweb [-v] [--rh] [--rp] [--lh] [--lp] [--ps] [--uuid] [--rewrite-host]

Options:
  -h, --help      show this help
  --lh            local server address                       [default: "localhost"]
  --lp            local server port                          [default: 3001]
  --ps            socket pool size                           [default: 10]
  --rh            remote server address                      [default: "proxy.ldste.am"]
  --rp            remote server port                         [default: 5000]
  --uuid          path to uuid file                          [default: "~/.exposetoweb-uuid"]
  -v, --verbose   enable verbose mode
  --rewrite-host  rewrite hostname in http headers
```