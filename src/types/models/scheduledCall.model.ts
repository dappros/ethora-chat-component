// Scheduled calls (booking). Wire shapes of the `/v1/chats/calls/scheduled`
// endpoints and of the `<data type="scheduledCall">` room message, as fixed by
// the backend contract. Booking only decides WHEN: the call itself still goes
// through the existing start/join path (p2p for 1:1, LiveKit for groups).

export type ScheduledCallKind = 'video' | 'audio';

/** Lifecycle stored on the server row. */
export type ScheduledCallStatus = 'scheduled' | 'cancelled';

/**
 * Status carried by the room message. `updated` means the call was edited
 * after the first invite; the card treats it like `scheduled`.
 */
export type ScheduledCallMessageStatus = 'scheduled' | 'updated' | 'cancelled';

export interface ScheduledCall {
  id?: string;
  appId?: string;
  chatName: string;
  chatType?: 'private' | 'group' | 'public';
  createdBy?: string;
  title: string;
  description?: string;
  /** ISO 8601, UTC. */
  startAt: string;
  durationMinutes: number;
  timezone?: string;
  kind: ScheduledCallKind;
  slug: string;
  status: ScheduledCallStatus;
  sequence?: number;
  reminderSentAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Links are built by the backend only; clients never compose calendar URLs. */
export interface ScheduledCallLinks {
  join: string;
  ics: string;
  google: string;
  outlook: string;
  office365?: string;
}

export interface ScheduledCallWithLinks {
  scheduledCall: ScheduledCall;
  links: ScheduledCallLinks;
}

export interface ScheduledCallDetails extends ScheduledCallWithLinks {
  chat: {
    name: string;
    title?: string;
    type?: string;
    jid: string;
  };
}

export interface CreateScheduledCallInput {
  chatName: string;
  title?: string;
  description?: string;
  startAt: string;
  durationMinutes?: number;
  timezone?: string;
  kind?: ScheduledCallKind;
}

export interface UpdateScheduledCallInput {
  title?: string;
  description?: string;
  startAt?: string;
  durationMinutes?: number;
  kind?: ScheduledCallKind;
}

/**
 * What a `<data type="scheduledCall">` message boils down to. Persisted on the
 * message (like `callLog`) so a reloaded transcript repaints the card before
 * the archive re-delivers the stanza.
 */
export interface ScheduledCallMeta {
  slug: string;
  title: string;
  /** ISO 8601, UTC. */
  startAt: string;
  durationMinutes: number;
  kind: ScheduledCallKind;
  status: ScheduledCallMessageStatus;
  /** Creator's user id (`scheduledCallCreatedBy`), decides who sees Edit and Cancel. */
  createdBy?: string;
  joinUrl?: string;
  icsUrl?: string;
  googleUrl?: string;
  outlookUrl?: string;
}

/** Why a scheduled call could not be opened. */
export type ScheduledCallOpenError =
  | 'not-found'
  | 'not-a-member'
  | 'cancelled'
  | 'network';

export interface ScheduledCallsConfig {
  /**
   * Scheduling and invite cards. Defaults to on whenever video calls are on
   * (`config.videoCalls.enabled`). `false` hides the "Schedule call" action;
   * invite cards still render so a room that already holds one stays readable,
   * but without the Join button.
   */
  enabled?: boolean;
  /**
   * Called when `scheduledCallSlug` (or `openScheduledCall(slug)`) could not be
   * opened. A host that wants its own error screen resolves the slug itself
   * first; this is for the in-chat fallback.
   */
  onOpenError?: (error: { slug: string; reason: ScheduledCallOpenError }) => void;
  /**
   * Hosts whose `https://<host>/call/<slug>` links `parseScheduledCallLink`
   * accepts on top of `app.chat.ethora.com` and the page's own host. Same option
   * name and defaults as the React Native SDK.
   */
  hosts?: string[];
  /**
   * Custom URL schemes (without `://`) that `parseScheduledCallLink` accepts
   * for `<scheme>://call/<slug>`. Unset accepts any scheme. Same option name
   * as the React Native SDK.
   */
  schemes?: string[];
}
