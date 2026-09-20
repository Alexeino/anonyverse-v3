/**
 * Anonyverse
 * @format
 */

import { StatusBar } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar barStyle="dark-content" />
        <RootNavigator />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

export default App;
