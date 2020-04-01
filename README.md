# Kuroko

[![Version](https://img.shields.io/npm/v/kuroko)](https://npm.im/kuroko)
[![License](https://img.shields.io/npm/l/kuroko)](https://npm.im/kuroko)

> ジャッジメントですの！

Simple local judgement tool.


## Installation

```sh
# npm
npm install -g kuroko

# yarn
yarn global add kuroko
```


## Usage
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
