import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { HangUpIcon } from '../../assets/icons';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';
import { VideoCallIcons } from '../../types/models/config.model';
import { useDraggable } from '../../helpers/useDraggable';
import type {
  P2PCallController,
  P2PSnapshot,
} from '../../calls/p2p/P2PCallController';
import {
  getActiveP2PController,
  subscribeActiveP2P,
} from '../../calls/p2p/p2pRuntime';
import {
  CamOffIcon,
  CamOnIcon,
  DANGER,
  DIVIDER,
  ExpandIcon,
  MicOffIcon,
  MicOnIcon,
  MinimizeIcon,
  SURFACE,
  SURFACE_MUTED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  controlButtonBase,
  formatDuration,
  hexToRgba,
  toneStyle,
} from './VideoCallSession';

// UI of a peer to peer 1:1 call. It mirrors the LiveKit 1:1 layouts in
// VideoCallSession (dark video stage with a draggable self-view, light audio
// card, compact floating bar) but is driven by a P2PCallController instead of
// a LiveKit room. The controller is owned by P2PCallRunner; this component
// only reads its snapshot and forwards button presses.

const DEFAULT_PRIMARY = '#0052CD';

const EMPTY_SNAPSHOT: P2PSnapshot = {
  status: 'preparing',
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  camEnabled: false,
  remoteVideoLive: false,
  notice: null,
};
const noopSubscribe = () => () => {};

/** The controller of the call on screen, re-rendering when it is swapped. */
export const useActiveP2PController = (): P2PCallController | null =>
  useSyncExternalStore(
    subscribeActiveP2P,
    getActiveP2PController,
    getActiveP2PController
  );

const useP2PSnapshot = (controller: P2PCallController | null): P2PSnapshot =>
  useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getSnapshot : () => EMPTY_SNAPSHOT,
    controller ? controller.getSnapshot : () => EMPTY_SNAPSHOT
  );

// Seconds since the call connected, ticking once a second.
const useElapsedSince = (startedAt: number | null): number | null => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (startedAt === null) return null;
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
};

const statusText = (snapshot: P2PSnapshot, elapsed: number | null): string => {
  switch (snapshot.status) {
    case 'preparing':
      return 'Starting…';
    case 'waiting':
      return 'Ringing…';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'failed':
      return 'Connection lost';
    default:
      return elapsed === null ? 'Connecting…' : formatDuration(elapsed);
  }
};

// Binds a MediaStream to a <video>/<audio> element. The stream object is
// stable for the life of the call (tracks are added to it), so this runs once.
const useBindStream = <T extends HTMLMediaElement>(
  stream: MediaStream | null
) => {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream && typeof el.play === 'function') {
      void Promise.resolve(el.play()).catch(() => {
        /* autoplay blocked: the user already interacted to place or accept */
      });
    }
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return ref;
};

// Remote audio. Always mounted, in every layout (including the minimized bar),
// so the call never goes silent when the window is shrunk.
const RemoteAudio: React.FC<{ stream: MediaStream | null }> = ({ stream }) => {
  const ref = useBindStream<HTMLAudioElement>(stream);
  return <audio ref={ref} autoPlay />;
};

const VideoSurface: React.FC<{
  stream: MediaStream | null;
  style: React.CSSProperties;
  mirrored?: boolean;
}> = ({ stream, style, mirrored }) => {
  const ref = useBindStream<HTMLVideoElement>(stream);
  // Muted always: remote sound is played by <RemoteAudio>, and the local
  // preview must never echo.
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{ ...style, transform: mirrored ? 'scaleX(-1)' : undefined }}
    />
  );
};

interface ControlsProps {
  controller: P2PCallController | null;
  snapshot: P2PSnapshot;
  primaryColor: string;
  onHangup: () => void;
  includeCamera: boolean;
  layout: 'light' | 'overlay';
  icons?: VideoCallIcons;
}

const Controls: React.FC<ControlsProps> = ({
  controller,
  snapshot,
  primaryColor,
  onHangup,
  includeCamera,
  layout,
  icons,
}) => {
  const neutralBg = layout === 'overlay' ? 'rgba(255,255,255,0.14)' : SURFACE_MUTED;
  const neutralBorder =
    layout === 'overlay' ? 'rgba(255,255,255,0.18)' : DIVIDER;
  const iconColor = layout === 'overlay' ? '#FFFFFF' : TEXT_PRIMARY;
  const neutral = {
    background: neutralBg,
    color: iconColor,
    border: `1px solid ${neutralBorder}`,
  };
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
        onClick={() => controller?.toggleMic()}
        aria-label={snapshot.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={snapshot.micEnabled ? 'Mute' : 'Unmute'}
        style={{
          ...controlButtonBase,
          ...(snapshot.micEnabled ? neutral : toneStyle('danger', primaryColor)),
        }}
      >
        {snapshot.micEnabled
          ? icons?.micOn ?? <MicOnIcon color={iconColor} />
          : icons?.micOff ?? <MicOffIcon />}
      </button>

      {includeCamera && (
        <button
          onClick={() => void controller?.toggleCamera()}
          aria-label={snapshot.camEnabled ? 'Turn camera off' : 'Turn camera on'}
          title={snapshot.camEnabled ? 'Camera off' : 'Camera on'}
          style={{
            ...controlButtonBase,
            ...(snapshot.camEnabled
              ? neutral
              : toneStyle('danger', primaryColor)),
          }}
        >
          {snapshot.camEnabled
            ? icons?.cameraOn ?? <CamOnIcon color={iconColor} />
            : icons?.cameraOff ?? <CamOffIcon />}
        </button>
      )}

      <button
        onClick={onHangup}
        aria-label="End call"
        title="End call"
        style={{ ...controlButtonBase, ...toneStyle('danger', primaryColor) }}
      >
        {icons?.hangup ?? <HangUpIcon color="#FFFFFF" />}
      </button>
    </div>
  );
};

const ReconnectingPill: React.FC = () => (
  <span
    role="status"
    style={{
      marginTop: 4,
      alignSelf: 'flex-start',
      padding: '3px 8px',
      borderRadius: 999,
      background: 'rgba(245, 158, 11, 0.9)',
      fontSize: 12,
      color: '#fff',
    }}
  >
    Connection unstable, reconnecting…
  </span>
);

interface ContentProps {
  controller: P2PCallController | null;
  snapshot: P2PSnapshot;
  roomName: string | null;
  elapsed: number | null;
  primaryColor: string;
  icons?: VideoCallIcons;
  onHangup: () => void;
  onToggleMinimize?: () => void;
}

const VideoContent: React.FC<ContentProps> = ({
  controller,
  snapshot,
  roomName,
  elapsed,
  primaryColor,
  icons,
  onHangup,
  onToggleMinimize,
}) => {
  const selfView = useDraggable();
  const title = roomName || 'Video call';
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0B1220',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '14px 20px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          color: '#FFFFFF',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {statusText(snapshot, elapsed)}
        </span>
        {snapshot.status === 'reconnecting' && <ReconnectingPill />}
      </div>

      {onToggleMinimize && (
        <button
          onClick={onToggleMinimize}
          aria-label="Minimize call"
          title="Minimize"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 11,
            width: 36,
            height: 36,
            borderRadius: 999,
            border: 'none',
            background: 'rgba(255,255,255,0.14)',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MinimizeIcon />
        </button>
      )}

      {/* Main stage: avatar placeholder and remote video fill the same box. */}
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
          <ProfileImagePlaceholder name={title} size={120} />
          <div style={{ fontSize: 20, fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
            {snapshot.status === 'connected'
              ? "Peer's camera is off"
              : statusText(snapshot, elapsed)}
          </div>
        </div>
        {snapshot.remoteVideoLive && (
          <VideoSurface
            stream={snapshot.remoteStream}
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

      {/* Local self-view: draggable picture-in-picture. */}
      <div
        onPointerDown={selfView.onPointerDown}
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
          cursor: 'grab',
          touchAction: 'none',
          transform: selfView.pos
            ? `translate(${selfView.pos.x}px, ${selfView.pos.y}px)`
            : undefined,
        }}
      >
        {snapshot.camEnabled && snapshot.localStream ? (
          <VideoSurface
            stream={snapshot.localStream}
            mirrored
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          padding: '16px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Controls
          controller={controller}
          snapshot={snapshot}
          primaryColor={primaryColor}
          onHangup={onHangup}
          includeCamera
          layout="overlay"
          icons={icons}
        />
      </div>
    </div>
  );
};

const AudioContent: React.FC<ContentProps> = ({
  controller,
  snapshot,
  roomName,
  elapsed,
  primaryColor,
  icons,
  onHangup,
  onToggleMinimize,
}) => (
  <div
    style={{
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box',
      background: SURFACE,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      color: TEXT_PRIMARY,
      padding: '28px 24px 24px',
    }}
  >
    <div style={{ fontSize: 14, color: TEXT_MUTED, fontWeight: 400 }}>
      Audio call
    </div>

    {onToggleMinimize && (
      <button
        onClick={onToggleMinimize}
        aria-label="Minimize call"
        title="Minimize"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          borderRadius: 999,
          border: `1px solid ${DIVIDER}`,
          background: SURFACE_MUTED,
          color: TEXT_PRIMARY,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MinimizeIcon color={TEXT_PRIMARY} />
      </button>
    )}

    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        marginTop: 28,
      }}
    >
      <div
        style={{
          width: 168,
          height: 168,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ProfileImagePlaceholder name={roomName || 'Audio call'} size={120} />
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
          {statusText(snapshot, elapsed)}
        </div>
        {snapshot.status === 'reconnecting' && (
          <div
            role="status"
            style={{
              marginTop: 6,
              fontSize: 13,
              color: TEXT_MUTED,
              background: SURFACE_MUTED,
              border: `1px solid ${DIVIDER}`,
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            Connection unstable, reconnecting…
          </div>
        )}
        {!snapshot.micEnabled && (
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

    <div style={{ flexShrink: 0, marginTop: 32 }}>
      <Controls
        controller={controller}
        snapshot={snapshot}
        primaryColor={primaryColor}
        onHangup={onHangup}
        includeCamera={false}
        layout="light"
        icons={icons}
      />
    </div>
  </div>
);

const CompactContent: React.FC<ContentProps> = ({
  controller,
  snapshot,
  roomName,
  elapsed,
  primaryColor,
  icons,
  onHangup,
  onToggleMinimize,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      width: '100%',
      boxSizing: 'border-box',
      color: '#fff',
    }}
  >
    <ProfileImagePlaceholder name={roomName || 'Call'} size={36} />
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {roomName || 'Call'}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {statusText(snapshot, elapsed)}
      </span>
    </div>

    <button
      onClick={() => controller?.toggleMic()}
      aria-label={snapshot.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
      title={snapshot.micEnabled ? 'Mute' : 'Unmute'}
      style={{
        ...controlButtonBase,
        width: 38,
        height: 38,
        ...(snapshot.micEnabled
          ? {
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
            }
          : toneStyle('danger', primaryColor)),
      }}
    >
      {snapshot.micEnabled
        ? icons?.micOn ?? <MicOnIcon />
        : icons?.micOff ?? <MicOffIcon />}
    </button>

    <button
      onClick={onHangup}
      aria-label="End call"
      title="End call"
      style={{
        ...controlButtonBase,
        width: 38,
        height: 38,
        ...toneStyle('danger', primaryColor),
      }}
    >
      {icons?.hangup ?? <HangUpIcon color="#FFFFFF" />}
    </button>

    {onToggleMinimize && (
      <button
        onClick={onToggleMinimize}
        aria-label="Expand call"
        title="Expand"
        style={{
          ...controlButtonBase,
          width: 38,
          height: 38,
          background: 'rgba(255,255,255,0.14)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        <ExpandIcon />
      </button>
    )}
  </div>
);

export interface P2PCallSessionProps {
  kind?: 'audio' | 'video';
  primaryColor?: string;
  icons?: VideoCallIcons;
  minimized?: boolean;
  onToggleMinimize?: () => void;
  onHangup: () => void;
}

export const P2PCallSession: React.FC<P2PCallSessionProps> = ({
  kind = 'video',
  primaryColor = DEFAULT_PRIMARY,
  icons,
  minimized = false,
  onToggleMinimize,
  onHangup,
}) => {
  const controller = useActiveP2PController();
  const snapshot = useP2PSnapshot(controller);
  const roomName = useSelector((state: RootState) => state.call.roomName);
  const connectedAt = useSelector((state: RootState) => state.call.connectedAt);
  const elapsed = useElapsedSince(connectedAt);

  const content: ContentProps = {
    controller,
    snapshot,
    roomName,
    elapsed,
    primaryColor,
    icons,
    onHangup,
    onToggleMinimize,
  };

  return (
    <>
      <RemoteAudio stream={snapshot.remoteStream} />
      {snapshot.notice && !minimized && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            maxWidth: 'min(520px, calc(100% - 96px))',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(229, 57, 53, 0.96)',
            color: '#fff',
            fontSize: 13,
            lineHeight: 1.35,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          }}
        >
          <span style={{ flex: 1 }}>{snapshot.notice}</span>
          <button
            onClick={() => controller?.dismissNotice()}
            aria-label="Dismiss"
            style={{
              border: 'none',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
      {minimized ? (
        <CompactContent {...content} />
      ) : kind === 'audio' ? (
        <AudioContent {...content} />
      ) : (
        <VideoContent {...content} />
      )}
    </>
  );
};
