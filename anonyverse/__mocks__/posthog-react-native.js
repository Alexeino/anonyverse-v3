const mockPostHogClient = {
  capture: jest.fn(),
  identify: jest.fn(),
  getDistinctId: jest.fn(() => 'mock-distinct-id'),
  reset: jest.fn(),
};

class MockPostHog {
  constructor() {
    return mockPostHogClient;
  }
}

function PostHogProvider({ children }) {
  return children;
}

module.exports = {
  __esModule: true,
  default: MockPostHog,
  PostHogProvider,
  usePostHog: jest.fn(() => mockPostHogClient),
};
