const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserWebpackPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.[contenthash].js",
    publicPath: "/",
    libraryTarget: "umd",
    umdNamedDefine: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: {
      "@reduxjs/toolkit": path.resolve(
        __dirname,
        "node_modules/@reduxjs/toolkit"
      ),
      "@types/react": path.resolve(__dirname, "node_modules/@types/react"),
      "@types/react-dom": path.resolve(
        __dirname,
        "node_modules/@types/react-dom"
      ),
      "@types/styled-components": path.resolve(
        __dirname,
        "node_modules/@types/styled-components"
      ),
      "@xmpp/client": path.resolve(__dirname, "node_modules/@xmpp/client"),
      axios: path.resolve(__dirname, "node_modules/axios"),
      ltx: path.resolve(__dirname, "node_modules/ltx"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react-redux": path.resolve(__dirname, "node_modules/react-redux"),
      "react-scripts": path.resolve(__dirname, "node_modules/react-scripts"),
      redux: path.resolve(__dirname, "node_modules/redux"),
      "redux-saga": path.resolve(__dirname, "node_modules/redux-saga"),
      "styled-components": path.resolve(
        __dirname,
        "node_modules/styled-components"
      ),
      uuid: path.resolve(__dirname, "node_modules/uuid"),
      "@babel/core": path.resolve(__dirname, "node_modules/@babel/core"),
      "@babel/preset-env": path.resolve(
        __dirname,
        "node_modules/@babel/preset-env"
      ),
      "@babel/preset-react": path.resolve(
        __dirname,
        "node_modules/@babel/preset-react"
      ),
      "@babel/preset-typescript": path.resolve(
        __dirname,
        "node_modules/@babel/preset-typescript"
      ),
      "@types/lodash": path.resolve(__dirname, "node_modules/@types/lodash"),
      "@types/react-modal": path.resolve(
        __dirname,
        "node_modules/@types/react-modal"
      ),
      "@types/uuid": path.resolve(__dirname, "node_modules/@types/uuid"),
      "@types/xmpp__client": path.resolve(
        __dirname,
        "node_modules/@types/xmpp__client"
      ),
      "babel-loader": path.resolve(__dirname, "node_modules/babel-loader"),
      "clean-webpack-plugin": path.resolve(
        __dirname,
        "node_modules/clean-webpack-plugin"
      ),
      "css-loader": path.resolve(__dirname, "node_modules/css-loader"),
      "css-minimizer-webpack-plugin": path.resolve(
        __dirname,
        "node_modules/css-minimizer-webpack-plugin"
      ),
      "file-loader": path.resolve(__dirname, "node_modules/file-loader"),
      "html-webpack-plugin": path.resolve(
        __dirname,
        "node_modules/html-webpack-plugin"
      ),
      "mini-css-extract-plugin": path.resolve(
        __dirname,
        "node_modules/mini-css-extract-plugin"
      ),
      "terser-webpack-plugin": path.resolve(
        __dirname,
        "node_modules/terser-webpack-plugin"
      ),
      "ts-loader": path.resolve(__dirname, "node_modules/ts-loader"),
      typescript: path.resolve(__dirname, "node_modules/typescript"),
      webpack: path.resolve(__dirname, "node_modules/webpack"),
      "webpack-cli": path.resolve(__dirname, "node_modules/webpack-cli"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: "babel-loader",
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[name].[contenthash].[ext]",
              outputPath: "assets/images",
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: "./public/index.html",
      filename: "index.html",
    }),
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash].css",
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserWebpackPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: "all",
    },
  },
  devtool: "source-map",
};
