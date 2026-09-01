const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

// Waste X shared packages intentionally live outside mobile/. Metro must watch
// them so Mobile consumes the same contracts and framework-free domain rules as
// Desktop and Web rather than copying those files into the app.
config.watchFolders = [path.resolve(repositoryRoot, "packages")];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
