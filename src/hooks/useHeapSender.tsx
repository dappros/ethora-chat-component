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
    // Gate on the first wave of the background join sweep, not the whole
    // sweep (minutes for hundreds of rooms). Each message then waits for its
    // OWN room below.
    if (!client.priorityPresencesReady) {
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
          // Rooms the sweep has not reached yet are joined now (deduped with
          // the sweep's own join); a room that cannot be joined keeps its
          // message queued for the next attempt.
          const joined = await client.presenceInRoomStanza(
            msg.roomJid,
            0,
            5000,
            true
          );
          if (!joined) {
            inFlightRef.current.delete(msg.id);
            continue;
          }
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
              msg.langSource,
              undefined,
              msg.mentions
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
              msg.id,
              msg.mentions
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
    const nowReady = !!client?.priorityPresencesReady;
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = nowReady;
    if (!wasReady && nowReady && queue.length > 0) {
      sendHeapMessages();
    }
  }, [client?.priorityPresencesReady, queue.length, sendHeapMessages]);

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
