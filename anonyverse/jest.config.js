module.exports = {
  preset: '@react-native/jest-preset',
  resolver: 'react-native-reanimated/jest/resolver',
  moduleNameMapper: {
    '^react-native-keyboard-controller$': 'react-native-keyboard-controller/jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-keyboard-controller|react-native-reanimated|react-native-worklets)/)',
  ],
};
