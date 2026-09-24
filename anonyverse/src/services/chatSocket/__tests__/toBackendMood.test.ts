import { toBackendMood } from '../socketIoChatSocketService';

describe('toBackendMood', () => {
  it('maps the app\'s "low" mood to the backend\'s "fl"', () => {
    expect(toBackendMood('low')).toBe('fl');
  });

  it('passes "good" through unchanged', () => {
    expect(toBackendMood('good')).toBe('good');
  });
});
