/*
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */
/**
 * @copyright Xvezda 2020
 */
import path from 'path'
import util from 'util'
import fs, { promises as fsPromises } from 'fs'
import { Readable } from 'stream'
import { spawn } from 'child_process'

import yargs from 'yargs'
import glob from 'glob'
import { red, green, gray } from 'chalk'

import packageJson from '../package.json'

const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const TEST_SUCCESS = EXIT_SUCCESS
const TEST_FAILURE = EXIT_FAILURE

const SEC_IN_MS = 1000
const MIN_IN_MS = 60*SEC_IN_MS

const argsDefault = {
  timeout: 30,
}

const argv = yargs
  .scriptName(packageJson.name)
  .usage('Usage: $0 [options...] <file>')
  .option('file')
  .describe('file', 'Executable file to test')
  .alias('f', 'file')
  .option('path')
  .describe('path', 'File path to test files')
  .alias('p', 'path')
  .option('timeout')
  .default('timeout', argsDefault.timeout)
  .describe('timeout',
    util.format('Timeout value in seconds (default: %d)', argsDefault.timeout))
  .alias('t', 'timeout')
  .version(packageJson.version)
  .alias('V', 'version')
  .help('h')
  .alias('h', 'help')
  .check((argv, options) => {
    if (Number.isNaN(parseInt(argv.timeout)))
      throw new Error(util.format('Timeout value `%s` is NaN.', argv.timeout))
    return true
  })
  .epilogue(`For more information, check ${packageJson.homepage}`)
  .argv


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


async function getFilePath () {
  const filePath = argv.file || argv._[argv._.length-1]
  try {
    const stat = await fsPromises.stat(filePath)
    if (stat.isDirectory()) {
      return path.resolve(filePath)
    }
  } catch (e) {
    return './'
  }
  return path.resolve(filePath, '../')
}


async function resolveTarget (filePath) {
  if (!filePath.match(/^\.{1,2}\/|^\//)) {
    filePath = './' + filePath
  }
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
        try {
          await fsPromises
            .access(path.resolve(match), fs.constants.X_OK)
          return path.resolve(match)
        } catch (e) {}
      }
    }
    return null
  }
  return filePath
}


async function getInputFiles (targetPath) {
  return new Promise((resolve, reject) => {
    glob(path.join(targetPath, '*.in'), {}, (err, files) => {
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

  try {
    await new Promise((resolve, reject) => {
      subprocess.stdin
        .on('finish', resolve)
        .on('error', reject)
    })
  } catch (e) {
    console.error(`Target process do not accept inputs`)
    return TEST_FAILURE
  }

  const outDataString = outData.toString()

  let outputResult
  try {
    outputResult = await new Promise((resolve, reject) => {
      // Cancel on timeout
      const timer = setTimeout(reject, argv.timeout * SEC_IN_MS)

      let result = ''
      subprocess.stdout
        .on('data', data => {
          result += data.toString()
        })
        .on('end', () => {
          clearTimeout(timer)
          resolve(result)
        })
    })
  } catch (e) {
    subprocess.kill(9)  // SIGKILL
    console.error(
      red`timeout`, gray`-`,
      `Force killed process \`${argv.file || argv._[0]}\``,
      `due to timeout limit of \`${argv.timeout}s\` passed`)
    return TEST_FAILURE
  }
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
  let testFilePath
  if (!argv.path) {
    testFilePath = await getFilePath()

    if (typeof testFilePath !== 'string') return EXIT_FAILURE

  } else {
    testFilePath = argv.path
  }
  const inputFiles = await getInputFiles(testFilePath)
  if (!inputFiles || inputFiles.length <= 0) {
    console.error('Test files does not exists\n' +
      `Try '${packageJson.name} --help' for more information`)
    return EXIT_FAILURE
  }

  let command
  if (!argv.file) {
    try {
      command = await resolveTarget(testFilePath)
    } catch (e) {
      /* Pass */
    } finally {
      if (!command) {
        command = argv._[0]
      }
    }
  } else {
    command = path.resolve(argv.file)
  }

  if (!command) {
    console.error('Test target does not exists\n' +
      `Try '${packageJson.name} --help' for more information`)
    return EXIT_FAILURE
  }

  const args = argv.file ? argv._ : argv._.slice(1)

  let failed = false
  for (const inputFile of inputFiles) {
    const subprocess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit']
    })

    // Output filenames should match to input files
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
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
