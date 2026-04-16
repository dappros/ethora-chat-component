import React, { useMemo } from 'react';
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

const modalCardStyle: React.CSSProperties = {
  width: 'min(920px, calc(100vw - 32px))',
  height: 'min(680px, calc(100vh - 32px))',
  borderRadius: 16,
  background: '#111827',
  border: '1px solid #374151',
  boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
  overflow: 'hidden',
  position: 'relative',
};

const buttonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

export const VideoCallOverlay: React.FC = () => {
  const dispatch = useDispatch();
  const call = useSelector((state: RootState) => state.call);
  const { config } = useChatSettingState();

  const videoCallsConfig = config?.videoCalls;
  const enabled = videoCallsConfig?.enabled === true;
  const livekitUrl = (videoCallsConfig?.livekitUrl || '').trim();

  const isOpen = enabled && call.phase !== 'idle';
  const title = useMemo(() => {
    if (call.direction === 'incoming') {
      return `Incoming call${call.roomName ? ` from ${call.roomName}` : ''}`;
    }
    return `Calling${call.roomName ? ` ${call.roomName}` : ''}`;
  }, [call.direction, call.roomName]);

  if (!isOpen) {
    return null;
  }

  const showIncomingDecision =
    call.direction === 'incoming' && call.phase === 'ringing-incoming';
  const canRenderSession =
    !!call.token &&
    (call.phase === 'connecting' || call.phase === 'in-call') &&
    !!livekitUrl;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={modalCardStyle}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.25))',
          }}
        >
          <div style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 600 }}>
            {title}
          </div>
          <button
            onClick={() => dispatch(endCall())}
            style={{ ...buttonStyle, background: '#EF4444', color: '#FFFFFF' }}
          >
            Close
          </button>
        </div>

        {showIncomingDecision ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              color: '#F9FAFB',
              gap: 14,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
            <div style={{ color: '#D1D5DB', fontSize: 14 }}>
              Answer to join or decline to dismiss.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => dispatch(declineIncomingCall())}
                style={{
                  ...buttonStyle,
                  background: '#1F2937',
                  color: '#FFFFFF',
                }}
              >
                Decline
              </button>
              <button
                onClick={() => dispatch(acceptIncomingCall())}
                style={{
                  ...buttonStyle,
                  background: '#10B981',
                  color: '#FFFFFF',
                }}
              >
                Answer
              </button>
            </div>
          </div>
        ) : canRenderSession ? (
          <VideoCallSession
            token={call.token as string}
            livekitUrl={livekitUrl}
            onConnected={() => dispatch(setCallPhase('in-call'))}
            onError={(message) => dispatch(setCallError(message))}
            onHangup={() => dispatch(endCall())}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              color: '#F9FAFB',
              gap: 12,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {call.phase === 'requesting'
                ? 'Requesting call token...'
                : call.phase === 'connecting'
                  ? 'Connecting to call...'
                  : 'Call status updated'}
            </div>
            {call.error && (
              <div style={{ color: '#FCA5A5', fontSize: 14 }}>{call.error}</div>
            )}
            {!livekitUrl && (
              <div style={{ color: '#FCA5A5', fontSize: 14 }}>
                Video calls unavailable: missing livekitUrl in config.videoCalls
              </div>
            )}
            {call.phase === 'error' && (
              <button
                onClick={() => dispatch(resetCall())}
                style={{
                  ...buttonStyle,
                  background: '#1F2937',
                  color: '#FFFFFF',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
