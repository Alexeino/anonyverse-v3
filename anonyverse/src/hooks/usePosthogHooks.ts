import { useCallback, useEffect, useRef } from "react";
import { usePostHog } from "posthog-react-native";
import type { PostHogEventProperties } from "@posthog/core";

// chat_opened / chat_closed / user_reported are reserved for when a
// ChatRoom screen exists — not wired anywhere yet (no ChatRoom screen, no
// skip/report/close handlers, no moderation backend). See
// useDurationTracking for the duration_ms timer these will need at that
// point.
type AnalyticsEvent =
    | "test_event"
    | "app_launched"
    | "verification_started"
    | "verification_failed"
    | "verification_succeeded"
    | "mood_screen_viewed"
    | "mood_selected"
    | "topic_selected"
    | "match_search_started"
    | "match_found"
    | "chat_opened"
    | "chat_closed"
    | "user_reported"

/** Debug-only captures (requiresDebug) only fire in dev builds. */
export const DEBUG = __DEV__;

type CaptureOptions = { requiresDebug?: boolean };

/** Fires `eventName` once when the calling component mounts. */
export function useCaptureEvent(eventName: AnalyticsEvent, properties = {}, options?: CaptureOptions){
    const capture = useAnalyticsCapture()

    useEffect(() => {
        capture(eventName, properties, options)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[])
}

/**
 * Returns a stable function for firing analytics events on demand — inside
 * callbacks, effects, or async code — since sending an event is a plain
 * action, not itself a hook (unlike useCaptureEvent, this is safe to call
 * from anywhere, not just a component's top level).
 */
export function useAnalyticsCapture() {
    const ph = usePostHog()

    return useCallback((eventName: AnalyticsEvent, properties: PostHogEventProperties = {}, options?: CaptureOptions) => {
        if (options?.requiresDebug && !DEBUG) {
            return;
        }
        ph?.capture(eventName, properties)
    }, [ph])
}

/**
 * Generic start/end duration timer for PostHog events that carry an
 * elapsed-time property (e.g. match_search_started -> match_found's
 * wait_duration_ms, and later chat_opened -> chat_closed's duration_ms).
 * `start()` marks t0; `captureEnd()` computes the elapsed ms since the last
 * `start()` and fires `eventName` with that value under `durationProperty`,
 * merged with any extra `properties`. One instance can be reused across
 * repeated start/end cycles (each `start()` resets t0).
 */
export function useDurationTracking() {
    const capture = useAnalyticsCapture()
    const startedAtRef = useRef<number | null>(null)

    const start = useCallback(() => {
        startedAtRef.current = Date.now()
    }, [])

    const captureEnd = useCallback((eventName: AnalyticsEvent, durationProperty: string, properties: PostHogEventProperties = {}) => {
        const startedAt = startedAtRef.current
        const elapsedMs = startedAt == null ? null : Date.now() - startedAt
        capture(eventName, { ...properties, [durationProperty]: elapsedMs })
    }, [capture])

    return { start, captureEnd }
}

/**
 * Returns a stable function for identifying the current device to PostHog
 * once its backend-issued device_id is known — call it wherever that id is
 * first confirmed (see useEntryController/useVerificationController), not
 * at SDK init time, since the id isn't available yet then.
 */
export function useIdentifyDevice() {
    const ph = usePostHog()

    return useCallback((deviceId: string) => {
        ph?.identify(deviceId)
    }, [ph])
}
