import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PostHogProvider } from 'posthog-react-native';
import { useCrossfade } from '../hooks/useCrossfade';
import { ChatListScreen } from '../screens/chatList/ChatListScreen';
import { EntryScreen } from '../screens/entry/EntryScreen';
import type { EntryDestination } from '../screens/entry/useEntryController';
import { FindingMatchScreen } from '../screens/findingMatch/FindingMatchScreen';
import { MoodSelectScreen, type Mood } from '../screens/moodSelect/MoodSelectScreen';
import { TopicsScreen, type TopicsSelection } from '../screens/topics/TopicsScreen';
import { VerificationScreen } from '../screens/verification/VerificationScreen';
import { posthog } from '../config/posthog';
import { useAnalyticsCapture } from '../hooks/usePosthogHooks';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function EntryRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleEntryContinue = useCallback(
    (destination: EntryDestination) => {
      // Both a fresh device sent to Verification and an already-verified
      // device sent straight to ChatList replace Entry — neither should
      // stay reachable via back navigation.
      navigation.replace(destination === 'verification' ? 'Verification' : 'ChatList');
    },
    [navigation],
  );

  return <EntryScreen onContinue={handleEntryContinue} />;
}

type OnboardingStep = 'verification' | 'mood_select' | 'topics' | 'finding_match';

function VerificationRoute() {
  const [step, setStep] = useState<OnboardingStep>('verification');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();

  const handleVerified = useCallback(() => {
    setStep('mood_select');
  }, []);

  const handleSelectMood = useCallback((selectedMood: Mood) => {
    if (moodSelectedRef.current) {
      return;
    }
    moodSelectedRef.current = true;
    captureAnalytics('mood_selected', { mood: selectedMood, is_first_time: true });
    setMood(selectedMood);
    setStep('topics');
  }, [captureAnalytics]);

  const handleFindSomeone = useCallback((topicsSelection: TopicsSelection) => {
    captureAnalytics('topic_selected', { topics: topicsSelection.tags });
    setSelection(topicsSelection);
    setStep('finding_match');
  }, [captureAnalytics]);

  const handleCancelSearch = useCallback(() => {
    setStep('topics');
  }, []);

  // First-time flow: Mood Select, Topics, and Finding Match render in place
  // of Verification's own content instead of through real navigation, so
  // every step shares one continuous, cross-fading surface rather than a
  // hard screen-stack cut — a route transition (even a fade) still fully
  // unmounts/remounts both screens, which reads as a jarring mismatch next
  // to Verification's own smooth in-place phase transitions. The
  // returning-user path (ChatList -> Mood Select -> Topics) stays real
  // routes below, since that path IS meant to be normal and back-navigable.
  const { displayValue: displayStep, opacity } = useCrossfade(step);

  return (
    <Animated.View style={[styles.crossfade, { opacity }]}>
      {displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen selection={selection} onClose={handleCancelSearch} />
      ) : displayStep === 'topics' && mood ? (
        <TopicsScreen mood={mood} onFindSomeone={handleFindSomeone} />
      ) : displayStep === 'mood_select' ? (
        <MoodSelectScreen showProgress onSelectMood={handleSelectMood} />
      ) : (
        <VerificationScreen onVerified={handleVerified} />
      )}
    </Animated.View>
  );
}

function ChatListRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleStartChat = useCallback(() => {
    // Returning-user flow: same Mood Select layout, no progress bar.
    navigation.navigate('MoodSelect', { showProgress: false });
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    // Settings doesn't exist yet.
    console.log('[ChatList] Settings tapped — screen not implemented yet.');
  }, []);

  return <ChatListScreen onStartChat={handleStartChat} onOpenSettings={handleOpenSettings} />;
}

type ReturningStep = 'mood_select' | 'topics' | 'finding_match';

function MoodSelectRoute({ route }: NativeStackScreenProps<RootStackParamList, 'MoodSelect'>) {
  const [step, setStep] = useState<ReturningStep>('mood_select');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();
  const { showProgress } = route.params;

  const handleSelectMood = useCallback((selectedMood: Mood) => {
    if (moodSelectedRef.current) {
      return;
    }
    moodSelectedRef.current = true;
    captureAnalytics('mood_selected', { mood: selectedMood, is_first_time: showProgress });
    setMood(selectedMood);
    setStep('topics');
  }, [captureAnalytics, showProgress]);

  const handleFindSomeone = useCallback((topicsSelection: TopicsSelection) => {
    captureAnalytics('topic_selected', { topics: topicsSelection.tags });
    setSelection(topicsSelection);
    setStep('finding_match');
  }, [captureAnalytics]);

  const handleCancelSearch = useCallback(() => {
    setStep('topics');
  }, []);

  // Same in-place cross-fade approach as VerificationRoute, for the same
  // reason: Mood Select -> Topics -> Finding Match is one continuous step
  // of the returning user's flow, not a real navigable screen boundary in
  // its own right.
  const { displayValue: displayStep, opacity } = useCrossfade(step);

  return (
    <Animated.View style={[styles.crossfade, { opacity }]}>
      {displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen selection={selection} onClose={handleCancelSearch} />
      ) : displayStep === 'topics' && mood ? (
        <TopicsScreen mood={mood} onFindSomeone={handleFindSomeone} />
      ) : (
        <MoodSelectScreen showProgress={route.params.showProgress} onSelectMood={handleSelectMood} />
      )}
    </Animated.View>
  );
}

export function RootNavigator() {
  const navigator = (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Entry" component={EntryRoute} />
      {/*
        animationTypeForReplace defaults to 'pop' — the incoming screen
        would animate in as if going *backward*, which reads as broken
        when it's actually the next step in a forward flow (Entry ->
        Verification/ChatList both use navigation.replace()). Every
        screen reached that way needs 'push' explicitly so replace looks
        like forward progress.
      */}
      <Stack.Screen
        name="Verification"
        component={VerificationRoute}
        options={{ animationTypeForReplace: 'push' }}
      />
      <Stack.Screen
        name="ChatList"
        component={ChatListRoute}
        options={{ animationTypeForReplace: 'push' }}
      />
      {/*
        Only reached via navigate() now, from ChatList's "Start a chat"
        (the returning-user path) — the first-time path renders
        MoodSelectScreen inside VerificationRoute directly, see there.
        Fade instead of the default slide for a softer push.
      */}
      <Stack.Screen
        name="MoodSelect"
        component={MoodSelectRoute}
        options={{ animation: 'fade' }}
      />
    </Stack.Navigator>
  );

  // posthog is resolved once at module load (see config/posthog.ts), so
  // whether this tree is wrapped in PostHogProvider never changes across
  // the app's lifetime — it's not a conditional root that would trigger a
  // remount at runtime.
  const content = posthog ? (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: false }}
    >
      {navigator}
    </PostHogProvider>
  ) : (
    navigator
  );

  return <NavigationContainer>{content}</NavigationContainer>;
}

const styles = StyleSheet.create({
  crossfade: {
    flex: 1,
  },
});
