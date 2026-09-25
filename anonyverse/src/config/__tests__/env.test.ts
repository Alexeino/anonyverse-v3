import { isApiBaseUrlSecure } from '../env';

describe('isApiBaseUrlSecure', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows https:// in any build', () => {
    expect(isApiBaseUrlSecure('https://api.example.com', false)).toBe(true);
    expect(isApiBaseUrlSecure('https://api.example.com', true)).toBe(true);
  });

  it('refuses http:// in production', () => {
    expect(isApiBaseUrlSecure('http://api.example.com', false)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('allows http:// to a local host in development, with a warning', () => {
    expect(isApiBaseUrlSecure('http://localhost:8000', true)).toBe(true);
    expect(isApiBaseUrlSecure('http://127.0.0.1:8000', true)).toBe(true);
    expect(isApiBaseUrlSecure('http://10.0.2.2:8000', true)).toBe(true);
    expect(isApiBaseUrlSecure('http://192.168.1.20:8000/api', true)).toBe(true);
    expect(isApiBaseUrlSecure('http://172.20.0.5', true)).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });

  it('refuses http:// to a non-local host even in development', () => {
    expect(isApiBaseUrlSecure('http://staging.example.com', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://localhost.example.com', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://172.32.0.1', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://8.8.8.8', true)).toBe(false);
    // Userinfo tricks: fetch would connect to evil.com.
    expect(isApiBaseUrlSecure('http://localhost:@evil.com/api', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://10.0.2.2:x@evil.com:8080', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://localhost@evil.com', true)).toBe(false);
    expect(isApiBaseUrlSecure('http://localhost\\@evil.com', true)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('refuses a missing base URL in production', () => {
    expect(isApiBaseUrlSecure('', false)).toBe(false);
  });
});
