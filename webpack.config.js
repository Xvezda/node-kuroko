const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const config = {
  mode: process.env.NODE_ENV || 'development',
  target: 'node',
  stats: {
    // Ignore warnings due to yarg's dynamic module loading
    warningsFilter: [/node_modules\/yargs/]
  },
  entry: {
    index: './src/index.js'
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader'
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  plugins: [
    new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true }),
    {
      apply: function (compiler) {
        compiler.hooks.afterEmit.tap(
          'MyChmodPlugin',
          function (compilation) {
            const envName = [
              'npm_package_bin',
              process.env.npm_package_name
            ].join('_')
            const binVar = process.env[envName]
            if (!binVar) return

            const binPath = path.resolve(__dirname, binVar)
            fs.chmod(binPath, 0o755, function (err) {
              if (err) throw err
            })
          }
        )
      }
    }
  ]
}

if (process.env.NODE_ENV === 'production') {
  /** Production configurations */
  config.optimization = {
    minimize: true
  }
}

if (process.env.NODE_ENV === 'development') {
  /** Development configurations */
}

module.exports = config
