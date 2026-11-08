const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Opt-in screenshot server only; normal index/Release and production DI remain untouched.
const config = process.env.SMARTREMOTE_SCREENSHOTS === '1' ? {
  resolver: { useWatchman: false },
  server: { rewriteRequestUrl: url => url.replace('/index.bundle', '/index.screenshots.bundle') },
} : {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
