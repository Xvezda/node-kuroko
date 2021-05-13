/**
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 *
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

export const EXIT_SUCCESS = 0
export const EXIT_FAILURE = 1
// TODO: Use different exitcode for tests
export const TEST_SUCCESS = EXIT_SUCCESS
export const TEST_FAILURE = EXIT_FAILURE

export const SEC_IN_MS = 1000

const argsDefault = {
  timeout: 30
}

const argv = yargs
  .scriptName(packageJson.name)
  .usage('Usage: $0 [options...] [command [arguments...]]')
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
  .option('scaffold')
  .alias('s', 'scaffold')
  .describe('scaffold', 'Command or executable file to compare with')
  .version(packageJson.version)
  .alias('V', 'version')
  .help('h')
  .alias('h', 'help')
  .check((argv, options) => {
    if (Number.isNaN(parseInt(argv.timeout))) {
      throw new Error(util.format('Timeout value `%s` is NaN.', argv.timeout))
    }
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

async function isExecutable (fileName) {
  const filePath = path.resolve(fileName)
  let stats
  try {
    stats = await fsPromises.stat(filePath)
  } catch (e) {
    return false
  }
  if (!stats.isFile()) {
    return false
  }

  try {
    await fsPromises.access(filePath, fs.constants.X_OK)
  } catch (e) {
    return false
  }
  return true
}

const globPromise = util.promisify(glob)

function readablePromise (readable) {
  return new Promise((resolve, reject) => {
    let data = ''
    readable.on('data', (d) => {
      data += d.toString()
    })
    readable.on('end', () => {
      resolve(data)
    })
    readable.on('error', (err) => {
      reject(err)
    })
  })
}

async function getFilePath () {
  const filePath = argv.file || argv.path || argv._[argv._.length - 1]
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

function getIndexFiles () {
  // TODO: Get index pattern from option argument
  return ['index.js', 'index[._-]*', 'index', 'main[._-]*', 'main']
}

async function resolveTarget (filePath) {
  if (!filePath.match(/^\.{1,2}\/|^\//)) {
    filePath = './' + filePath
  }
  const targetStat = await fsPromises.stat(filePath)

  const indexes = getIndexFiles()
  if (targetStat.isDirectory()) {
    for (const index of indexes) {
      let matches
      try {
        matches = await globPromise(path.join(filePath, index))
      } catch (e) {
        console.error(e)
        continue
      }
      for (const match of matches) {
        if (await isExecutable(match)) {
          return path.resolve(match)
        }
      }
    }
    return null
  }
  return filePath
}

async function getInputFiles (targetPath) {
  return globPromise(path.join(targetPath, '*.in'))
}

async function runTest (subprocess, inputFile, outputFile) {
  const ioPromises = []
  ioPromises.push(fsPromises.readFile(inputFile))
  ioPromises.push(fsPromises.readFile(outputFile))

  let inData, outData;
  try {
    [inData, outData] = await Promise.all(ioPromises)
  } catch (e) {
    console.error(`Error occured while reading test files: ${e}`)
    return TEST_FAILURE
  }

  const inDataString = inData.toString()
  const inDataStream = Readable.from(inDataString)
  inDataStream.pipe(subprocess.stdin)

  const expectedOutput = outData.toString()

  let actualOutput
  try {
    actualOutput = await new Promise((resolve, reject) => {
      // Cancel on timeout
      const timer = setTimeout(reject, argv.timeout * SEC_IN_MS)

      readablePromise(subprocess.stdout)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          clearTimeout(timer)
        })
    })
  } catch (e) {
    subprocess.kill(9) // SIGKILL
    console.error(
      red`timeout`, gray`-`,
      `Force killed process \`${subprocess.spawnfile}\``,
      `due to timeout limit of \`${argv.timeout}s\` passed`)
    return TEST_FAILURE
  }
  if (expectedOutput.trim() !== actualOutput.trim()) {
    console.error(
      red`failed `, gray`-`,
      noLineFeed`Expect \`${expectedOutput}\`, but output is \`${actualOutput}\``
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

async function getTestFilePath () {
  if (!argv.path) {
    return getFilePath()
  }
  return argv.path
}

async function getCommand (testFilePath) {
  if (argv._.length > 0) {
    try {
      await fsPromises.access(argv._[0])
    } catch (e) {
      return argv._[0]
    }
  }

  if (!argv.file) {
    try {
      return await resolveTarget(testFilePath)
    } catch (e) {}
  }
  return argv.file
}

function getArguments () {
  return argv.file ? argv._ : argv._.slice(1)
}

async function main () {
  const testFilePath = await getTestFilePath()

  const inputFiles = await getInputFiles(testFilePath)
  if (!inputFiles || inputFiles.length <= 0) {
    console.error('Test files does not exists\n' +
      `Try '${packageJson.name} --help' for more information`)
    return EXIT_FAILURE
  }

  const command = await getCommand(testFilePath)
  if (!command) {
    console.error('Test target does not exists\n' +
      `Try '${packageJson.name} --help' for more information`)
    return EXIT_FAILURE
  }

  const args = getArguments()

  let failed = false
  for (const inputFile of inputFiles) {
    const subprocess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit']
    })

    // TODO: How to handle spawn error gracefully?
    subprocess.on('error', () => {})

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
