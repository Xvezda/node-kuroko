/*
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */
/**
 * @copyright Xvezda 2020
 */

import path from 'path'
import fs, { promises as fsPromises } from 'fs'
import { Readable } from 'stream'
import { spawn } from 'child_process'

import glob from 'glob'
import yargs from 'yargs'
import { red, green, gray } from 'chalk'

const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const TEST_SUCCESS = EXIT_SUCCESS
const TEST_FAILURE = EXIT_FAILURE

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

function getFilePath () {
  const argv = yargs
    .help()
    .argv

  return argv._.shift()
}

async function resolveTarget (filePath) {
  const targetStat = await fsPromises.stat(filePath)

  const indexes = ['index.js', 'index[._-]*', 'index', 'main[._-]*', 'main']
  if (targetStat.isDirectory()) {
    for (const index of indexes) {
      let matches
      try {
        matches = await new Promise((resolve, reject) => {
          glob(path.join(filePath, index), {}, (err, files) => {
            if (err) {
              return reject(err)
            }
            resolve(files)
          })
        })
      } catch (e) {
        console.error(e)
        continue
      }
      for (const match of matches) {
        console.log('match:', match)
        try {
          await fsPromises
            .access(path.resolve(match), fs.constants.X_OK)
          return path.resolve(match)
        } catch (e) {}
      }
    }
  }
  return filePath
}

async function getInputFiles (targetPath) {
  return new Promise((resolve, reject) => {
    glob(path.join(path.dirname(targetPath), '*.in'), {}, (err, files) => {
      if (err) {
        return reject(err)
      }
      resolve(files)
    })
  })
}

async function runTest (subprocess, inputFile, outputFile) {
  let inData
  try {
    inData = await fsPromises.readFile(inputFile)
  } catch (e) {
    console.error(`Input file \`${inputFile}\` is missing`)
    return TEST_FAILURE
  }

  let outData
  try {
    outData = await fsPromises.readFile(outputFile)
  } catch (e) {
    console.error(`Expect output file \`${outputFile}\` not exists`)
    return TEST_FAILURE
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
      red`failed `, gray`-`,
      noLineFeed`Expect \`${outDataString}\`, but output is \`${outputResult}\``
    )
    return TEST_FAILURE
  }
  console.log(
    green`success`, gray`-`,
    `Test case \`${path.basename(inputFile)}\``,
    green`=>`,
    `\`${path.basename(outputFile)}\` correct`)

  return TEST_SUCCESS
}

async function main () {
  let targetPath = getFilePath()

  if (typeof targetPath !== 'string') return EXIT_FAILURE

  targetPath = await resolveTarget(targetPath)

  const inputFiles = await getInputFiles(targetPath)

  let failed = false
  for (const inputFile of inputFiles) {
    const subprocess = spawn(targetPath, { stdio: ['pipe', 'pipe', 'inherit'] })

    const outputFile = inputFile
      .replace(new RegExp(path.extname(inputFile) + '$'), '') + '.out'

    const testResult = await runTest(subprocess, inputFile, outputFile)
    if (testResult === TEST_FAILURE) {
      failed = true
    }
    subprocess.kill()
  }
  if (failed) {
    return EXIT_FAILURE
  }
  return EXIT_SUCCESS
}

main()
  .then(code => {
    process.exit(code)
  })
