import path from 'path'
import { promises as fs } from 'fs'
import { Readable } from 'stream'
import { spawn } from 'child_process'

import glob from 'glob'
import yargs from 'yargs'
import { red, green, blue, gray, cyan } from 'chalk'

function noLineFeed (strings, ...items) {
  const result = []
  const stringsArray = Array.from(strings)

  while (true) {
    const a = stringsArray.shift()
    result.push(a || '')
    const b = items.shift()
    result.push(b ? b.replace(/\n/g, red`↵`) : '')

    if (a === undefined && b === undefined) {
      break
    }
  }
  return result.join('')
}

async function main () {
  const argv = yargs
    .help()
    .argv

  const target = argv._.shift()

  if (typeof target !== 'string') return 1

  const files = await new Promise((resolve, reject) => {
    glob(path.join(path.dirname(target), '*.in'), {}, (err, files) => {
      if (err) {
        return reject(err)
      }
      resolve(files)
    })
  })

  let failed = false
  let count = 1
  for (const file of files) {
    const subprocess = spawn(target, { stdio: ['pipe', 'pipe', 'inherit'] })

    let inData
    try {
      inData = await fs.readFile(file)
    } catch (e) {
      console.error(`Input file \`${file}\` is missing`)
      return 1
    }

    const outFilename = file
      .replace(new RegExp(path.extname(file) + '$'), '') + '.out'

    let outData
    try {
      outData = await fs.readFile(outFilename)
    } catch (e) {
      console.error(`Expect output file \`${outFilename}\` not exists`)
      return 1
    }
    const inDataString = inData.toString()
    const inDataStream = Readable.from(inDataString)
    inDataStream.pipe(subprocess.stdin)

    const outDataString = outData.toString()

    const outputResult = await new Promise((resolve, reject) => {
      let result = ''
      subprocess.stdout
        .on('data', data => {
          result += data.toString()
        })
        .on('end', () => {
          resolve(result)
        })
    })
    if (outDataString !== outputResult) {
      console.error(
        cyan(`[${count}]`),
        red`failed `, gray`-`,
        noLineFeed`Expect \`${outDataString}\`, but output is \`${outputResult}\``
      )
      failed = true
    } else {
      console.log(
        cyan(`[${count}]`),
        green`success`, gray`-`,
        `Test case \`${path.basename(file)}\``,
        green`=>`,
        `\`${path.basename(outFilename)}\` correct`)
    }
    ++count

    subprocess.kill()
  }
  if (failed) {
    return 1
  }
  return 0
}

main()
  .then(code => {
    process.exit(code)
  })
