import React, { useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { EntryScreen } from '../screens/entry/EntryScreen';
import type { EntryDestination } from '../screens/entry/useEntryController';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const handleEntryContinue = useCallback((destination: EntryDestination) => {
    // Verification (first-time) and Chat List (returning) are not built
    // yet — see docs/flow.md §2-4. EntryScreen is deliberately decoupled
    // from React Navigation (it only calls this prop), so wiring the real
    // navigation.replace(...) calls here is a one-line change once those
    // screens exist.
    if (__DEV__) {
      console.warn(
        `[Entry] resolved destination "${destination}" — screen not implemented yet.`,
      );
    }
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Entry">
          {() => <EntryScreen onContinue={handleEntryContinue} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
