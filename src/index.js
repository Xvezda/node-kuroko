/**
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 *
 * @copyright Xvezda 2020
 * @author Xvezda <xvezda@naver.com>
 */
import path from 'path'
import util from 'util'
import fs, { promises as fsPromises } from 'fs'
import { Readable } from 'stream'
import { spawn } from 'child_process'

import yargs from 'yargs'
import glob from 'tiny-glob'
import { red, green, gray } from 'chalk'

import packageJson from '../package.json'
import { CustomError } from './common'

export const EXIT_SUCCESS = 0
export const EXIT_FAILURE = 1
// TODO: Use different exitcode for tests
export const TEST_SUCCESS = EXIT_SUCCESS
export const TEST_FAILURE = EXIT_FAILURE

export const SEC_IN_MS = 1000

class TimeoutError extends CustomError {}
class TestFailError extends CustomError {}

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

/**
 * Template literal which replaces linefeed to special characters
 * @returns {string}
 */
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

/**
 * Check if file is executable file
 * @param {string} fileName
 * @return {Promise} Promise object represents boolean result
 */
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

/**
 * Convert readable stream into string
 * @param {Readable} readable
 * @return {Promise}
 */
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

/**
 * Get base directory of tests
 * @return {string}
 */
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

/**
 * Return index file patterns to resolve test target implicitly
 */
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
        matches = await glob(path.join(filePath, index))
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

/**
 * Get list of input files by given path
 * @return {Promise}
 */
async function getInputFiles (targetPath) {
  return glob(path.join(targetPath, '*.in'))
}

/**
 * Get output string of process when input file piped into
 * @return {Promise}
 */
async function getOutputByInput (subprocess, input) {
  const inDataStream = Readable.from(input)

  // Check pipe to subprocess success
  await new Promise((resolve, reject) => {
    subprocess.on('error', reject)
    subprocess.stdin.on('pipe', resolve)

    inDataStream.pipe(subprocess.stdin)
  })

  let output = ''
  try {
    output = await new Promise((resolve, reject) => {
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
    // TODO: Responsibility of killing process is up to caller, not here.
    subprocess.kill('SIGKILL')
    throw e
  }
  return output
}

async function runTest (subprocess, testInput, expectedOutput) {
  // Ensure process is running
  if (subprocess.exitCode !== null) {
    throw new Error('Process died before testing')
  }

  let actualOutput
  try {
    actualOutput = await getOutputByInput(subprocess, testInput)
  } catch (e) {
    throw new TimeoutError({
      processName: subprocess.spawnfile
    })
  }
  if (expectedOutput.trim() !== actualOutput.trim()) {
    throw new TestFailError({
      expect: expectedOutput,
      actual: actualOutput
    })
  }
  return TEST_SUCCESS
}

async function getTestFilePath () {
  if (!argv.path) {
    return getFilePath()
  }
  return argv.path
}

/**
 * Get spawnable string
 * @return {Promise}
 */
async function getCommand (testFilePath) {
  const argv0 = argv._[0]
  const isExists = async (fileName) => {
    try {
      await fsPromises.access(fileName)
    } catch (e) {
      return false
    }
    return true
  }

  if (argv._.length > 0 &&
      !argv0.startsWith('.') &&
      !path.isAbsolute(argv0) &&
      !await isExists(argv0)) {
    // Command is not an executable file
    return argv0
  }

  let executable
  if (!argv.file) {
    try {
      executable = await resolveTarget(testFilePath)
    } catch (e) {
      /* Pass */
    } finally {
      executable = executable || argv0
    }
  } else {
    executable = argv.file
  }
  if (!await isExists(executable)) {
    return null
  }
  return !executable.startsWith('.')
    ? path.resolve('./', executable)
    : executable
}

/**
 * Get non argv0 arguments
 */
function getArguments () {
  return argv.file ? argv._ : argv._.slice(1)
}

/**
 * Entry of client
 */
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

    const input = await fsPromises.readFile(inputFile)
    const inputName = path.basename(inputFile)

    let output, outputName
    if (argv.scaffold) {
      const tokens = argv.scaffold.split(' ')
      const scaffoldProcess = spawn(tokens[0], tokens.slice(1), {
        stdio: ['pipe', 'pipe', 'inherit']
      })

      try {
        output = await getOutputByInput(scaffoldProcess, input)
      } catch (e) {
        console.error('Scaffolding process timeout')
        return EXIT_FAILURE
      }

      const exitCode = await new Promise((resolve, reject) => {
        scaffoldProcess.on('close', resolve)
        scaffoldProcess.on('error', reject)

        scaffoldProcess.kill('SIGINT')
      })
      if (exitCode !== 0) {
        console.error('Something went wrong while spawning scaffold process')
        return EXIT_FAILURE
      }
      outputName = `${argv.scaffold} < ${inputName}`
    } else {
      // Output filenames should match to input files
      const outputFile = inputFile
        .replace(new RegExp(path.extname(inputFile) + '$'), '') + '.out'

      try {
        output = await fsPromises.readFile(outputFile)
      } catch (e) {
        console.error(`Error occured while reading test files: ${e}`)
        return EXIT_FAILURE
      }
      outputName = path.basename(outputFile)
    }

    let testResult = TEST_FAILURE
    try {
      await runTest(
        subprocess, input.toString(), output.toString())

      testResult = TEST_SUCCESS
    } catch (e) {
      if (e instanceof TestFailError) {
        console.error(
          red`failed `, gray`-`,
          `Test case \`${inputName}\``,
          red`=>`,
          noLineFeed`Expect \`${e.expect}\`, but output is \`${e.actual}\``
        )
      } else if (e instanceof TimeoutError) {
        console.error(
          red`timeout`, gray`-`,
          `Force killed process \`${e.processName}\``,
          `due to timeout limit of \`${argv.timeout}s\` passed`)
      } else {
        console.error(
          red`error  `, gray`-`,
          noLineFeed`Error occured while testing: ${e.message}`
        )
      }
    }

    if (testResult === TEST_FAILURE) {
      failed = true
    } else {
      console.log(
        green`success`, gray`-`,
        `Test case \`${inputName}\``,
        green`=>`,
        `\`${outputName}\` correct`)
    }
    subprocess.kill('SIGINT')
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
