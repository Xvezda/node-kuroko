/* eslint-env mocha */
const assert = require('assert')
const path = require('path')
const { spawn } = require('child_process')

const rootDir = path.resolve(__dirname, '../')

function spawnKuroko (args, opts = {}) {
  const kuroko = spawn(path.join(rootDir, 'dist/index.js'),
    [...args], {
      argv0: 'kuroko',
      ...opts
    })

  return kuroko
}

describe('kuroko', function () {
  this.timeout(5000)
  this.slow(3000)

  describe('features', function () {
    it('should find test target automatically', function (done) {
      const kuroko = spawnKuroko(['demo/factorial/'])

      let stdout = ''
      kuroko.stdout.on('data', (data) => {
        stdout += data
      })

      let stderr = ''
      kuroko.stderr.on('data', (data) => {
        stderr += data
      })

      kuroko.on('exit', (code) => {
        const explicit = spawnKuroko(['demo/factorial/index.js'])

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

    it('uses current path with emtpy argument', function (done) {
      spawnKuroko([], { cwd: path.join(rootDir, 'demo/smoke/') })
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('runs with only --file option', function (done) {
      spawnKuroko(['--file', 'demo/stdio/in_and_out'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('works with file alias -f', function (done) {
      spawnKuroko(['-f', 'demo/stdio/in_and_out'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('throws error with directory', function (done) {
      spawnKuroko(['--file', 'demo/stdio/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('supports command which is not an executable file', function (done) {
      spawnKuroko(['--path', 'demo/stdio', 'cat'])
        .on('exit', (code) => {
          assert.strictEqual(code, 0)
          done()
        })
    })

    it('should fail on empty directory', function (done) {
      spawnKuroko(['demo/empty/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('should fail when no input files', function (done) {
      spawnKuroko(['demo/notest/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })
  })

  describe('timeout', function () {
    it('should fail immediately with NaN value', function (done) {
      spawnKuroko(['-t', 'foobar', 'demo/timeout/'])
        .on('exit', (code) => {
          assert.strictEqual(code, 1)
          done()
        })
    })

    it('should timeout immediately with value of zero', function (done) {
      spawnKuroko(['-t', 0, 'demo/timeout'])
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

      spawnKuroko(['-t', 1, 'demo/timeout'])
        .on('exit', (code) => {
          assert.ok(flag)
          done()
        })
    })
  })
})
