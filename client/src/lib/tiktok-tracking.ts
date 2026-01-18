// TikTok tracking disabled intentionally.
// This file exists to prevent build failures from old imports.

export type TrackPayload = Record<string, any>;

export function trackViewContent(_payload?: TrackPayload) {}
export function trackCompleteRegistration(_payload?: TrackPayload) {}
export function trackClickButton(_payload?: TrackPayload) {}
export function trackLead(_payload?: TrackPayload) {}

// Some older code may import a default — keep it safe.
export default function trackTikTokEvent(_payload?: TrackPayload) {}
