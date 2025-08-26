import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useMessageHeapState } from './useMessageHeapState';
import { removeMessageFromHeapById } from '../roomStore/roomHeapSlice';
import XmppClient from '../networking/xmppClient';

export const useHeapSender = (client: XmppClient | null) => {
  const dispatch = useDispatch();
  const { queue } = useMessageHeapState();
  const sendingRef = useRef(false);
  const inFlightRef = useRef<Map<string, number>>(new Map());

  const sendHeapMessages = useCallback(async () => {
    if (!client || queue.length === 0) return;
    if (!client.presencesReady) {
      console.warn('Presences not ready, delaying heap send');
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      for (const msg of queue) {
        const lastAttempt = inFlightRef.current.get(msg.id);
        if (lastAttempt && Date.now() - lastAttempt < 15000) {
          continue;
        }
        inFlightRef.current.set(msg.id, Date.now());
        try {
          if (msg.langSource) {
            await client.sendTextMessageWithTranslateTagStanza(
              msg.roomJid,
              msg.user.firstName || msg.user.name?.split(' ')[0] || '',
              msg.user.lastName || msg.user.name?.split(' ')[1] || '',
              '',
              msg.user.walletAddress || '',
              msg.body,
              '',
              !!msg.isReply,
              msg.showInChannel === 'true',
              msg.mainMessage || '',
              msg.langSource
            );
          } else {
            await client.sendMessage(
              msg.roomJid,
              msg.user.firstName || msg.user.name?.split(' ')[0] || '',
              msg.user.lastName || msg.user.name?.split(' ')[1] || '',
              '',
              msg.user.walletAddress || '',
              msg.body,
              '',
              !!msg.isReply,
              !!msg.showInChannel,
              msg.mainMessage,
              msg.id
            );
          }
        } catch (err) {
          console.warn('Failed to send heap message', msg, err);
          inFlightRef.current.delete(msg.id);
        }
      }
    } finally {
      sendingRef.current = false;
    }
  }, [client, queue, dispatch]);

  // Auto-trigger when presences become ready or queue changes
  const prevReadyRef = useRef<boolean>(false);
  useEffect(() => {
    const nowReady = !!client?.presencesReady;
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = nowReady;
    if (!wasReady && nowReady && queue.length > 0) {
      sendHeapMessages();
    }
  }, [client?.presencesReady, queue.length, sendHeapMessages]);

  // Cleanup in-flight entries when messages leave the queue (acked)
  useEffect(() => {
    const currentIds = new Set(queue.map((m) => m.id));
    for (const id of Array.from(inFlightRef.current.keys())) {
      if (!currentIds.has(id)) {
        inFlightRef.current.delete(id);
      }
    }
  }, [queue]);

  return { sendHeapMessages };
};
