module.exports = {
  getAgeRange: jest.fn(() => Promise.resolve({ ageRange: 'unknown', source: 'unavailable' })),
  requestAgeSignalsAccess: jest.fn(() => Promise.resolve('unavailable')),
  isSupported: jest.fn(() => Promise.resolve(false)),
};
