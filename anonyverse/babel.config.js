module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: true,
      },
    ],
    // Must stay last — required by react-native-reanimated (via
    // react-native-keyboard-controller's KeyboardStickyView).
    'react-native-worklets/plugin',
  ],
};
