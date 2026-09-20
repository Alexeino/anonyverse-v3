module.exports = {
  preset: '@react-native/jest-preset',
  resolver: 'react-native-reanimated/jest/resolver',
  moduleNameMapper: {
    '^react-native-keyboard-controller$': 'react-native-keyboard-controller/jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-keyboard-controller|react-native-reanimated|react-native-worklets)/)',
  ],
  // posthog-react-native's manual mock (__mocks__/posthog-react-native.js) is a
  // module-level singleton client shared across every test — without this,
  // call counts on its jest.fn()s would leak between tests.
  clearMocks: true,
};
