import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PostHogProvider } from 'posthog-react-native';
import { useCrossfade } from '../hooks/useCrossfade';
import { BackgroundGradient } from '../components/BackgroundGradient/BackgroundGradient';
import { colors } from '../design/tokens';
import { DobModal } from '../screens/ageGate/DobModal';
import { UnderageModal } from '../screens/ageGate/UnderageModal';
import { isAdult, toCalendarDate } from '../services/ageGate/ageRules';
import { ChatScreen } from '../screens/chat/ChatScreen';
import type { ChatLeaveReason } from '../screens/chat/useChatController';
import { FindingNewMatchModal } from '../screens/chat/FindingNewMatchModal';
import { ChatListScreen } from '../screens/chatList/ChatListScreen';
import { DevMenuScreen, type DevMenuEntry } from '../screens/devMenu/DevMenuScreen';
import { EntryScreen } from '../screens/entry/EntryScreen';
import { FeedbackSheet } from '../screens/feedback/FeedbackSheet';
import type { EntryDestination } from '../screens/entry/useEntryController';
import { FindingMatchScreen } from '../screens/findingMatch/FindingMatchScreen';
import { MoodSelectScreen, type Mood } from '../screens/moodSelect/MoodSelectScreen';
import { TopicsScreen, type TopicsSelection } from '../screens/topics/TopicsScreen';
import { VerificationScreen } from '../screens/verification/VerificationScreen';
import { posthog } from '../config/posthog';
import { useAnalyticsCapture } from '../hooks/usePosthogHooks';
import type { ChatSocketService } from '../services/chatSocket/ChatSocketService';
import { createDevNoopChatSocketService } from '../services/chatSocket/devNoopChatSocketService';
import { devNoopReportService } from '../services/report/devNoopReportService';
import {
  claimChatListPrompt,
  claimFirstSkipPrompt,
  markExitPromptShown,
  recordFeedbackSheetClosed,
} from '../services/feedbackPrompt/feedbackPrompts';
import { secureFeedbackPromptStore } from '../services/feedbackPrompt/secureFeedbackPromptStore';
import { secureAgeLockStore } from '../services/ageGate/secureAgeLockStore';
import type { RootStackParamList } from './types';

interface ChatHandoff {
  service: ChatSocketService;
  partner: string;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Longer than the stack's slide-in, so the fallback only fires when there was none.
const PROMPT_TRANSITION_FALLBACK_MS = 700;

/**
 * The refresh token was revoked or expired mid-flow: only Entry's
 * get-started (or the captcha after it) can issue a new session, so
 * restart the stack there with nothing to go back to.
 */
function useResetToEntry() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Entry' }] });
  }, [navigation]);
}

function useOpenFeedbackFromChat() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(() => {
    navigation.navigate('Feedback', { screen: 'ChatScreen' });
  }, [navigation]);
}

// Topics renders in place, so without this Android back pops the whole route.
function useBackFromTopicsToMood(onTopics: boolean, backToMood: () => void) {
  useEffect(() => {
    if (!onTopics) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToMood();
      return true;
    });
    return () => subscription.remove();
  }, [onTopics, backToMood]);
}

/**
 * Leaving a live chat opens the feedback sheet over the ended chat, then
 * lands on ChatList. Stopping the search after the partner left goes
 * straight to ChatList with no form.
 */
function useLeaveChat(clearChat: () => void) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(
    (reason: ChatLeaveReason) => {
      if (reason === 'mid_chat') {
        markExitPromptShown(secureFeedbackPromptStore);
        navigation.navigate('Feedback', { screen: 'ChatScreen', trigger: 'CHAT_EXIT', exitTo: 'ChatList' });
        return;
      }
      clearChat();
      // Returning users already have ChatList underneath; replacing would stack a second one.
      navigation.popTo('ChatList');
    },
    [navigation, clearChat],
  );
}

/** The first time a user skips someone, ask for feedback over the rematch search. */
function useFirstSkipFeedback() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(() => {
    (async () => {
      if (await claimFirstSkipPrompt(secureFeedbackPromptStore)) {
        navigation.navigate('Feedback', { screen: 'ChatScreen', trigger: 'CHAT_EXIT' });
      }
    })();
  }, [navigation]);
}

function useDisableSwipeBackDuringChat(inChat: boolean) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: !inChat });
  }, [navigation, inChat]);
}

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

type OnboardingStep = 'verification' | 'mood_select' | 'topics' | 'finding_match' | 'chat';

function VerificationRoute() {
  const [step, setStep] = useState<OnboardingStep>('verification');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();
  const [chatHandoff, setChatHandoff] = useState<ChatHandoff | null>(null);
  const handleReauthRequired = useResetToEntry();

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

  const handleBackToMood = useCallback(() => {
    // handleSelectMood ignores repeat picks.
    moodSelectedRef.current = false;
    setStep('mood_select');
  }, []);
  useBackFromTopicsToMood(step === 'topics', handleBackToMood);

  const handleFindSomeone = useCallback((topicsSelection: TopicsSelection) => {
    captureAnalytics('topic_selected', { topics: topicsSelection.tags });
    setSelection(topicsSelection);
    setStep('finding_match');
  }, [captureAnalytics]);

  const handleCancelSearch = useCallback(() => {
    setStep('topics');
  }, []);

  const handleMatched = useCallback((service: ChatSocketService, partner: string) => {
    setChatHandoff({ service, partner });
    setStep('chat');
  }, []);

  const clearChat = useCallback(() => setChatHandoff(null), []);
  const handleLeaveChat = useLeaveChat(clearChat);
  const handleSkipped = useFirstSkipFeedback();

  const isFocused = useIsFocused();
  const handleOpenSettings = useOpenFeedbackFromChat();
  useDisableSwipeBackDuringChat(step === 'chat');

  // First-time flow: Mood Select, Topics, Finding Match, and Chat render in
  // place of Verification's own content instead of through real navigation,
  // so every step shares one continuous, cross-fading surface rather than a
  // hard screen-stack cut — a route transition (even a fade) still fully
  // unmounts/remounts both screens, which reads as a jarring mismatch next
  // to Verification's own smooth in-place phase transitions. The
  // returning-user path (ChatList -> Mood Select -> Topics) stays real
  // routes below, since that path IS meant to be normal and back-navigable.
  const { displayValue: displayStep, opacity } = useCrossfade(step);

  return (
    <Animated.View style={[styles.crossfade, { opacity }]}>
      {displayStep === 'chat' && chatHandoff && selection ? (
        <ChatScreen
          chatSocketService={chatHandoff.service}
          partnerSid={chatHandoff.partner}
          selection={selection}
          onLeave={handleLeaveChat}
          onReauthRequired={handleReauthRequired}
          onOpenSettings={handleOpenSettings}
          onSkipped={handleSkipped}
          isFocused={isFocused}
        />
      ) : displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen
          selection={selection}
          onClose={handleCancelSearch}
          onMatched={handleMatched}
          onReauthRequired={handleReauthRequired}
        />
      ) : displayStep === 'topics' && mood ? (
        <TopicsScreen mood={mood} onFindSomeone={handleFindSomeone} onBack={handleBackToMood} />
      ) : displayStep === 'mood_select' ? (
        <MoodSelectScreen showProgress onSelectMood={handleSelectMood} />
      ) : (
        <VerificationScreen onVerified={handleVerified} />
      )}
    </Animated.View>
  );
}

function ChatListRoute({ route }: NativeStackScreenProps<RootStackParamList, 'ChatList'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const promptFeedback = route.params?.promptFeedback ?? false;
  const promptHandledRef = useRef(false);

  useEffect(() => {
    if (!promptFeedback || promptHandledRef.current) {
      return;
    }
    const prompt = () => {
      if (promptHandledRef.current) {
        return;
      }
      promptHandledRef.current = true;
      navigation.setParams({ promptFeedback: undefined });
      (async () => {
        if (await claimChatListPrompt(secureFeedbackPromptStore)) {
          navigation.navigate('Feedback', { screen: 'ChatListScreen', trigger: 'CHAT_LIST_PROMPT' });
        }
      })();
    };
    // Presenting the overlay while ChatList is still sliding in can leave the
    // screen dimmed on Android, so wait for the transition. If ChatList was
    // already showing there is no transition, hence the fallback timer.
    const unsubscribe = navigation.addListener('transitionEnd', event => {
      if (!event.data.closing) {
        prompt();
      }
    });
    const fallback = setTimeout(prompt, PROMPT_TRANSITION_FALLBACK_MS);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigation, promptFeedback]);

  const handleStartChat = useCallback(() => {
    // Returning-user flow: same Mood Select layout, no progress bar.
    navigation.navigate('MoodSelect', { showProgress: false });
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    // Settings doesn't exist yet, so the settings button opens Feedback
    // until it does.
    navigation.navigate('Feedback', { screen: 'ChatListScreen' });
  }, [navigation]);

  return <ChatListScreen onStartChat={handleStartChat} onOpenSettings={handleOpenSettings} />;
}

function FeedbackRoute({ route }: NativeStackScreenProps<RootStackParamList, 'Feedback'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const params = route.params;
  const handleClose = (submitted: boolean) => {
    recordFeedbackSheetClosed(secureFeedbackPromptStore, params?.trigger, submitted);
    if (params?.exitTo === 'ChatList') {
      navigation.reset({ index: 0, routes: [{ name: 'ChatList' }] });
      return;
    }
    navigation.goBack();
  };

  return <FeedbackSheet defaults={params} onClose={handleClose} />;
}

type ReturningStep = 'mood_select' | 'topics' | 'finding_match' | 'chat';

function MoodSelectRoute({ route }: NativeStackScreenProps<RootStackParamList, 'MoodSelect'>) {
  const [step, setStep] = useState<ReturningStep>('mood_select');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();
  const { showProgress } = route.params;
  const [chatHandoff, setChatHandoff] = useState<ChatHandoff | null>(null);
  const handleReauthRequired = useResetToEntry();

  const handleSelectMood = useCallback((selectedMood: Mood) => {
    if (moodSelectedRef.current) {
      return;
    }
    moodSelectedRef.current = true;
    captureAnalytics('mood_selected', { mood: selectedMood, is_first_time: showProgress });
    setMood(selectedMood);
    setStep('topics');
  }, [captureAnalytics, showProgress]);

  const handleBackToMood = useCallback(() => {
    // handleSelectMood ignores repeat picks.
    moodSelectedRef.current = false;
    setStep('mood_select');
  }, []);
  useBackFromTopicsToMood(step === 'topics', handleBackToMood);

  const handleFindSomeone = useCallback((topicsSelection: TopicsSelection) => {
    captureAnalytics('topic_selected', { topics: topicsSelection.tags });
    setSelection(topicsSelection);
    setStep('finding_match');
  }, [captureAnalytics]);

  const handleCancelSearch = useCallback(() => {
    setStep('topics');
  }, []);

  const handleMatched = useCallback((service: ChatSocketService, partner: string) => {
    setChatHandoff({ service, partner });
    setStep('chat');
  }, []);

  const clearChat = useCallback(() => setChatHandoff(null), []);
  const handleLeaveChat = useLeaveChat(clearChat);
  const handleSkipped = useFirstSkipFeedback();

  const isFocused = useIsFocused();
  const handleOpenSettings = useOpenFeedbackFromChat();
  useDisableSwipeBackDuringChat(step === 'chat');

  // Same in-place cross-fade approach as VerificationRoute, for the same
  // reason: Mood Select -> Topics -> Finding Match -> Chat is one
  // continuous step of the returning user's flow, not a real navigable
  // screen boundary in its own right.
  const { displayValue: displayStep, opacity } = useCrossfade(step);

  return (
    <Animated.View style={[styles.crossfade, { opacity }]}>
      {displayStep === 'chat' && chatHandoff && selection ? (
        <ChatScreen
          chatSocketService={chatHandoff.service}
          partnerSid={chatHandoff.partner}
          selection={selection}
          onLeave={handleLeaveChat}
          onReauthRequired={handleReauthRequired}
          onOpenSettings={handleOpenSettings}
          onSkipped={handleSkipped}
          isFocused={isFocused}
        />
      ) : displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen
          selection={selection}
          onClose={handleCancelSearch}
          onMatched={handleMatched}
          onReauthRequired={handleReauthRequired}
        />
      ) : displayStep === 'topics' && mood ? (
        <TopicsScreen mood={mood} onFindSomeone={handleFindSomeone} onBack={handleBackToMood} />
      ) : (
        <MoodSelectScreen showProgress={route.params.showProgress} onSelectMood={handleSelectMood} />
      )}
    </Animated.View>
  );
}

function DevTopicsRoute({ route }: NativeStackScreenProps<RootStackParamList, 'DevTopics'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TopicsScreen
      mood={route.params.mood}
      onFindSomeone={() => navigation.navigate('DevChat', undefined)}
    />
  );
}

function DevFindingMatchRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selectionRef = useRef<TopicsSelection>({ mood: 'good', tags: ['life'], optedIn: true });
  const handleReauthRequired = useResetToEntry();

  return (
    <FindingMatchScreen
      selection={selectionRef.current}
      onClose={() => navigation.goBack()}
      onMatched={(service, partner) =>
        navigation.navigate('DevChat', { service, partner, mood: selectionRef.current.mood, topic: selectionRef.current.tags[0] ?? null })
      }
      onReauthRequired={handleReauthRequired}
    />
  );
}

function DevChatRoute({ route }: NativeStackScreenProps<RootStackParamList, 'DevChat'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const fallbackServiceRef = useRef<ChatSocketService | undefined>(undefined);
  const isFocused = useIsFocused();
  const handleOpenSettings = useOpenFeedbackFromChat();
  if (!fallbackServiceRef.current) {
    fallbackServiceRef.current = createDevNoopChatSocketService();
  }

  const params = route.params;
  const mood = params?.mood ?? 'good';
  const topic = params?.topic ?? 'hobbies';
  const handleReauthRequired = useResetToEntry();

  return (
    <ChatScreen
      chatSocketService={params?.service ?? fallbackServiceRef.current}
      partnerSid={params?.partner ?? 'dev-partner'}
      selection={{ mood, tags: topic ? [topic] : [], optedIn: false }}
      onLeave={() => navigation.navigate('DevMenu')}
      onReauthRequired={handleReauthRequired}
      // A real socket (handed over from the DEV Finding Match route) can report for real.
      reportService={params?.service ? undefined : devNoopReportService}
      onOpenSettings={handleOpenSettings}
      isFocused={isFocused}
    />
  );
}

function DevFindingNewMatchModalRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FindingNewMatchModal
      reason="partner_skipped"
      onStopSearching={() => navigation.goBack()}
      onReport={() => console.log('[DevFindingNewMatchModal] Report tapped.')}
      reportStatus="idle"
    />
  );
}

// The popups' blur captures what's behind them, so wait until the screen has finished appearing.
const SCREEN_APPEAR_FALLBACK_MS = 400;

function useAfterScreenAppears() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd', () => setReady(true));
    const fallback = setTimeout(() => setReady(true), SCREEN_APPEAR_FALLBACK_MS);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigation]);
  return ready;
}

function DevAgeGateRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const ready = useAfterScreenAppears();

  return (
    <View style={devAgeGateStyles.root}>
      <BackgroundGradient />
      {ready ? (
        <DobModal
          onConfirm={dob => {
            console.log('[DevAgeGate] Picked date of birth', dob);
            if (isAdult(dob, toCalendarDate(new Date()))) {
              navigation.goBack();
            } else {
              navigation.replace('DevAgeLock');
            }
          }}
        />
      ) : null}
    </View>
  );
}

const devAgeGateStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.gradientBackground[0],
  },
});

function DevAgeLockRoute() {
  const ready = useAfterScreenAppears();

  return (
    <View style={devAgeGateStyles.root}>
      <BackgroundGradient />
      {ready ? <UnderageModal lockUntil={{ year: 2030, month: 3, day: 12 }} /> : null}
    </View>
  );
}

type FakePhoneAge = 'adult' | 'minor' | 'none';

// Debug Android builds only: makes the next Play age check return this instead of asking Play.
function fakeNextPhoneAge(age: FakePhoneAge) {
  const testing = require('react-native-age-signals/testing');
  testing.clearFake();
  if (age === 'none') {
    testing.setFakeAccessStatus(testing.AgeSignalsStatus.NOT_SHARED);
    return;
  }
  testing.setFakeAccessStatus(testing.AgeSignalsStatus.SHARED);
  testing.setFakeResult(age === 'adult' ? { ageLower: 18 } : { ageLower: 13, ageUpper: 17 });
}

const FAKE_PHONE_AGE_ENTRIES: { age: FakePhoneAge; label: string }[] = [
  { age: 'adult', label: '18+' },
  { age: 'minor', label: 'under 18' },
  { age: 'none', label: 'no answer' },
];

function DevMenuRoute() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const entries: DevMenuEntry[] = [
    {
      label: 'Entry',
      description: 'First screen a fresh install sees.',
      onPress: () => navigation.navigate('Entry'),
    },
    {
      label: 'Verification',
      description: 'Cloudflare Turnstile "prove you\'re human" screen.',
      onPress: () => navigation.navigate('Verification'),
    },
    {
      label: 'Age check — date of birth popup',
      description: '18+ goes back here; under 18 shows the "can\'t use Anonyverse" popup. Nothing is saved.',
      onPress: () => navigation.navigate('DevAgeGate'),
    },
    {
      label: 'Reset age lock',
      description: 'Forget an under-18 date of birth entered on this phone.',
      onPress: () => {
        secureAgeLockStore.clearLock();
      },
    },
    {
      label: 'Mood Select',
      description: 'Returning-user variant (no progress bar).',
      onPress: () => navigation.navigate('MoodSelect', { showProgress: false }),
    },
    {
      label: 'Topics — feeling good',
      description: 'Topic picker, "good" mood variant.',
      onPress: () => navigation.navigate('DevTopics', { mood: 'good' }),
    },
    {
      label: 'Finding Match',
      description: "Connects for real — sends you back to Entry unless you've verified this session.",
      onPress: () => navigation.navigate('DevFindingMatch'),
    },
    {
      label: 'Chat',
      description: 'UI preview only — no real partner, sendMessage is a no-op.',
      onPress: () => navigation.navigate('DevChat', undefined),
    },
    {
      label: 'Finding New Match modal',
      description: 'The skip-mid-chat rematch overlay, shown standalone — "Stop searching" just goes back.',
      onPress: () => navigation.navigate('DevFindingNewMatchModal'),
    },
    {
      label: 'Chat List',
      description: 'Returning-user home screen.',
      onPress: () => navigation.navigate('ChatList'),
    },
    {
      label: 'Feedback',
      description: "In-app feedback form — submitting needs a token, so verify this session first.",
      onPress: () => navigation.navigate('Feedback', { screen: 'DevMenu' }),
    },
    {
      label: 'Reset feedback prompts',
      description: 'Forget when feedback was last shown, dismissed or sent.',
      onPress: () => {
        secureFeedbackPromptStore.reset();
      },
    },
  ];

  if (Platform.OS === 'android') {
    entries.splice(
      entries.findIndex(entry => entry.label === 'Reset age lock') + 1,
      0,
      ...FAKE_PHONE_AGE_ENTRIES.map(({ age, label }) => ({
        label: `Phone age next time: ${label}`,
        description: 'Fakes the next Google Play age check, then go through Verification.',
        onPress: () => fakeNextPhoneAge(age),
      })),
    );
  }

  return <DevMenuScreen entries={entries} onClose={() => navigation.goBack()} />;
}

function DevButton() {
  return (
    <Pressable
      onPress={() => navigationRef.isReady() && navigationRef.navigate('DevMenu')}
      accessibilityRole="button"
      accessibilityLabel="Open dev menu"
      style={devButtonStyles.button}
    >
      <Text style={devButtonStyles.label}>DEV</Text>
    </Pressable>
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
      <Stack.Screen
        name="Feedback"
        component={FeedbackRoute}
        options={{ presentation: 'transparentModal', animation: 'none' }}
      />
      {__DEV__ ? (
        <>
          <Stack.Screen name="DevMenu" component={DevMenuRoute} options={{ animation: 'fade' }} />
          <Stack.Screen name="DevTopics" component={DevTopicsRoute} />
          <Stack.Screen name="DevFindingMatch" component={DevFindingMatchRoute} />
          <Stack.Screen name="DevChat" component={DevChatRoute} />
          <Stack.Screen name="DevFindingNewMatchModal" component={DevFindingNewMatchModalRoute} />
          <Stack.Screen name="DevAgeGate" component={DevAgeGateRoute} options={{ animation: 'fade' }} />
          <Stack.Screen name="DevAgeLock" component={DevAgeLockRoute} options={{ animation: 'fade' }} />
        </>
      ) : null}
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

  return (
    <NavigationContainer ref={navigationRef}>
      {content}
      {__DEV__ ? <DevButton /> : null}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  crossfade: {
    flex: 1,
  },
});

const devButtonStyles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1023',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    fontFamily: 'Nunito-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
});
