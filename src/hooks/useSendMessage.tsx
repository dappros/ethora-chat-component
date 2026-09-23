import { useCallback, useRef, useEffect, useState } from 'react';
import { useXmppClient } from '../context/xmppProvider';
import { useDispatch, useSelector } from 'react-redux';
import {
  addRoomMessage,
  editRoomMessage,
  removeRoomMessage,
  setEditAction,
} from '../roomStore/roomsSlice';
import { uploadFile } from '../networking/api-requests/auth.api';
import { isE2eeRoom } from '../e2ee';
import { sealFileForUpload } from '../e2ee/fileEnvelope';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  serializeAttachments,
} from '../helpers/attachments';
import { IAttachment } from '../types/types';
import { RootState, store } from '../roomStore';
import { useChatSettingState } from './useChatSettingState';
import { addMessageToHeap } from '../roomStore/roomHeapSlice';
import { v4 as uuidv4 } from 'uuid';
import { useEventHandlers } from './useEventHandlers';
import { ethoraLogger } from '../helpers/ethoraLogger';
import { scheduleAckCatchup } from '../helpers/scheduleAckCatchup';
import { IMentionSpan } from '../types/types';
import { armSendFailureWatchdog } from '../helpers/sendFailureWatchdog';
import { shouldTagOutgoingTranslateSource as shouldTagTranslateSource } from '../utils/translateModePolicy';

const DEFAULT_TIMEOUT_MS = 300000;

// Moved to utils/translateModePolicy so the message bubble's retry control
// can reuse it; re-exported here because that is where hosts and the
// existing gate test import it from.
export { shouldTagOutgoingTranslateSource } from '../utils/translateModePolicy';

interface BlockingConfig {
  enabled: boolean;
  timeout: number;
  onTimeout: (roomJID: string) => void;
}

export const useSendMessage = () => {
  const { config, langSource, translateSendEnabled } = useChatSettingState();
  const { client } = useXmppClient();
  const dispatch = useDispatch();
  const { handleMessageSent, handleMessageFailed } = useEventHandlers(config);
  const emitMessageSent = useCallback((payload: Parameters<typeof handleMessageSent>[0]) => {
    Promise.resolve(handleMessageSent(payload)).catch((error) => {
      console.error('Error in async message sent hook:', error);
    });
  }, [handleMessageSent]);

  const activeRoomJID = useSelector((state: RootState) => state.rooms.activeRoomJID);
  const user = useSelector((state: RootState) => state.chatSettingStore.user);
  const editAction = useSelector((state: RootState) => state.rooms.editAction);
  const rooms = useSelector((state: RootState) => state.rooms.rooms);

  const timeoutTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const sendingMessagesRef = useRef<Set<string>>(new Set());
  const ackCatchupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const [blockedRooms, setBlockedRooms] = useState<Set<string>>(new Set());

  const getBlockingConfig = useCallback((): BlockingConfig | null => {
    const blockingConfig = config?.blockMessageSendingWhenProcessing;
    if (!blockingConfig) return null;

    if (typeof blockingConfig === 'boolean') {
      return {
        enabled: blockingConfig,
        timeout: DEFAULT_TIMEOUT_MS,
        onTimeout: () => {},
      };
    }

    return {
      enabled: blockingConfig.enabled,
      timeout: blockingConfig.timeout ?? DEFAULT_TIMEOUT_MS,
      onTimeout: blockingConfig.onTimeout ?? (() => {}),
    };
  }, [config?.blockMessageSendingWhenProcessing]);

  const updateBlockedRooms = useCallback(
    (roomJID: string, isBlocked: boolean) => {
      setBlockedRooms((prev) => {
        const next = new Set(prev);
        if (isBlocked) {
          next.add(roomJID);
        } else {
          next.delete(roomJID);
        }
        return next;
      });
    },
    []
  );

  const clearRoomTimeout = useCallback(
    (roomJID: string) => {
      const timer = timeoutTimersRef.current.get(roomJID);
      if (timer) {
        clearTimeout(timer);
        timeoutTimersRef.current.delete(roomJID);
        updateBlockedRooms(roomJID, false);
      }
    },
    [updateBlockedRooms]
  );

  const setupRoomTimeout = useCallback(
    (roomJID: string) => {
      const blockingConfig = getBlockingConfig();
      if (!blockingConfig?.enabled) return;

      clearRoomTimeout(roomJID);

      const timer = setTimeout(() => {
        blockingConfig.onTimeout(roomJID);
        if (client && activeRoomJID && roomJID === activeRoomJID) {
          client.recoverRoomPresenceOnly(roomJID).catch(() => {});
        }
        timeoutTimersRef.current.delete(roomJID);
        updateBlockedRooms(roomJID, false);
      }, blockingConfig.timeout);

      updateBlockedRooms(roomJID, true);
      timeoutTimersRef.current.set(roomJID, timer);
    },
    [getBlockingConfig, clearRoomTimeout, updateBlockedRooms, client, activeRoomJID]
  );

  useEffect(() => {
    return () => {
      timeoutTimersRef.current.forEach((timer) => clearTimeout(timer));
      timeoutTimersRef.current.clear();
      sendingMessagesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const blockingConfig = getBlockingConfig();
    if (!blockingConfig?.enabled) {
      timeoutTimersRef.current.forEach((timer) => clearTimeout(timer));
      timeoutTimersRef.current.clear();
      sendingMessagesRef.current.clear();
      setBlockedRooms(new Set());
    }
  }, [getBlockingConfig]);

  useEffect(() => {
    const blockingConfig = getBlockingConfig();
    if (!blockingConfig?.enabled) return;

    Object.keys(rooms || {}).forEach((roomJID) => {
      if (!blockedRooms.has(roomJID)) return;

      const room = rooms[roomJID];
      if (!room || !room.messages || room.messages.length === 0) return;

      const lastMessage = room.messages[room.messages.length - 1];
      const isLastFromUser = lastMessage?.user?.id === user.xmppUsername;

      if (!isLastFromUser) {
        clearRoomTimeout(roomJID);
        updateBlockedRooms(roomJID, false);
      }
    });
  }, [
    rooms,
    user.xmppUsername,
    blockedRooms,
    getBlockingConfig,
    clearRoomTimeout,
    updateBlockedRooms,
  ]);

  /**
   * Checks if message sending is currently blocked for a room
   * @param roomJID - The room JID to check
   * @returns true if sending is blocked, false otherwise
   */
  const isLastMessageFromUserAndProcessing = useCallback(
    (roomJID: string): boolean => {
      const blockingConfig = getBlockingConfig();
      if (!blockingConfig?.enabled) return false;

      if (sendingMessagesRef.current.has(roomJID)) return true;

      return blockedRooms.has(roomJID);
    },
    [getBlockingConfig, blockedRooms]
  );

  const markMessageSending = useCallback(
    (roomJID: string, isSending: boolean) => {
      if (isSending) {
        sendingMessagesRef.current.add(roomJID);
      } else {
        sendingMessagesRef.current.delete(roomJID);
      }
    },
    []
  );

  // A MUC reflects our own message back on its own, and that echo is what
  // clears `pending`. Pulling history after a send is therefore only a
  // safety net for the echo never arriving - see helpers/scheduleAckCatchup
  // for why it must stay one (it used to be a ~6-query-per-send storm).
  const armAckCatchup = useCallback(
    (roomJID: string, messageId: string) => {
      if (!client || !roomJID || !messageId) return;

      const timer = scheduleAckCatchup(client, roomJID, messageId, () =>
        ackCatchupTimersRef.current.delete(messageId)
      );
      ackCatchupTimersRef.current.set(messageId, timer);
    },
    [client]
  );

  // Don't leave catch-up probes armed against a room the user has already
  // navigated away from / a component that unmounted.
  useEffect(() => {
    const timers = ackCatchupTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const sendWithActiveRoomRetry = useCallback(
    async (
      roomJID: string,
      messageId: string,
      sendFn: () => Promise<boolean | undefined>
    ): Promise<boolean> => {
      const firstAttempt = await sendFn();
      if (firstAttempt) {
        return true;
      }

      const isActive = Boolean(activeRoomJID && roomJID === activeRoomJID);
      if (!isActive || !client) {
        return false;
      }

      await client.recoverRoomPresenceOnly(roomJID).catch(() => false);
      const secondAttempt = await sendFn();
      if (!secondAttempt) {
        console.warn(
          `[SendRetry] active_room_retry_failed room=${roomJID} id=${messageId}`
        );
      }
      return Boolean(secondAttempt);
    },
    [activeRoomJID, client]
  );

  const sendMessage = useCallback(
    async (
      message: string,
      activeRoomJID: string,
      isReply?: boolean,
      isChecked?: boolean,
      mainMessage?: string,
      mentions?: IMentionSpan[]
    ) => {
      if (!/\S/.test(String(message || ''))) {
        ethoraLogger.log('Cannot send empty message');
        return;
      }

      if (isLastMessageFromUserAndProcessing(activeRoomJID)) {
        ethoraLogger.log(
          'Cannot send message: Message sending is currently blocked'
        );
        return;
      }

      if (!editAction.isEdit) {
        markMessageSending(activeRoomJID, true);
        setupRoomTimeout(activeRoomJID);
      }

      if (editAction.isEdit) {
        // Unlike a regular send, there is no retry/failed-state machinery
        // for edits (no watchdog, no `failed` flag). If the client cannot
        // even put the stanza on the wire, there is nothing that will ever
        // reconcile an optimistic edit applied now - so skip it entirely.
        // The bubble keeps its pre-edit text and the composer stays open
        // with what the user typed, instead of silently showing an edit
        // that never went anywhere.
        const canIssueEdit = !!client?.checkOnline?.();
        if (!canIssueEdit) {
          console.error('Error editing message: client is not connected');
          handleMessageFailed({
            message,
            roomJID: activeRoomJID,
            error: new Error('Not connected'),
            messageType: 'text',
          });
          return;
        }

        const previousMessage = editAction.roomJid
          ? store
              .getState()
              .rooms.rooms[editAction.roomJid]?.messages.find(
                (msg) => msg.id === editAction.messageId
              )
          : undefined;
        const previousBody = previousMessage?.body;
        const previousIsEdited = previousMessage?.isEdited ?? false;

        // Apply the edit locally right away: this is the same reducer the
        // server echo dispatches (onEditMessage in stanzaHandlers.ts ->
        // editRoomMessage), so a same-text echo lands as a no-op and a
        // different-text echo (another client's edit won the race) simply
        // overwrites this one - one consistent value, never a flicker back
        // to the pre-edit body.
        dispatch(
          editRoomMessage({
            roomJID: editAction.roomJid,
            messageId: editAction.messageId,
            text: message,
          })
        );

        try {
          client?.editMessageStanza(
            editAction.roomJid,
            editAction.messageId,
            message
          );
          dispatch(setEditAction({ isEdit: false }));

          emitMessageSent({
            message,
            roomJID: activeRoomJID,
            user,
            messageType: 'text',
            metadata: {
              isReply,
              isChecked,
              mainMessage,
              editAction,
            },
          });
        } catch (error) {
          // The stanza never made it out - roll the optimistic edit back
          // rather than leave the UI showing a change that was never sent.
          console.error('Error editing message:', error);
          if (previousMessage) {
            dispatch(
              editRoomMessage({
                roomJID: editAction.roomJid,
                messageId: editAction.messageId,
                text: previousBody ?? message,
                isEdited: previousIsEdited,
              })
            );
          }
          handleMessageFailed({
            message,
            roomJID: activeRoomJID,
            error: error as Error,
            messageType: 'text',
          });
        }
        return;
      } else {
        try {
          if (
            shouldTagTranslateSource(
              config?.translates?.enabled,
              translateSendEnabled
            )
          ) {
            const id = `send-translate-message-${uuidv4()}`;
            const optimisticTimestamp = Date.now();
            const optimisticDate = new Date(optimisticTimestamp).toISOString();
            dispatch(
              addRoomMessage({
                roomJID: activeRoomJID,
                message: {
                  user: {
                    ...user,
                    id: user.xmppUsername,
                    name: user.firstName + ' ' + user.lastName,
                  },
                  date: optimisticDate,
                  messageTimestampMs: optimisticTimestamp,
                  body: message,
                  roomJid: activeRoomJID,
                  pending: true,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                  id: id,
                  isReply: (isReply ? 'true' : 'false') as any,
                  showInChannel: (isChecked ? 'true' : 'false') as any,
                  mainMessage: mainMessage || '',
                  mentions,
                },
              })
            );

            dispatch(
              addMessageToHeap({
                id: id,
                user: {
                  ...user,
                  id: user.xmppUsername,
                  name: user.firstName + ' ' + user.lastName,
                },
                date: optimisticDate,
                messageTimestampMs: optimisticTimestamp,
                body: message,
                roomJid: activeRoomJID,
                xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                isReply: isReply || false,
                showInChannel: (isChecked ? 'true' : 'false') as any,
                mainMessage: mainMessage || '',
                langSource: (langSource as any) || 'en',
                mentions,
              })
            );

            // Armed here, not after the await: `sendWithActiveRoomRetry`
            // resolves only once the outbound queue actually processes the
            // entry, and while the socket is down it never does - the exact
            // "stuck on sending forever" report this guards against. The
            // timer therefore runs from the moment the optimistic bubble
            // appears, which is also the moment the user starts waiting.
            armSendFailureWatchdog({
              roomJID: activeRoomJID,
              messageId: id,
              body: message,
            });

            const sendOk = await sendWithActiveRoomRetry(activeRoomJID, id, () =>
              client?.sendTextMessageWithTranslateTagStanza(
                activeRoomJID,
                user.firstName,
                user.lastName,
                '',
                user.walletAddress,
                message,
                '',
                isReply || false,
                isChecked || false,
                mainMessage || '',
                (langSource as any) || 'en',
                id,
                mentions
              )
            );
            if (sendOk) {
              armAckCatchup(activeRoomJID, id);
            }

            emitMessageSent({
              message,
              roomJID: activeRoomJID,
              user,
              messageType: 'text',
              metadata: {
                isReply,
                isChecked,
                mainMessage,
                editAction,
                translateEnabled: true,
                messageId: id,
              },
            });
          } else {
            const id = `send-text-message-${uuidv4()}`;
            const optimisticTimestamp = Date.now();
            const optimisticDate = new Date(optimisticTimestamp).toISOString();
            dispatch(
              addRoomMessage({
                roomJID: activeRoomJID,
                message: {
                  id: id,
                  user: {
                    ...user,
                    id: user.xmppUsername,
                    name: user.firstName + ' ' + user.lastName,
                  },
                  date: optimisticDate,
                  messageTimestampMs: optimisticTimestamp,
                  body: message,
                  roomJid: activeRoomJID,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                  pending: true,
                  isReply: (isReply ? 'true' : 'false') as any,
                  showInChannel: (isChecked ? 'true' : 'false') as any,
                  mainMessage: mainMessage || '',
                  mentions,
                },
              })
            );
            dispatch(
              addMessageToHeap({
                id: id,
                user: {
                  ...user,
                  id: user.xmppUsername,
                  name: user.firstName + ' ' + user.lastName,
                },
                date: optimisticDate,
                messageTimestampMs: optimisticTimestamp,
                body: message,
                roomJid: activeRoomJID,
                xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                isReply: isReply || false,
                showInChannel: (isChecked ? 'true' : 'false') as any,
                mainMessage: mainMessage || '',
                mentions,
              })
            );

            // Same reasoning as the translate branch above.
            armSendFailureWatchdog({
              roomJID: activeRoomJID,
              messageId: id,
              body: message,
            });

            const sendOk = await sendWithActiveRoomRetry(activeRoomJID, id, () =>
              client?.sendMessage(
                activeRoomJID,
                user.firstName,
                user.lastName,
                '',
                user.walletAddress,
                message,
                '',
                isReply || false,
                isChecked || false,
                mainMessage || '',
                id,
                mentions
              )
            );
            if (sendOk) {
              armAckCatchup(activeRoomJID, id);
            }

            emitMessageSent({
              message,
              roomJID: activeRoomJID,
              user,
              messageType: 'text',
              metadata: {
                isReply,
                isChecked,
                mainMessage,
                editAction,
                translateEnabled: false,
                messageId: id,
              },
            });
          }
        } catch (error) {
          console.error('Error sending message:', error);
          handleMessageFailed({
            message,
            roomJID: activeRoomJID,
            error: error as Error,
            messageType: 'text',
          });
        } finally {
          if (!editAction.isEdit) {
            markMessageSending(activeRoomJID, false);
          }
        }
      }
    },
    [
      editAction,
      config,
      user,
      client,
      dispatch,
      langSource,
      isLastMessageFromUserAndProcessing,
      setupRoomTimeout,
      markMessageSending,
      armAckCatchup,
      sendWithActiveRoomRetry,
    ]
  );

  const sendEditMessage = useCallback(
    async (message: string) => {
      if (!/\S/.test(String(message || ''))) {
        ethoraLogger.log('Cannot edit message to empty text');
        return;
      }

      try {
        client?.editMessageStanza(
          editAction.roomJid,
          editAction.messageId,
          message
        );

        dispatch(setEditAction({ isEdit: false }));

        emitMessageSent({
          message,
          roomJID: editAction.roomJid,
          user,
          messageType: 'text',
          metadata: {
            isEdit: true,
            messageId: editAction.messageId,
          },
        });
      } catch (error) {
        console.error('Error editing message:', error);
        handleMessageFailed({
          message,
          roomJID: editAction.roomJid,
          error: error as Error,
          messageType: 'text',
        });
      }
      return;
    },
    [editAction, client, dispatch, user, handleMessageSent, handleMessageFailed]
  );

  const sendMedia = useCallback(
    async (
      data: File | File[] | Blob,
      type: string,
      activeRoomJID: string,
      isReply = false,
      isChecked = false,
      mainMessage = ''
    ) => {
      if (isLastMessageFromUserAndProcessing(activeRoomJID)) {
        ethoraLogger.log('Cannot send media: Message sending is currently blocked');
        return;
      }

      // One send = one message, whatever the caller handed us. Voice notes
      // arrive as a bare Blob, the composer sends an array, and everything
      // written before multi-attach sends a single File.
      const files = (Array.isArray(data) ? data : [data]).slice(
        0,
        MAX_ATTACHMENTS_PER_MESSAGE
      ) as File[];

      if (files.length === 0) {
        ethoraLogger.log('Cannot send media: no files');
        return;
      }

      markMessageSending(activeRoomJID, true);
      setupRoomTimeout(activeRoomJID);

      const id = `send-media-message:${uuidv4()}`;
      const optimisticTimestamp = Date.now();
      const optimisticDate = new Date(optimisticTimestamp).toISOString();
      const first = files[0];
      const optimisticAttachments: IAttachment[] = files.map((file) => ({
        location: '',
        locationPreview: '',
        mimetype: file.type || type,
        originalName: file.name,
        fileName: file.name,
        size: file.size?.toString(),
      }));

      if (!config?.disableSentLogic) {
        dispatch(
          addRoomMessage({
            roomJID: activeRoomJID,
            message: {
              id: id,
              body: 'media',
              roomJid: activeRoomJID,
              date: optimisticDate,
              messageTimestampMs: optimisticTimestamp,
              user: {
                ...user,
                id: user.xmppUsername,
                name: user.firstName + ' ' + user.lastName,
              },
              pending: true,
              isDeleted: false,
              xmppId: id,
              xmppFrom: `${activeRoomJID}/${user.id}`,
              isSystemMessage: 'false',
              isMediafile: 'true',
              fileName: first.name,
              location: '',
              locationPreview: '',
              mimetype: type,
              originalName: first.name,
              size: first.size?.toString(),
              attachments: optimisticAttachments,
              isReply,
              showInChannel: `${isChecked}`,
              mainMessage,
            },
          })
        );
      }

      try {
        // POST /files/ already answers with a `results` array, so the whole
        // group is one request - and one failure boundary.
        const mediaData = new FormData();

        // In an e2ee room the attachment is sealed before it leaves the
        // browser: what goes up is opaque bytes under a random name, so the
        // server never sees the file, its type or its filename, and never
        // renders a thumbnail of it into a bucket. The per-file keys ride in
        // the OMEMO-encrypted <body> of the stanza below - `location` and the
        // rest of <data> stay readable, and now say nothing.
        const e2ee = isE2eeRoom(activeRoomJID);
        let sealedKeys: string[] | undefined;
        let sealedTypes: string[] | undefined;

        if (e2ee) {
          const sealed = await Promise.all(files.map(sealFileForUpload));
          sealed.forEach((item) =>
            mediaData.append(
              'files',
              new File([item.ciphertext as BlobPart], item.filename, {
                type: 'application/octet-stream',
              })
            )
          );
          sealedKeys = sealed.map((item) => item.keyMaterial);
          // A voice note is a bare MediaRecorder Blob with no `type`, so the
          // seal records octet-stream for it. The caller's `type` argument
          // ('audio/') is the only thing that knows better, and the receiver
          // needs it to show a player instead of a download chip. Only used
          // as a fallback, so a real File's own type always wins.
          sealedTypes = sealed.map((item) =>
            item.mimetype === 'application/octet-stream' && type
              ? type
              : item.mimetype
          );
        } else {
          files.forEach((file) => mediaData.append('files', file));
        }

        const response = await uploadFile(mediaData, activeRoomJID, {
          clientEncrypted: e2ee,
        });

        const results: any[] = Array.isArray(response?.data?.results)
          ? response.data.results
          : [];
        if (results.length === 0) {
          throw new Error('media_upload_empty_response');
        }

        const attachments: IAttachment[] = results.map((item) => ({
          attachmentId: item?._id,
          location: item?.location,
          locationPreview: item?.locationPreview,
          mimetype: item?.mimetype,
          originalName: item?.originalname,
          fileName: item?.filename,
          size: item?.size?.toString?.() ?? item?.size,
          duration: item?.duration,
          ownerKey: item?.ownerKey,
          userId: item?.userId,
          createdAt: item?.createdAt,
          updatedAt: item?.updatedAt,
          expiresAt: item?.expiresAt,
          isVisible: item?.isVisible,
          isPrivate: item?.isPrivate,
        }));

        const [head] = results;
        const messagePayload = {
          firstName: user.firstName,
          lastName: user.lastName,
          walletAddress: user.walletAddress,
          createdAt: head.createdAt,
          expiresAt: head.expiresAt,
          fileName: head.filename,
          isVisible: head?.isVisible,
          location: head.location,
          locationPreview: head.locationPreview,
          mimetype: head.mimetype,
          originalName: head?.originalname,
          ownerKey: head?.ownerKey,
          size: head.size,
          duration: head?.duration,
          updatedAt: head?.updatedAt,
          userId: head?.userId,
          attachmentId: head?._id,
          // Only stamped when there is genuinely more than one file, so
          // single-file stanzas stay byte-identical to what we sent before.
          attachments:
            attachments.length > 1 ? serializeAttachments(attachments) : undefined,
          wrappable: true,
          roomJid: activeRoomJID,
          showInChannel: isChecked,
          isReply,
          mainMessage,
          isPrivate: head?.isPrivate,
          __v: head.__v,
          // Consumed by sendMediaMessage, which puts them inside the encrypted
          // <body>. Never stamped onto <data>: that rides in the clear.
          e2eeKeys: sealedKeys,
          e2eeTypes: sealedTypes,
        };

        const mediaSent = await sendWithActiveRoomRetry(
          activeRoomJID,
          id,
          () => client?.sendMediaMessageStanza(activeRoomJID, messagePayload, id)
        );
        if (!mediaSent) {
          throw new Error('media_send_failed');
        }

        emitMessageSent({
          message: 'media',
          roomJID: activeRoomJID,
          user,
          messageType: 'media',
          metadata: {
            isReply,
            isChecked,
            mainMessage,
            fileData: Array.isArray(data) ? data : first,
            fileType: type,
            messageId: id,
            uploadResults: results,
          },
        });
      } catch (error) {
        console.error('Upload failed:', error);
        // The optimistic bubble would otherwise sit at "sending..." forever.
        if (!config?.disableSentLogic) {
          dispatch(removeRoomMessage({ roomJID: activeRoomJID, messageId: id }));
        }
        handleMessageFailed({
          message: 'media',
          roomJID: activeRoomJID,
          error: error as Error,
          messageType: 'media',
        });
      } finally {
        markMessageSending(activeRoomJID, false);
      }
    },
    [
      client,
      config,
      user,
      isLastMessageFromUserAndProcessing,
      handleMessageSent,
      handleMessageFailed,
      setupRoomTimeout,
      markMessageSending,
      emitMessageSent,
      sendWithActiveRoomRetry,
    ]
  );

  return {
    sendMessage,
    sendMedia,
    sendEditMessage,
    isLastMessageFromUserAndProcessing,
  };
};
