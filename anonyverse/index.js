/**
 * @format
 */

// Must be imported before anything that relies on crypto.getRandomValues
// (see src/services/turnstile/nonce.ts).
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
