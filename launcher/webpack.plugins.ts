// webpack.plugins.ts
import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import * as webpack from 'webpack';

const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const plugins = [
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
  new webpack.IgnorePlugin({
    resourceRegExp: /^@aws-sdk\/client-s3$/,
  }),
  // The CopyWebpackPlugin has been REMOVED from here
];