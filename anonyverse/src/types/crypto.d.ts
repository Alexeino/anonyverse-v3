/**
 * Minimal ambient type for the global `crypto` object polyfilled by
 * react-native-get-random-values (imported once in index.js). The
 * project's tsconfig has no "dom" lib, so `Crypto`/`crypto` aren't
 * otherwise declared — only the subset actually used is typed here.
 */
declare global {
  interface Crypto {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  }

  var crypto: Crypto;
}

export {};
