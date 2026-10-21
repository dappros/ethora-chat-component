import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, store } from '../../roomStore';
import { endCall, setCallError, setCallPhase } from '../../roomStore/callSlice';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import {
  P2PCallController,
  remoteEndNotice,
} from '../../calls/p2p/P2PCallController';
import {
  acquireP2PController,
  createBrowserP2PDeps,
  p2pInbox,
  releaseP2PController,
} from '../../calls/p2p/p2pRuntime';
import {
  reportCallConnected,
  reportCallEnded,
  reportCallRinging,
} from '../../networking/api-requests/callState.api';

// Headless owner of the p2p controller for the call in the redux call slice.
// It builds the controller when a p2p call needs one, wires its events back
// into the slice, and releases it on EVERY way a call can stop (the phase goes
// idle or error, the call changes, the overlay unmounts), which is what keeps
// camera, microphone and the peer connection from leaking.
//
//   caller: the controller exists from the moment the create response says
//           `p2p` and starts at once (media, offer);
//   callee: the controller exists while the incoming call rings, so the
//           caller's offer / candidates / cancel are caught, but it only
//           starts (media, answer) after the user accepts.

const isCurrentCall = (callId: string): boolean => {
  const current = store.getState().call;
  return current.phase !== 'idle' && current.callId === callId;
};

export const P2PCallRunner: React.FC = () => {
  const dispatch = useDispatch();
  const call = useSelector((state: RootState) => state.call);
  const { config } = useChatSettingState();
  const videoCalls = config?.videoCalls;
  const enabled = videoCalls?.enabled === true;

  const callId = call.callId;
  const isIncoming = call.direction === 'incoming';
  const wantsController =
    enabled &&
    call.mode === 'p2p' &&
    !!callId &&
    (isIncoming
      ? call.phase === 'ringing-incoming' ||
        call.phase === 'connecting' ||
        call.phase === 'in-call'
      : call.direction === 'outgoing' &&
        call.iceServers !== null &&
        (call.phase === 'requesting' ||
          call.phase === 'connecting' ||
          call.phase === 'in-call'));
  // The callee waits on the ring screen; everyone else starts right away.
  const shouldStart = wantsController && !(isIncoming && call.phase === 'ringing-incoming');

  // Latest config values for the controller without re-running the effect.
  const optionsRef = useRef({
    startWithMicOn: videoCalls?.startWithMicOn,
    startWithCameraOn: videoCalls?.startWithCameraOn,
  });
  optionsRef.current = {
    startWithMicOn: videoCalls?.startWithMicOn,
    startWithCameraOn: videoCalls?.startWithCameraOn,
  };

  useEffect(() => {
    if (!wantsController || !callId) return;

    const snapshot = store.getState().call;
    const peer = String(snapshot.peerXmppUsername || '').trim();
    const role = snapshot.direction === 'incoming' ? 'callee' : 'caller';
    if (!peer) {
      // Without the peer's address there is nobody to signal.
      dispatch(setCallError('Cannot reach the other participant'));
      return;
    }

    const controller = acquireP2PController(callId, () => {
      const peerLocal = peer.split('@')[0];
      return new P2PCallController(
        {
          callId,
          role,
          kind: snapshot.kind,
          peerLocal,
          iceServers: snapshot.iceServers || [],
          startWithMicOn: optionsRef.current.startWithMicOn,
          startWithCameraOn: optionsRef.current.startWithCameraOn,
        },
        createBrowserP2PDeps({ callId, peerXmppUsername: peer }),
        {
          onNegotiated: () => {
            if (
              role === 'caller' &&
              isCurrentCall(callId) &&
              store.getState().call.phase === 'requesting'
            ) {
              dispatch(setCallPhase('connecting'));
            }
          },
          onConnected: () => {
            if (!isCurrentCall(callId)) return;
            dispatch(setCallPhase('in-call'));
            // One side is enough to start the server-side call timer.
            if (role === 'caller') reportCallConnected(callId);
          },
          onRemoteEnd: (reason) => {
            if (!isCurrentCall(callId)) return;
            const notice = remoteEndNotice(reason);
            dispatch(notice ? setCallError(notice) : endCall());
          },
          onFailed: (message) => {
            if (isCurrentCall(callId)) dispatch(setCallError(message));
          },
          // Whatever ended it, tell the server the call is over (idempotent, so
          // it does not matter that the peer reports it too). A callee that
          // never accepted ends through the decline report instead.
          onDisposed: ({ started }) => {
            if (started) reportCallEnded(callId);
          },
        }
      );
    });

    const detach = p2pInbox.attach(callId, (signal) =>
      controller.receive(signal)
    );
    if (shouldStart) void controller.start();

    return () => {
      detach();
      releaseP2PController(callId);
    };
  }, [wantsController, shouldStart, callId, dispatch]);

  // Callee: the incoming UI is on screen, let the server (and so the caller)
  // know the phone is ringing. Once per call.
  const ringingReportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      enabled &&
      call.mode === 'p2p' &&
      isIncoming &&
      call.phase === 'ringing-incoming' &&
      callId &&
      ringingReportedRef.current !== callId
    ) {
      ringingReportedRef.current = callId;
      reportCallRinging(callId);
    }
  }, [enabled, call.mode, isIncoming, call.phase, callId]);

  return null;
};
