// config-overrides.js
const webpack = require("webpack");
const path = require("path");

module.exports = function override(config) {
  // --- ensure objects exist
  config.resolve = config.resolve || {};
  config.plugins = config.plugins || [];

  // --- polyfill fallbacks (CRA5 removed Node shims)
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    stream: require.resolve("stream-browserify"),
    http: require.resolve("stream-http"),
    https: require.resolve("https-browserify"),
    os: require.resolve("os-browserify/browser"),
    path: require.resolve("path-browserify"),
    zlib: require.resolve("browserify-zlib"),
    buffer: require.resolve("buffer/")
  };

  // --- IMPORTANT: alias to a concrete file (adds the .js extension)
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "process/browser": require.resolve("process/browser.js")
  };

  // (Optional) if other ESM deps do fully-specified imports, this relaxes it:
  // config.resolve.fullySpecified = false;

  // --- inject globals
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"]
    })
  );

  return config;
};
