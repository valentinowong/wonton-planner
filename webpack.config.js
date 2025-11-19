const path = require("path");
const createExpoWebpackConfigAsync = require("@expo/webpack-config");

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  config.module.rules.push({
    test: /wa-sqlite\.wasm$/,
    type: "asset/resource",
    generator: {
      filename: "static/js/[hash][ext][query]",
    },
  });

  config.resolve.extensions = config.resolve.extensions || [];
  if (!config.resolve.extensions.includes(".wasm")) {
    config.resolve.extensions.push(".wasm");
  }

  config.experiments = {
    ...config.experiments,
    asyncWebAssembly: true,
    syncWebAssembly: true,
  };

  config.output.publicPath = config.output.publicPath || "/";

  config.plugins = config.plugins || [];

  config.plugins.push({
    apply(compiler) {
      compiler.hooks.thisCompilation.tap("CopyExpoSQLiteWasm", (compilation) => {
        compilation.hooks.processAssets.tapPromise({
          name: "CopyExpoSQLiteWasm",
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        }, async () => {
          const fs = compiler.inputFileSystem;
          const wasmPath = path.resolve(__dirname, "node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm");
          try {
            const content = await fs.promises.readFile(wasmPath);
            const filename = "static/js/wa-sqlite.wasm";
            compilation.emitAsset(filename, new compiler.webpack.sources.RawSource(content));
          } catch (err) {
            console.warn("Failed to copy expo-sqlite wasm", err);
          }
        });
      });
    },
  });

  return config;
};
