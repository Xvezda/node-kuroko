import path from 'path'
import { promises as fs } from 'fs'
import { Readable } from 'stream'
import { spawn } from 'child_process'

import glob from 'glob'
import yargs from 'yargs'


function noLineFeed(strings, ...items) {
  let result = []
  let stringsArray = Array.from(strings)

  while (true) {
    let a = stringsArray.shift()
    result.push(a || '')
    let b = items.shift()
    result.push(b ? b.replace(/\n/g, ' ') : '')

    if (a === undefined && b === undefined) {
      break
    }
  }
  return result.join('')
}


async function main() {
  const argv = yargs
    .help()
    .argv

  const target = argv._.shift()

  if (typeof target !== 'string') return 1;

  const files = await new Promise((resolve, reject) => {
    glob(path.join(path.dirname(target), '*.in'), {}, (err, files) => {
      resolve(files);
    })
  })

  for (const file of files) {
    const subprocess = spawn(target, {stdio: ['pipe', 'pipe', 'inherit']})

    let inData
    try {
      inData = await fs.readFile(file)
    } catch (e) {
      console.error(`Input file \`${file}\` is missing`)
      return 1
    }

    const outFilename = file
      .replace(new RegExp(path.extname(file)+'$'), '') + '.out'

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
        noLineFeed`Expect \`${outDataString}\`, but output is \`${outputResult}\``
      )
      return 1
    }
    console.log(`Test case \`${file}\` success`)

    subprocess.kill()
  }
}

main()
  .then(code => {
    process.exit(code)
  })
