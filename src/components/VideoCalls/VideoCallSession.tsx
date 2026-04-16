import React, { useEffect, useMemo } from 'react';
import {
  Room,
  RoomConnectOptions,
  RoomOptions,
  Track,
  VideoPresets,
} from 'livekit-client';
import {
  ControlBar,
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';

interface VideoCallSessionProps {
  token: string;
  livekitUrl: string;
  onConnected?: () => void;
  onError?: (message: string) => void;
  onHangup: () => void;
}

const CallContent: React.FC<{ onHangup: () => void }> = ({ onHangup }) => {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );

  const localTrack = tracks.find((track) => track.participant.isLocal);
  const remoteTrack = tracks.find((track) => !track.participant.isLocal);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#0B1020' }}>
        {remoteTrack ? (
          <ParticipantTile trackRef={remoteTrack} />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: '#FFFFFF',
              fontSize: '14px',
            }}
          >
            Connecting to participant...
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          right: 16,
          bottom: 90,
          width: 220,
          height: 124,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111827',
          border: '1px solid #1F2937',
          zIndex: 20,
        }}
      >
        {localTrack ? (
          <ParticipantTile trackRef={localTrack} />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '12px',
            }}
          >
            Camera preview
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
          padding: '8px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ControlBar controls={{ leave: false, screenShare: false }} />
        <button
          onClick={onHangup}
          style={{
            border: 'none',
            borderRadius: 20,
            background: '#EF4444',
            color: '#FFFFFF',
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Hang up
        </button>
      </div>

      <RoomAudioRenderer />
    </div>
  );
};

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
  onConnected,
  onError,
  onHangup,
}) => {
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
        await room.localParticipant.enableCameraAndMicrophone();
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
  }, [room, livekitUrl, token, connectOptions, onConnected, onError]);

  return (
    <RoomContext.Provider value={room}>
      <CallContent onHangup={onHangup} />
    </RoomContext.Provider>
  );
};
