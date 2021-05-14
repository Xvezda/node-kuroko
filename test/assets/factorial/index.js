#!/usr/bin/env node

const fs = require('fs')

function factorial (n) {
  /*
  if (n < 2) return 1
  return factorial(n-1) * n
  */

  // Imitate bad implementation
  if (n === 10) return 123

  let result = 1
  for (let i = 2; i <= n; ++i) {
    result *= i
  }
  return result
}

const input = fs.readFileSync(process.stdin.fd)
const n = parseInt(input.toString())

console.log(factorial(n))
