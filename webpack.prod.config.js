const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const babelPolyfill = require('babel-polyfill');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = [
  // Front-end
  {
    entry: './src/index.js',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'build/web')
    },
    module: {
      rules: [
        { test: /\.js$/, use: 'babel-loader' },
        {
          test: /\.scss$/, use: [
            {
              loader: "style-loader" // creates style nodes from JS strings
            },
            {
              loader: "css-loader" // translates CSS into CommonJS
            },
            {
              loader: "sass-loader" // compiles Sass to CSS
            },
            {
              loader: 'sass-resources-loader',
              options: {
                // Provide path to the file with resources
                resources: './src/global.scss',
              },
            }]
        },
        {
          test: /\.css$/, use: [{
            loader: "style-loader" // creates style nodes from JS strings
          }, {
            loader: "css-loader" // translates CSS into CommonJS
          }]
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src/template.html")
      }),
      new webpack.optimize.UglifyJsPlugin()
    ]
  },

  // API
  // {
  //   target: 'node',
  //   externals: [nodeExternals()],
  //   entry: ['babel-polyfill', './api/index.js'],
  //   output: {
  //     filename: 'api.js',
  //     path: path.resolve(__dirname, 'build')
  //   },
  //   module: {
  //     rules: [
  //       { test: /\.js$/, use: 'babel-loader' } // exclude: /(_project_config|_project_credential)\.js$/
  //     ]
  //   }
  // }
];