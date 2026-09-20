module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation)/)',
  ],
  // posthog-react-native's manual mock (__mocks__/posthog-react-native.js) is a
  // module-level singleton client shared across every test — without this,
  // call counts on its jest.fn()s would leak between tests.
  clearMocks: true,
};
