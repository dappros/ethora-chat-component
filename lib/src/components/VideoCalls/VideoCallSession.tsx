import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomConnectOptions,
  RoomOptions,
  Track,
  VideoPresets,
} from 'livekit-client';
import {
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useConnectionState,
  useParticipants,
  useRemoteParticipants,
  useSpeakingParticipants,
  useTrackToggle,
  useTracks,
} from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { HangUpIcon } from '../../assets/icons';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';
import { VideoCallIcons } from '../../types/models/config.model';

interface VideoCallSessionProps {
  token: string;
  livekitUrl: string;
  kind?: 'audio' | 'video';
  primaryColor?: string;
  /** Host icon overrides for the control bar. */
  icons?: VideoCallIcons;
  /** Start with the camera on (video calls). Default true. */
  startWithCameraOn?: boolean;
  /** Start with the microphone on. Default true. */
  startWithMicOn?: boolean;
  /** Show the screen-share control. Default true. */
  showScreenShare?: boolean;
  onConnected?: () => void;
  onError?: (message: string) => void;
  onHangup: () => void;
}

const DEFAULT_PRIMARY = '#0052CD';
const TEXT_PRIMARY = '#141414';
const TEXT_MUTED = '#8c8c8c';
const SURFACE = '#fff';
const SURFACE_MUTED = '#f3f6fc';
const DIVIDER = '#f0f0f0';
const DANGER = '#E53935';

// ---------- inline icon set ---------------------------------------------

// Clean, cohesive call-control glyphs (24px). The off variants overlay a
// two-tone diagonal slash — a thick `cutColor` line (matches the red muted
// button) under a thin icon-color line — so the slash reads clearly against
// the glyph on any background. `cutColor` defaults to the danger red used by
// the muted buttons.
const MicOnIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="8.5" y="2" width="7" height="12" rx="3.5" fill={color} />
    <path
      d="M5 11a7 7 0 0 0 14 0"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12 18v3M9 21h6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MicOffIcon: React.FC<{ color?: string; cutColor?: string }> = ({
  color = '#FFFFFF',
  cutColor = DANGER,
}) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="8.5" y="2" width="7" height="12" rx="3.5" fill={color} />
    <path
      d="M5 11a7 7 0 0 0 14 0"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12 18v3M9 21h6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="2"
      x2="21"
      y2="22"
      stroke={cutColor}
      strokeWidth="5"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="2"
      x2="21"
      y2="22"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const CamOnIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="14" height="12" rx="2.5" fill={color} />
    <path
      d="M17.5 10l4-2.6a1 1 0 0 1 1.5.85v7.5a1 1 0 0 1-1.5.85l-4-2.6Z"
      fill={color}
    />
  </svg>
);

const CamOffIcon: React.FC<{ color?: string; cutColor?: string }> = ({
  color = '#FFFFFF',
  cutColor = DANGER,
}) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="14" height="12" rx="2.5" fill={color} />
    <path
      d="M17.5 10l4-2.6a1 1 0 0 1 1.5.85v7.5a1 1 0 0 1-1.5.85l-4-2.6Z"
      fill={color}
    />
    <line
      x1="2"
      y1="2"
      x2="22"
      y2="22"
      stroke={cutColor}
      strokeWidth="5"
      strokeLinecap="round"
    />
    <line
      x1="2"
      y1="2"
      x2="22"
      y2="22"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const ShareScreenIcon: React.FC<{ color?: string }> = ({
  color = '#FFFFFF',
}) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect
      x="1.5"
      y="3.5"
      width="21"
      height="14"
      rx="2.2"
      fill="none"
      stroke={color}
      strokeWidth="2"
    />
    <path d="M12 6l-4.2 4.5H10.4V14h3.2v-3.5h2.6Z" fill={color} />
    <path
      d="M8 21h8"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// ---------- helpers -----------------------------------------------------

const hexToRgba = (hex: string, alpha: number): string => {
  let value = String(hex || DEFAULT_PRIMARY).trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (value.length !== 6) return `rgba(0, 82, 205, ${alpha})`;
  const num = parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Elapsed call seconds anchored to a value BOTH sides agree on: the moment
// the last participant joined (= when the call truly connected). LiveKit sets
// `joinedAt` server-side, so every client reads the same timestamp — unlike
// the old "start a local timer when I first see the peer" approach, where the
// caller and callee began counting at different local moments and drifted.
// Returns null until the peer is present (caller still sees "Ringing…").
const useSharedCallElapsed = (): number | null => {
  const participants = useParticipants();
  const [, forceTick] = useState(0);

  const joinTimes = participants
    .map((p) => (p.joinedAt ? new Date(p.joinedAt).getTime() : 0))
    .filter((t) => t > 0);
  const peerPresent = participants.length >= 2;
  const anchor =
    peerPresent && joinTimes.length >= 2 ? Math.max(...joinTimes) : null;

  useEffect(() => {
    if (anchor === null) return;
    const id = window.setInterval(() => forceTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [anchor]);

  if (anchor === null) return null;
  return Math.max(0, Math.floor((Date.now() - anchor) / 1000));
};

const formatDuration = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

// 48px chat-component-sized round control button. Three styles:
//  - 'neutral': light surface, dark icon (mic on, cam on, share off)
//  - 'active': primary-tinted surface, primary icon (share on)
//  - 'danger': red surface, white icon (mic off, cam off, hangup)
type ToneVariant = 'neutral' | 'active' | 'danger';

const toneStyle = (
  tone: ToneVariant,
  primary: string,
  background: string = SURFACE_MUTED
): React.CSSProperties => {
  if (tone === 'danger') {
    return { background: DANGER, color: '#FFFFFF', border: 'none' };
  }
  if (tone === 'active') {
    return {
      background: hexToRgba(primary, 0.12),
      color: primary,
      border: `1px solid ${hexToRgba(primary, 0.25)}`,
    };
  }
  return {
    background,
    color: TEXT_PRIMARY,
    border: `1px solid ${DIVIDER}`,
  };
};

const controlButtonBase: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 999,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
  transition: 'background 200ms ease, transform 120ms ease',
};

// Audio-call pulse keyframes — same animation, light surface.
const AUDIO_PULSE_STYLE_ID = 'ethora-audio-call-pulse-keyframes';
const ensureAudioPulseKeyframes = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(AUDIO_PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = AUDIO_PULSE_STYLE_ID;
  style.textContent = `
    @keyframes ethora-audio-call-pulse {
      0% { transform: scale(0.94); opacity: 0.5; }
      70% { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(0.94); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
};

// ---------- shared controls --------------------------------------------

interface CallControlsProps {
  primaryColor: string;
  onHangup: () => void;
  includeCamera?: boolean;
  includeScreenShare?: boolean;
  layout?: 'light' | 'overlay';
  icons?: VideoCallIcons;
}

const CallControls: React.FC<CallControlsProps> = ({
  primaryColor,
  onHangup,
  includeCamera = false,
  includeScreenShare = false,
  layout = 'light',
  icons,
}) => {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });

  // For controls overlaid on dark video, use translucent dark surfaces so
  // the bar reads as a glass tray. For the light audio screen, use the
  // chat's neutral surface tokens.
  const neutralBg = layout === 'overlay' ? 'rgba(255,255,255,0.14)' : SURFACE_MUTED;
  const neutralBorder =
    layout === 'overlay' ? 'rgba(255,255,255,0.18)' : DIVIDER;
  const iconColor = layout === 'overlay' ? '#FFFFFF' : TEXT_PRIMARY;

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        onClick={() => mic.toggle()}
        aria-label={mic.enabled ? 'Mute microphone' : 'Unmute microphone'}
        title={mic.enabled ? 'Mute' : 'Unmute'}
        style={{
          ...controlButtonBase,
          ...(mic.enabled
            ? { background: neutralBg, color: iconColor, border: `1px solid ${neutralBorder}` }
            : toneStyle('danger', primaryColor)),
        }}
      >
        {mic.enabled
          ? icons?.micOn ?? <MicOnIcon color={iconColor} />
          : icons?.micOff ?? <MicOffIcon />}
      </button>

      {includeCamera && (
        <button
          onClick={() => cam.toggle()}
          aria-label={cam.enabled ? 'Turn camera off' : 'Turn camera on'}
          title={cam.enabled ? 'Camera off' : 'Camera on'}
          style={{
            ...controlButtonBase,
            ...(cam.enabled
              ? { background: neutralBg, color: iconColor, border: `1px solid ${neutralBorder}` }
              : toneStyle('danger', primaryColor)),
          }}
        >
          {cam.enabled
            ? icons?.cameraOn ?? <CamOnIcon color={iconColor} />
            : icons?.cameraOff ?? <CamOffIcon />}
        </button>
      )}

      {includeScreenShare && (
        <button
          onClick={() => screen.toggle()}
          aria-label={
            screen.enabled ? 'Stop sharing screen' : 'Share screen'
          }
          title={screen.enabled ? 'Stop sharing' : 'Share screen'}
          style={{
            ...controlButtonBase,
            ...(screen.enabled
              ? toneStyle('active', primaryColor)
              : { background: neutralBg, color: iconColor, border: `1px solid ${neutralBorder}` }),
          }}
        >
          {screen.enabled
            ? icons?.screenShareOn ?? (
                <ShareScreenIcon color={primaryColor} />
              )
            : icons?.screenShareOff ?? <ShareScreenIcon color={iconColor} />}
        </button>
      )}

      <button
        onClick={onHangup}
        aria-label="End call"
        title="End call"
        style={{
          ...controlButtonBase,
          ...toneStyle('danger', primaryColor),
        }}
      >
        {icons?.hangup ?? <HangUpIcon color="#FFFFFF" />}
      </button>
    </div>
  );
};

// ---------- video content ----------------------------------------------

const VideoCallContent: React.FC<{
  primaryColor: string;
  onHangup: () => void;
  icons?: VideoCallIcons;
  showScreenShare?: boolean;
}> = ({ primaryColor, onHangup, icons, showScreenShare = true }) => {
  const roomName = useSelector((state: RootState) => state.call.roomName);
  const remoteParticipants = useRemoteParticipants();
  const peerJoined = remoteParticipants.length > 0;

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  const localCamera = cameraTracks.find((t) => t.participant.isLocal);
  const remoteCamera = cameraTracks.find((t) => !t.participant.isLocal);
  const remoteScreen = screenTracks.find((t) => !t.participant.isLocal);

  // A TrackReference exists even when the camera is muted/off. We render our
  // OWN <VideoTrack> (not LiveKit's ParticipantTile) so there's no built-in
  // grey-silhouette placeholder, name label or connection bars — and we only
  // mount the <video> for a live, unmuted track so the layout never jumps
  // between an avatar and a video of a different size/position.
  const hasLiveVideo = (t: typeof remoteCamera): boolean =>
    !!t && !!t.publication && !t.publication.isMuted && !!t.publication.track;

  const remoteScreenLive = hasLiveVideo(remoteScreen);
  const remoteCameraLive = hasLiveVideo(remoteCamera);
  const localCameraLive = hasLiveVideo(localCamera);
  const mainTrack = remoteScreenLive
    ? remoteScreen
    : remoteCameraLive
      ? remoteCamera
      : null;

  // Shared, server-anchored duration so both sides show the same time.
  const elapsed = useSharedCallElapsed();
  const headerStatus = elapsed === null ? 'Ringing…' : formatDuration(elapsed);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // Video stage stays dark — that's the convention for video tiles
        // (high contrast for skin tones), but the rest of the chrome
        // (top bar, controls tray) uses the chat's light tokens.
        background: '#0B1220',
      }}
    >
      {/* Top header strip — matches the chat header pattern */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '14px 20px',
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          color: '#FFFFFF',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {roomName || 'Video call'}
        </span>
        <span
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {headerStatus}
        </span>
      </div>

      {/* Main stage: remote video AND placeholder both absolutely fill the
          same box, so toggling between them never shifts layout. The video
          sits on top when live; otherwise the centered avatar shows. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            color: '#FFFFFF',
            padding: 24,
          }}
        >
          <ProfileImagePlaceholder name={roomName || 'Video call'} size={120} />
          <div style={{ fontSize: 20, fontWeight: 500 }}>
            {roomName || 'Video call'}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
            {peerJoined ? "Peer's camera is off" : 'Ringing…'}
          </div>
        </div>
        {mainTrack && (
          <VideoTrack
            trackRef={mainTrack as TrackReference}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              background: '#0B1220',
            }}
          />
        )}
      </div>

      {/* Local self-view — only mount the tile when our camera is actually
          producing video. When it's off we show a small avatar instead of
          a black rectangle. */}
      <div
        style={{
          position: 'absolute',
          right: 16,
          bottom: 96,
          width: 200,
          height: 112,
          borderRadius: 16,
          overflow: 'hidden',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {localCameraLive && localCamera ? (
          <VideoTrack
            trackRef={localCamera as TrackReference}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // Mirror the local self-view like every major call app.
              transform: 'scaleX(-1)',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            <ProfileImagePlaceholder name="You" size={44} />
            <span style={{ fontSize: 12 }}>Camera off</span>
          </div>
        )}
      </div>

      {/* Bottom control tray */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          padding: '16px',
          background:
            'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CallControls
          primaryColor={primaryColor}
          onHangup={onHangup}
          includeCamera
          includeScreenShare={showScreenShare}
          layout="overlay"
          icons={icons}
        />
      </div>

      <RoomAudioRenderer />
    </div>
  );
};

// ---------- audio content ----------------------------------------------

const AudioCallContent: React.FC<{
  primaryColor: string;
  onHangup: () => void;
  icons?: VideoCallIcons;
}> = ({ primaryColor, onHangup, icons }) => {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  const roomName = useSelector((state: RootState) => state.call.roomName);

  const speakingParticipants = useSpeakingParticipants();
  const peerSpeaking = speakingParticipants.some((p) => !p.isLocal);

  const { enabled: micEnabled } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  useEffect(() => {
    ensureAudioPulseKeyframes();
  }, []);

  // Shared, server-anchored duration (same on both sides). Null until the
  // peer joins, so the dialer keeps seeing "Ringing…" until the callee picks
  // up rather than flipping to 00:00 when its own token arrives.
  const elapsed = useSharedCallElapsed();

  const statusText = (() => {
    if (elapsed !== null) return formatDuration(elapsed);
    if (isConnected) return 'Ringing…';
    return 'Connecting…';
  })();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: SURFACE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: TEXT_PRIMARY,
        padding: '28px 24px 24px',
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: TEXT_MUTED,
          fontWeight: 400,
        }}
      >
        Audio call
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 168,
            height: 168,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {peerSpeaking && (
            <>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `2px solid ${hexToRgba(primaryColor, 0.45)}`,
                  background: 'transparent',
                  animation:
                    'ethora-audio-call-pulse 1.6s ease-out infinite',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `2px solid ${hexToRgba(primaryColor, 0.3)}`,
                  background: 'transparent',
                  animation:
                    'ethora-audio-call-pulse 1.6s ease-out infinite',
                  animationDelay: '0.8s',
                }}
              />
            </>
          )}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <ProfileImagePlaceholder
              name={roomName || 'Audio call'}
              size={120}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: TEXT_PRIMARY,
              textAlign: 'center',
            }}
          >
            {roomName || 'Audio call'}
          </div>
          <div
            style={{
              fontSize: 16,
              color: TEXT_MUTED,
              fontWeight: 400,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {statusText}
          </div>
          {!micEnabled && (
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: DANGER,
                background: 'rgba(229,57,53,0.06)',
                border: `1px solid ${hexToRgba(DANGER, 0.18)}`,
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              Your microphone is muted
            </div>
          )}
        </div>
      </div>

      <CallControls
        primaryColor={primaryColor}
        onHangup={onHangup}
        icons={icons}
      />

      <RoomAudioRenderer />
    </div>
  );
};

// ---------- peer-leave watcher -----------------------------------------

// End a 1:1 call locally as soon as the remote peer leaves the LiveKit room
// (they hung up, dropped, or closed the tab). Without this the survivor sits
// on a "Ringing…" screen forever, because the only other teardown path is an
// XMPP `call-state ended` signal that isn't guaranteed to arrive. Fires once,
// and only after the peer had actually joined (so the outgoing "Ringing…"
// pre-answer state, where remoteParticipants is legitimately 0, is ignored).
const PeerLeaveWatcher: React.FC<{ onPeerLeft: () => void }> = ({
  onPeerLeft,
}) => {
  const remoteParticipants = useRemoteParticipants();
  const everJoinedRef = useRef(false);
  const firedRef = useRef(false);
  const cbRef = useRef(onPeerLeft);
  useEffect(() => {
    cbRef.current = onPeerLeft;
  }, [onPeerLeft]);
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      everJoinedRef.current = true;
      return;
    }
    if (everJoinedRef.current && !firedRef.current) {
      firedRef.current = true;
      cbRef.current?.();
    }
  }, [remoteParticipants.length]);
  return null;
};

// ---------- session shell ----------------------------------------------

const getErrorMessage = (error: unknown): string => {
  const fallback = 'Failed to join call';
  if (!(error instanceof Error)) return fallback;

  const text = error.message?.toLowerCase() || '';
  if (text.includes('permission') || text.includes('notallowederror')) {
    return 'Camera or microphone permission denied';
  }
  return error.message || fallback;
};

export const VideoCallSession: React.FC<VideoCallSessionProps> = ({
  token,
  livekitUrl,
  kind = 'video',
  primaryColor = DEFAULT_PRIMARY,
  icons,
  startWithCameraOn = true,
  startWithMicOn = true,
  showScreenShare = true,
  onConnected,
  onError,
  onHangup,
}) => {
  const isAudioOnly = kind === 'audio';
  // Read the initial device state from refs so the connect effect stays
  // dependency-stable (it must run exactly once — see the callback refs below).
  const startCameraRef = useRef(startWithCameraOn);
  const startMicRef = useRef(startWithMicOn);

  const roomOptions: RoomOptions = useMemo(
    () => ({
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      singlePeerConnection: false,
    }),
    []
  );

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  const connectOptions = useMemo(
    (): RoomConnectOptions => ({ autoSubscribe: true }),
    []
  );

  // Keep the latest callbacks in refs so the connect effect below does NOT
  // depend on their identity. The parent (VideoCallOverlay) passes inline
  // arrows that change on every render — and onConnected itself dispatches a
  // redux action that re-renders the parent. If those were in the dep array
  // the effect would re-run, its cleanup would `room.disconnect()` the call
  // we JUST joined, the server would see the participant leave and broadcast
  // a "call ended" log — so accepting a call instantly tore it down.
  const onConnectedRef = useRef(onConnected);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onConnectedRef.current = onConnected;
    onErrorRef.current = onError;
  }, [onConnected, onError]);

  useEffect(() => {
    let mounted = true;

    const startCall = async () => {
      try {
        await room.connect(livekitUrl, token, connectOptions);
        if (!mounted) return;
        // Publish devices per host config. Audio calls never touch the
        // camera (no prompt, no black tile for the peer). For video calls,
        // the camera defaults on but can be configured off.
        const micOn = startMicRef.current !== false;
        const camOn = !isAudioOnly && startCameraRef.current !== false;
        await room.localParticipant.setMicrophoneEnabled(micOn);
        if (!isAudioOnly) {
          await room.localParticipant.setCameraEnabled(camOn);
        }
        onConnectedRef.current?.();
      } catch (error) {
        if (!mounted) return;
        onErrorRef.current?.(getErrorMessage(error));
      }
    };

    void startCall();

    return () => {
      mounted = false;
      room.disconnect();
    };
    // Connect exactly once per (room, url, token, kind) — callbacks are read
    // from refs so their changing identity can't retrigger a disconnect.
  }, [room, livekitUrl, token, connectOptions, isAudioOnly]);

  return (
    <RoomContext.Provider value={room}>
      <PeerLeaveWatcher onPeerLeft={onHangup} />
      {isAudioOnly ? (
        <AudioCallContent
          primaryColor={primaryColor}
          onHangup={onHangup}
          icons={icons}
        />
      ) : (
        <VideoCallContent
          primaryColor={primaryColor}
          onHangup={onHangup}
          icons={icons}
          showScreenShare={showScreenShare}
        />
      )}
    </RoomContext.Provider>
  );
};
