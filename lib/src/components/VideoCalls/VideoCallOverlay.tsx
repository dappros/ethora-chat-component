import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import {
  acceptIncomingCall,
  declineIncomingCall,
  endCall,
  resetCall,
  setCallError,
  setCallPhase,
} from '../../roomStore/callSlice';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { VideoCallSession } from './VideoCallSession';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';
import {
  AudioCallIcon,
  LeaveIcon,
  VideoCallIcon,
} from '../../assets/icons';
import {
  CallSignalState,
  sendCallStateSignal,
} from '../../networking/callTokenStanza';
import Button from '../styled/Button';

// Stop the dial UI sitting forever when the server never broadcasts a
// call-token (offline peer, backend error, etc.). 30s matches the typical
// PSTN ring window.
const OUTGOING_CALL_TIMEOUT_MS = 30000;

const DEFAULT_PRIMARY = '#0052CD';
const TEXT_PRIMARY = '#141414';
const TEXT_MUTED = '#8c8c8c';
const DIVIDER = '#f0f0f0';
const DANGER = '#E53935';

// Keep one set of @keyframes per app. Same trick the chat sidebar uses
// (no styled-components dependency for the overlay file).
const PULSE_STYLE_ID = 'ethora-call-pulse-keyframes';
const ensurePulseKeyframes = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes ethora-call-pulse {
      0% { transform: scale(0.92); opacity: 0.55; }
      70% { transform: scale(1.4); opacity: 0; }
      100% { transform: scale(0.92); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
};

// Convert "#RRGGBB" / "#RGB" to "rgba(r, g, b, alpha)" so the pulse rings
// can use the customer's primary color at a soft transparency without
// pulling in a CSS pre-processor.
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

const overlayBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

// Wide white card for the active video / audio session (full chat
// component look). The pre-connect / ringing card is narrower.
const sessionCardStyle: React.CSSProperties = {
  width: 'min(920px, calc(100vw - 32px))',
  height: 'min(680px, calc(100vh - 32px))',
  borderRadius: 24,
  background: '#fff',
  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
  overflow: 'hidden',
  position: 'relative',
};

const ringingCardStyle: React.CSSProperties = {
  width: 'min(420px, calc(100vw - 32px))',
  padding: '32px',
  borderRadius: 24,
  background: '#fff',
  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 24,
  color: TEXT_PRIMARY,
};

// 56px circle (between the chat's default 40px square Button and the
// classic phone-call 64px circle) — feels native without breaking the
// chat's restrained scale.
const circleActionStyle = (background: string): React.CSSProperties => ({
  width: 56,
  height: 56,
  borderRadius: 999,
  border: 'none',
  background,
  color: '#FFFFFF',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  transition: 'background-color 200ms ease, transform 120ms ease',
});

interface RingingCardProps {
  title: string;
  subtitle: string;
  roomName: string | null;
  kind: 'audio' | 'video';
  variant: 'incoming' | 'outgoing' | 'error';
  primaryColor: string;
  errorMessage?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onHangup?: () => void;
  onDismiss?: () => void;
}

const RingingCard: React.FC<RingingCardProps> = ({
  title,
  subtitle,
  roomName,
  kind,
  variant,
  primaryColor,
  errorMessage,
  onAccept,
  onDecline,
  onHangup,
  onDismiss,
}) => {
  // Sub-bar above the avatar — matches the chat's small grey LabelData
  // type used on profile / chat-info screens.
  return (
    <div style={ringingCardStyle}>
      <div
        style={{
          fontSize: 14,
          color: TEXT_MUTED,
          fontWeight: 400,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>

      <div
        style={{
          position: 'relative',
          width: 160,
          height: 160,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {variant !== 'error' && (
          <>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `2px solid ${hexToRgba(primaryColor, 0.45)}`,
                background: 'transparent',
                animation: 'ethora-call-pulse 1.8s ease-out infinite',
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
                animation: 'ethora-call-pulse 1.8s ease-out infinite',
                animationDelay: '0.9s',
              }}
            />
          </>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ProfileImagePlaceholder
            name={roomName || 'Call'}
            size={120}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
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
          {roomName || (variant === 'incoming' ? 'Unknown caller' : 'Call')}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: TEXT_MUTED,
            fontSize: 14,
          }}
        >
          {kind === 'audio' ? (
            <AudioCallIcon color={TEXT_MUTED} />
          ) : (
            <VideoCallIcon color={TEXT_MUTED} />
          )}
          <span>{subtitle}</span>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            color: DANGER,
            fontSize: 14,
            textAlign: 'center',
            padding: '8px 12px',
            background: 'rgba(229, 57, 53, 0.06)',
            borderRadius: 12,
            border: `1px solid ${hexToRgba(DANGER, 0.18)}`,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 4,
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {variant === 'incoming' && (
          <>
            <button
              onClick={onDecline}
              aria-label="Decline call"
              title="Decline"
              style={{
                ...circleActionStyle(DANGER),
                transform: 'rotate(135deg)',
              }}
            >
              <LeaveIcon color="#FFFFFF" />
            </button>
            <button
              onClick={onAccept}
              aria-label="Accept call"
              title="Accept"
              style={circleActionStyle('#10B981')}
            >
              {kind === 'audio' ? (
                <AudioCallIcon color="#FFFFFF" />
              ) : (
                <VideoCallIcon color="#FFFFFF" />
              )}
            </button>
          </>
        )}
        {variant === 'outgoing' && (
          <button
            onClick={onHangup}
            aria-label="Cancel call"
            title="Cancel"
            style={{
              ...circleActionStyle(DANGER),
              transform: 'rotate(135deg)',
            }}
          >
            <LeaveIcon color="#FFFFFF" />
          </button>
        )}
        {variant === 'error' && (
          <Button
            onClick={onDismiss}
            text="Dismiss"
            style={{ minWidth: 120, width: 'auto', backgroundColor: primaryColor }}
            unstyled
            variant="filled"
          />
        )}
      </div>
    </div>
  );
};

export const VideoCallOverlay: React.FC = () => {
  const dispatch = useDispatch();
  const call = useSelector((state: RootState) => state.call);
  const { config } = useChatSettingState();

  const videoCallsConfig = config?.videoCalls;
  const enabled = videoCallsConfig?.enabled === true;
  const livekitUrl = (videoCallsConfig?.livekitUrl || '').trim();
  const primaryColor = config?.colors?.primary || DEFAULT_PRIMARY;

  const isOpen = enabled && call.phase !== 'idle';

  useEffect(() => {
    if (isOpen) ensurePulseKeyframes();
  }, [isOpen]);

  useEffect(() => {
    if (call.phase !== 'requesting' || call.direction !== 'outgoing') {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch(setCallError('No answer — call timed out'));
    }, OUTGOING_CALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [call.phase, call.direction, call.startedAt, dispatch]);

  const ringingHeader = useMemo(() => {
    if (call.direction === 'incoming') {
      return `Incoming ${call.kind === 'audio' ? 'audio' : 'video'} call`;
    }
    if (call.phase === 'requesting') return 'Calling…';
    if (call.phase === 'connecting') return 'Connecting…';
    if (call.phase === 'error') return 'Call failed';
    return 'Call';
  }, [call.direction, call.phase, call.kind]);

  const ringingSubtitle = useMemo(() => {
    if (call.direction === 'incoming') {
      return call.kind === 'audio' ? 'Audio call' : 'Video call';
    }
    if (call.phase === 'connecting') return 'Connecting to room';
    if (call.phase === 'error') return 'Please try again later';
    return call.kind === 'audio' ? 'Audio call' : 'Video call';
  }, [call.direction, call.kind, call.phase]);

  const terminateCall = useCallback(
    (state: CallSignalState) => {
      sendCallStateSignal(state);
      dispatch(endCall());
    },
    [dispatch]
  );

  const declineCall = useCallback(() => {
    sendCallStateSignal('declined');
    dispatch(declineIncomingCall());
  }, [dispatch]);

  if (!isOpen) {
    return null;
  }

  const showIncomingDecision =
    call.direction === 'incoming' && call.phase === 'ringing-incoming';
  const canRenderSession =
    !!call.token &&
    (call.phase === 'connecting' || call.phase === 'in-call') &&
    !!livekitUrl;
  const showSession = canRenderSession;

  return (
    <div style={overlayBackdropStyle}>
      {showSession ? (
        <div style={sessionCardStyle}>
          <VideoCallSession
            token={call.token as string}
            livekitUrl={livekitUrl}
            kind={call.kind}
            primaryColor={primaryColor}
            onConnected={() => dispatch(setCallPhase('in-call'))}
            onError={(message) => dispatch(setCallError(message))}
            onHangup={() => terminateCall('ended')}
          />
        </div>
      ) : showIncomingDecision ? (
        <RingingCard
          title={ringingHeader}
          subtitle={ringingSubtitle}
          roomName={call.roomName}
          kind={call.kind}
          variant="incoming"
          primaryColor={primaryColor}
          onAccept={() => dispatch(acceptIncomingCall())}
          onDecline={declineCall}
        />
      ) : call.phase === 'error' ? (
        <RingingCard
          title={ringingHeader}
          subtitle={ringingSubtitle}
          roomName={call.roomName}
          kind={call.kind}
          variant="error"
          primaryColor={primaryColor}
          errorMessage={
            call.error ||
            (!livekitUrl
              ? 'Video calls unavailable: missing livekitUrl in config.videoCalls'
              : null)
          }
          onDismiss={() => dispatch(resetCall())}
        />
      ) : (
        <RingingCard
          title={ringingHeader}
          subtitle={ringingSubtitle}
          roomName={call.roomName}
          kind={call.kind}
          variant="outgoing"
          primaryColor={primaryColor}
          onHangup={() => terminateCall('cancelled')}
        />
      )}
    </div>
  );
};
