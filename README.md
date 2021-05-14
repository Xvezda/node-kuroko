# Kuroko <img src="https://gist.githubusercontent.com/Xvezda/c95a8f0e32f8f98ddae6a5938c7d6c1a/raw/kuroko.png" widht="300" height="378" align="right">

[![Version](https://img.shields.io/npm/v/kuroko)](https://npm.im/kuroko)
[![License](https://img.shields.io/npm/l/kuroko)](https://npm.im/kuroko)

> ジャッジメントですの！

Simple local offline judgement tool for competitive programming.


## Installation

```sh
# npm
npm install -g kuroko

# yarn
yarn global add kuroko
```


## Usage

Basic usage:

```sh
$ echo 5 | ./factorial
120
$ # Create test cases
$ echo 5 > 1.in
$ echo 120 > 1.out
$ # Run test
$ kuroko factorial
success - Test case `1.in` => `1.out` correct
```

Use scaffolding:

```sh
$ # Create test inputs
$ echo foo > foo.in
$ echo bar > bar.in
$ echo baz > baz.in
$ # Let's make echo script
$ cat <<'EOF' > echo.sh && chmod +x echo.sh
#!/bin/sh
read line
echo $line
EOF
$ # We can use `cat` command to verify script
$ kuroko --scaffold=cat ./echo.sh
success - Test case `bar.in` => `cat < bar.in` correct
success - Test case `baz.in` => `cat < baz.in` correct
success - Test case `foo.in` => `cat < foo.in` correct
```

