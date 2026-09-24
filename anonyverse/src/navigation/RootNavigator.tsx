import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { createNavigationContainerRef, NavigationContainer, useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PostHogProvider } from 'posthog-react-native';
import { useCrossfade } from '../hooks/useCrossfade';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { FindingNewMatchModal } from '../screens/chat/FindingNewMatchModal';
import { ChatListScreen } from '../screens/chatList/ChatListScreen';
import { DevMenuScreen, type DevMenuEntry } from '../screens/devMenu/DevMenuScreen';
import { EntryScreen } from '../screens/entry/EntryScreen';
import type { EntryDestination } from '../screens/entry/useEntryController';
import { FindingMatchScreen } from '../screens/findingMatch/FindingMatchScreen';
import { MoodSelectScreen, type Mood } from '../screens/moodSelect/MoodSelectScreen';
import { TopicsScreen, type TopicsSelection } from '../screens/topics/TopicsScreen';
import { VerificationScreen } from '../screens/verification/VerificationScreen';
import { posthog } from '../config/posthog';
import { useAnalyticsCapture } from '../hooks/usePosthogHooks';
import type { ChatSocketService } from '../services/chatSocket/ChatSocketService';
import { createDevNoopChatSocketService } from '../services/chatSocket/devNoopChatSocketService';
import type { RootStackParamList } from './types';

interface ChatHandoff {
  service: ChatSocketService;
  partner: string;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<OnboardingStep>('verification');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();
  const [chatHandoff, setChatHandoff] = useState<ChatHandoff | null>(null);

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

  const handleMatched = useCallback((service: ChatSocketService, partner: string) => {
    setChatHandoff({ service, partner });
    setStep('chat');
  }, []);

  const handleLeaveChat = useCallback(() => {
    setChatHandoff(null);
    navigation.replace('ChatList');
  }, [navigation]);

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
          selection={selection}
          onLeave={handleLeaveChat}
        />
      ) : displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen selection={selection} onClose={handleCancelSearch} onMatched={handleMatched} />
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

type ReturningStep = 'mood_select' | 'topics' | 'finding_match' | 'chat';

function MoodSelectRoute({ route }: NativeStackScreenProps<RootStackParamList, 'MoodSelect'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<ReturningStep>('mood_select');
  const [mood, setMood] = useState<Mood | null>(null);
  const [selection, setSelection] = useState<TopicsSelection | null>(null);
  const moodSelectedRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();
  const { showProgress } = route.params;
  const [chatHandoff, setChatHandoff] = useState<ChatHandoff | null>(null);

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

  const handleMatched = useCallback((service: ChatSocketService, partner: string) => {
    setChatHandoff({ service, partner });
    setStep('chat');
  }, []);

  const handleLeaveChat = useCallback(() => {
    setChatHandoff(null);
    navigation.replace('ChatList');
  }, [navigation]);

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
          selection={selection}
          onLeave={handleLeaveChat}
        />
      ) : displayStep === 'finding_match' && selection ? (
        <FindingMatchScreen selection={selection} onClose={handleCancelSearch} onMatched={handleMatched} />
      ) : displayStep === 'topics' && mood ? (
        <TopicsScreen mood={mood} onFindSomeone={handleFindSomeone} />
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

  return (
    <FindingMatchScreen
      selection={selectionRef.current}
      onClose={() => navigation.goBack()}
      onMatched={(service, partner) =>
        navigation.navigate('DevChat', { service, partner, mood: selectionRef.current.mood, topic: selectionRef.current.tags[0] ?? null })
      }
    />
  );
}

function DevChatRoute({ route }: NativeStackScreenProps<RootStackParamList, 'DevChat'>) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const fallbackServiceRef = useRef<ChatSocketService | undefined>(undefined);
  if (!fallbackServiceRef.current) {
    fallbackServiceRef.current = createDevNoopChatSocketService();
  }

  const params = route.params;
  const mood = params?.mood ?? 'good';
  const topic = params?.topic ?? 'hobbies';

  return (
    <ChatScreen
      chatSocketService={params?.service ?? fallbackServiceRef.current}
      selection={{ mood, tags: topic ? [topic] : [], optedIn: false }}
      onLeave={() => navigation.navigate('DevMenu')}
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
      onReport={() => console.log('[DevFindingNewMatchModal] Report tapped — not implemented yet.')}
    />
  );
}

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
      label: 'Topics — feeling low',
      description: 'Topic picker, "low" mood variant.',
      onPress: () => navigation.navigate('DevTopics', { mood: 'low' }),
    },
    {
      label: 'Finding Match',
      description: "Connects for real — shows the MISSING_TOKEN error state unless you've verified this session.",
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
  ];

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
      {__DEV__ ? (
        <>
          <Stack.Screen name="DevMenu" component={DevMenuRoute} options={{ animation: 'fade' }} />
          <Stack.Screen name="DevTopics" component={DevTopicsRoute} />
          <Stack.Screen name="DevFindingMatch" component={DevFindingMatchRoute} />
          <Stack.Screen name="DevChat" component={DevChatRoute} />
          <Stack.Screen name="DevFindingNewMatchModal" component={DevFindingNewMatchModalRoute} />
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
