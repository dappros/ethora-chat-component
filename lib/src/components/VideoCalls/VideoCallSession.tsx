import React, { useEffect, useMemo, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomConnectOptions,
  RoomOptions,
  Track,
  VideoPresets,
} from 'livekit-client';
import {
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useConnectionState,
  useRemoteParticipants,
  useSpeakingParticipants,
  useTrackToggle,
  useTracks,
} from '@livekit/components-react';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { HangUpIcon } from '../../assets/icons';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';

interface VideoCallSessionProps {
  token: string;
  livekitUrl: string;
  kind?: 'audio' | 'video';
  primaryColor?: string;
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

const MicOnIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      fill={color}
    />
  </svg>
);

const MicOffIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M15 10.6V6a3 3 0 0 0-6 0v.6L15 10.6Zm4 0h-1.7a5.5 5.5 0 0 1-.5 2L15.3 11.9a3.5 3.5 0 0 0 .2-.9V11H19Zm-3.7 4.4A5 5 0 0 1 12 16a5 5 0 0 1-5-5H5a7 7 0 0 0 6 6.92V21h2v-3.08a7 7 0 0 0 2.5-.92ZM3.3 2.7 2 4l4 4v3a5 5 0 0 0 8.5 3.5l1.4 1.4a7 7 0 0 1-3.9 1.92V21h-2v-3.08A7 7 0 0 1 5 11H7v.55a3 3 0 0 0 5 2.45l5.7 5.7 1.4-1.4Z"
      fill={color}
    />
  </svg>
);

const CamOnIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 3.5v-10l-4 3.5Z"
      fill={color}
    />
  </svg>
);

const CamOffIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M21 6.5 17 10v-3a1 1 0 0 0-1-1H7.5L21 19.5v-13ZM3.3 2.7 2 4l2 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12.7l3 3 1.3-1.3L3.3 2.7Z"
      fill={color}
    />
  </svg>
);

const ShareScreenIcon: React.FC<{ color?: string }> = ({
  color = '#FFFFFF',
}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M20 3H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6v2H7v2h10v-2h-3v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 14H4V5h16v12Zm-8-9-5 5h3v3h4v-3h3l-5-5Z"
      fill={color}
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
}

const CallControls: React.FC<CallControlsProps> = ({
  primaryColor,
  onHangup,
  includeCamera = false,
  includeScreenShare = false,
  layout = 'light',
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
        {mic.enabled ? <MicOnIcon color={iconColor} /> : <MicOffIcon />}
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
          {cam.enabled ? <CamOnIcon color={iconColor} /> : <CamOffIcon />}
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
          <ShareScreenIcon color={screen.enabled ? primaryColor : iconColor} />
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
        <HangUpIcon color="#FFFFFF" />
      </button>
    </div>
  );
};

// ---------- video content ----------------------------------------------

const VideoCallContent: React.FC<{
  primaryColor: string;
  onHangup: () => void;
}> = ({ primaryColor, onHangup }) => {
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

  // A TrackReference exists even when the camera is muted/off — rendering
  // ParticipantTile for it shows LiveKit's default grey-silhouette
  // placeholder + name + connection bars, which clashes with our chrome.
  // Only treat a track as renderable when it has a live, unmuted track.
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

  // Live duration in the header, gated on the peer actually joining — same
  // semantics as the audio screen so the dialer doesn't see a timer until
  // the callee picks up.
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [tickSeconds, setTickSeconds] = useState(0);
  useEffect(() => {
    if (peerJoined && connectedAt === null) setConnectedAt(Date.now());
  }, [peerJoined, connectedAt]);
  useEffect(() => {
    if (connectedAt === null) return;
    const id = window.setInterval(
      () => setTickSeconds(Math.floor((Date.now() - connectedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(id);
  }, [connectedAt]);
  const headerStatus = peerJoined ? formatDuration(tickSeconds) : 'Ringing…';

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

      {/* Main stage: remote video / placeholder */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {mainTrack ? (
          <ParticipantTile trackRef={mainTrack} />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
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
          <ParticipantTile trackRef={localCamera} />
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
          includeScreenShare
          layout="overlay"
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
}> = ({ primaryColor, onHangup }) => {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  const roomName = useSelector((state: RootState) => state.call.roomName);
  const remoteParticipants = useRemoteParticipants();
  const peerJoined = remoteParticipants.length > 0;

  const speakingParticipants = useSpeakingParticipants();
  const peerSpeaking = speakingParticipants.some((p) => !p.isLocal);

  const { enabled: micEnabled } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [tickSeconds, setTickSeconds] = useState(0);

  useEffect(() => {
    ensureAudioPulseKeyframes();
  }, []);

  // The duration timer only ticks once the remote peer actually joins
  // the LiveKit room. Without this gate the dialer's UI flips from
  // "Calling…" to "00:00" the instant their own token arrives, which
  // looks like the callee already accepted.
  useEffect(() => {
    if (peerJoined && connectedAt === null) {
      setConnectedAt(Date.now());
    }
  }, [peerJoined, connectedAt]);

  useEffect(() => {
    if (connectedAt === null) return;
    const id = window.setInterval(() => {
      setTickSeconds(Math.floor((Date.now() - connectedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [connectedAt]);

  const statusText = (() => {
    if (peerJoined) return formatDuration(tickSeconds);
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

      <CallControls primaryColor={primaryColor} onHangup={onHangup} />

      <RoomAudioRenderer />
    </div>
  );
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
  onConnected,
  onError,
  onHangup,
}) => {
  const isAudioOnly = kind === 'audio';

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

  useEffect(() => {
    let mounted = true;

    const startCall = async () => {
      try {
        await room.connect(livekitUrl, token, connectOptions);
        if (!mounted) return;
        // Audio call: publish only the microphone — leaves the camera
        // capture device untouched so the browser doesn't prompt for it
        // and the peer doesn't get a black video tile.
        if (isAudioOnly) {
          await room.localParticipant.setMicrophoneEnabled(true);
        } else {
          await room.localParticipant.enableCameraAndMicrophone();
        }
        onConnected?.();
      } catch (error) {
        if (!mounted) return;
        onError?.(getErrorMessage(error));
      }
    };

    void startCall();

    return () => {
      mounted = false;
      room.disconnect();
    };
  }, [room, livekitUrl, token, connectOptions, isAudioOnly, onConnected, onError]);

  return (
    <RoomContext.Provider value={room}>
      {isAudioOnly ? (
        <AudioCallContent primaryColor={primaryColor} onHangup={onHangup} />
      ) : (
        <VideoCallContent primaryColor={primaryColor} onHangup={onHangup} />
      )}
    </RoomContext.Provider>
  );
};
