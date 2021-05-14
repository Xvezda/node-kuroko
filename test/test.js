/* eslint-env mocha */
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const rootDir = path.resolve(__dirname, '../')
const binary = path.join(rootDir, 'dist/index.js')

function spawnKuroko (args, opts = {}) {
  const kuroko = spawn(binary,
    [...args], {
      argv0: 'kuroko',
      cwd: rootDir,
      env: Object.assign({}, process.env),
      stdio: 'inherit',
      shell: true,
      ...opts
    })

  return kuroko
}

before(function (done) {
  fs.access(binary, fs.constants.F_OK, (err) => {
    if (err) {
      this.skip()
    }
    done()
  })
})

/* TODO: We need tests for non-cli use of kuroko such as: `require('kuroko')` */
describe('kuroko', function () {
  this.timeout(5000)
  this.slow(3000)

  describe('client', function () {
    it('should find test target automatically', function (done) {
      const kuroko = spawnKuroko(['test/assets/factorial/'], { stdio: 'pipe' })

      let stdout = ''
      kuroko.stdout.on('data', (data) => {
        stdout += data
      })

      let stderr = ''
      kuroko.stderr.on('data', (data) => {
        stderr += data
      })

      kuroko.on('exit', (code) => {
        const explicit = spawnKuroko(['test/assets/factorial/index.js'],
          { stdio: 'pipe' })

        let stdout2 = ''
        explicit.stdout.on('data', (data) => {
          stdout2 += data
        })

        let stderr2 = ''
        explicit.stderr.on('data', (data) => {
          stderr2 += data
        })

        explicit.on('exit', (code2) => {
          assert.strictEqual(stdout, stdout2)
          assert.strictEqual(stderr, stderr2)
          assert.strictEqual(code, code2)

          done()
        })
      })
    })

    it('should exit with error when given command is invalid', function (done) {
      spawnKuroko(['non_existing_something'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('uses current path with emtpy argument', function (done) {
      spawnKuroko([], { cwd: path.join(rootDir, 'test/assets/smoke/') })
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('should always fail with wrong output', function (done) {
      spawnKuroko(['--path', 'test/assets/smoke/', 'echo', 'fail'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('runs with only --file option', function (done) {
      spawnKuroko(['--file', 'test/assets/stdio/in_and_out'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('works with file alias -f', function (done) {
      spawnKuroko(['-f', 'test/assets/stdio/in_and_out'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('throws error with directory', function (done) {
      spawnKuroko(['--file', 'test/assets/stdio/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('supports command which is not an executable file', function (done) {
      spawnKuroko(['--path', 'test/assets/stdio', 'cat'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('should fail on empty directory', function (done) {
      spawnKuroko(['test/assets/empty/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('should fail when no input files', function (done) {
      spawnKuroko(['test/assets/notest/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    describe('timeout', function () {
      it('should fail immediately with NaN value', function (done) {
        spawnKuroko(['-t', 'foobar', 'test/assets/timeout/'])
          .on('exit', (code) => {
            assert.strictEqual(code, 1)
            done()
          })
      })

      it('should timeout immediately with value of zero', function (done) {
        spawnKuroko(['-t', 0, 'test/assets/timeout'])
          .on('close', (code) => {
            assert.strictEqual(code, 1)
            done()
          })
      })

      it('should timeout after which amount of seconds provided', function (done) {
        let flag = false
        setTimeout(function () {
          flag = true
        }, 1000)

        spawnKuroko(['-t', 1, 'test/assets/timeout'])
          .on('exit', (code) => {
            assert.ok(flag)
            done()
          })
      })
    })

    describe('scaffolding', function (done) {
      it('should success with binary which satisfies requirements', function (done) {
        spawnKuroko(['--scaffold', './echo.py', 'in_and_out'], {
          cwd: path.join(rootDir, 'test/assets/stdio/')
        })
          .on('exit', (code) => {
            assert.strictEqual(code, 0)
            done()
          })
      })

      it('should accept alias style argument', function (done) {
        spawnKuroko(['-s', './echo.py', 'in_and_out'], {
          cwd: path.join(rootDir, 'test/assets/stdio/')
        })
          .on('exit', (code) => {
            assert.strictEqual(code, 0)
            done()
          })
      })

      it('should work with quoted command', function (done) {
        spawnKuroko(['--scaffold', '"python echo.py"', 'in_and_out'], {
          cwd: path.join(rootDir, 'test/assets/stdio/')
        })
          .on('exit', (code) => {
            assert.strictEqual(code, 0)
            done()
          })
      })

      it('should work with end of options indicator', function (done) {
        spawnKuroko(['-p', 'test/assets/scaffold', '-s', 'bc',
          '--', 'python', '-c', '"print(eval(str(input())))"'])
          .on('exit', (code) => {
            assert.strictEqual(code, 0)
            done()
          })
      })
    })
  })
})
