const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserWebpackPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./src/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    publicPath: "/",
    libraryTarget: "es",
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
      "@xmpp": path.resolve(__dirname, "node_modules/@xmpp"),
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
