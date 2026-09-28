import type { FeedbackReason, FeedbackType } from '../../services/feedback/types';

// Labels can be reworded freely; new codes must be added to the backend first.
export const REASON_LABELS: Record<FeedbackReason, string> = {
  BUG_MESSAGES_NOT_SENT: "Messages didn't send",
  BUG_DISCONNECTED: 'Got disconnected',
  BUG_APP_FROZE: 'App froze or lagged',
  BUG_TYPING_INDICATOR: 'Typing indicator was wrong',
  BUG_MATCH_TOO_SLOW: 'Finding a match took too long',
  BUG_STUCK_SEARCHING: 'Got stuck searching',
  BUG_VERIFICATION_FAILED: "Verification didn't work",
  BUG_OTHER: 'Something else',
  DISLIKE_BAD_MATCHES: 'Bad matches',
  DISLIKE_RUDE_PARTNERS: 'Rude people',
  DISLIKE_TOO_SLOW: 'Too slow',
  DISLIKE_TOO_BUGGY: 'Too many bugs',
  DISLIKE_CONFUSING: 'Confusing to use',
  DISLIKE_OTHER: 'Something else',
  IMPROVE_MATCHING: 'Better matches',
  IMPROVE_SPEED: 'Faster',
  IMPROVE_DESIGN: 'Nicer design',
  IMPROVE_STABILITY: 'Fewer bugs',
  IMPROVE_MORE_TOPICS: 'More topics',
  IMPROVE_OTHER: 'Something else',
  WISH_SAVE_PARTNER: 'Chat again with someone',
  WISH_SEND_MEDIA: 'Send photos',
  WISH_VOICE_CHAT: 'Voice chat',
  WISH_MORE_TOPICS: 'More topics',
  WISH_OTHER: 'Something else',
  LOVE_ANONYMITY: 'Staying anonymous',
  LOVE_MATCHES: 'The people I meet',
  LOVE_DESIGN: 'The design',
  LOVE_SPEED: "How fast it is",
  LOVE_OTHER: 'Something else',
};

const DEFAULT_BUG_REASONS: FeedbackReason[] = [
  'BUG_APP_FROZE',
  'BUG_DISCONNECTED',
  'BUG_MATCH_TOO_SLOW',
  'BUG_OTHER',
];

const BUG_REASONS_BY_SCREEN: Record<string, FeedbackReason[]> = {
  ChatScreen: [
    'BUG_MESSAGES_NOT_SENT',
    'BUG_DISCONNECTED',
    'BUG_TYPING_INDICATOR',
    'BUG_APP_FROZE',
    'BUG_OTHER',
  ],
  FindingMatchScreen: ['BUG_MATCH_TOO_SLOW', 'BUG_STUCK_SEARCHING', 'BUG_APP_FROZE', 'BUG_OTHER'],
  VerificationScreen: ['BUG_VERIFICATION_FAILED', 'BUG_APP_FROZE', 'BUG_OTHER'],
};

export function bugReasonsForScreen(screen: string | undefined): FeedbackReason[] {
  return (screen && BUG_REASONS_BY_SCREEN[screen]) || DEFAULT_BUG_REASONS;
}

export interface RatingFollowUp {
  question: string;
  reasons: FeedbackReason[];
  type: FeedbackType;
}

export function ratingFollowUp(rating: number): RatingFollowUp {
  if (rating <= 1) {
    return {
      question: 'What went wrong?',
      reasons: [
        'DISLIKE_BAD_MATCHES',
        'DISLIKE_RUDE_PARTNERS',
        'DISLIKE_TOO_SLOW',
        'DISLIKE_TOO_BUGGY',
        'DISLIKE_CONFUSING',
        'DISLIKE_OTHER',
      ],
      type: 'IMPROVEMENT',
    };
  }
  if (rating <= 3) {
    return {
      question: 'What could be better?',
      reasons: [
        'IMPROVE_MATCHING',
        'IMPROVE_SPEED',
        'IMPROVE_DESIGN',
        'IMPROVE_STABILITY',
        'IMPROVE_MORE_TOPICS',
        'IMPROVE_OTHER',
      ],
      type: 'IMPROVEMENT',
    };
  }
  if (rating === 4) {
    return {
      question: 'What would make it a 5?',
      reasons: ['WISH_SAVE_PARTNER', 'WISH_SEND_MEDIA', 'WISH_VOICE_CHAT', 'WISH_MORE_TOPICS', 'WISH_OTHER'],
      type: 'FEATURE_REQUEST',
    };
  }
  return {
    question: 'What do you love most?',
    reasons: ['LOVE_ANONYMITY', 'LOVE_MATCHES', 'LOVE_DESIGN', 'LOVE_SPEED', 'LOVE_OTHER'],
    type: 'GENERAL',
  };
}
