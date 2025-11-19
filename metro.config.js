const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

config.server = config.server || {};
const previousEnhancer = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware) => {
  const enhanced = previousEnhancer ? previousEnhancer(middleware) : middleware;
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    enhanced(req, res, next);
  };
};

module.exports = config;
