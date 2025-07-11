import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useMessageHeapState } from './useMessageHeapState';
import { popMessageFromHeap } from '../roomStore/roomHeapSlice';
import { IMessage } from '../types/types';
import XmppClient from '../networking/xmppClient';

export const useHeapSender = (client: XmppClient | null) => {
  const dispatch = useDispatch();
  const { heap } = useMessageHeapState();

  const sendHeapMessages = useCallback(async () => {
    if (!client || heap.size === 0) return;
    if (!client.presencesReady) {
      console.warn('Presences not ready, delaying heap send');
      return;
    }
    for (const [_, msg] of heap.entries()) {
      try {
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
        dispatch(popMessageFromHeap());
      } catch (err) {
        console.warn('Failed to send heap message', msg, err);
      }
    }
  }, [client, heap, dispatch]);

  return { sendHeapMessages };
};
