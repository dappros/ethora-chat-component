import { useEffect, useRef } from 'react';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useXmppClient } from '../context/xmppProvider';
import { IConfig, IMessage, IRoom } from '../types/types';
import { useDispatch } from 'react-redux';
import useGetNewArchRoom from './useGetNewArchRoom';
import { MESSAGE_HIGHLIGHT_CLASS } from '../styles/classNames';

const countUndefinedText = (arr: IMessage[]) =>
  (Array.isArray(arr) ? arr : []).filter((item) => item?.body === undefined)
    ?.length;
const hasLoadedRoomHistory = (room?: IRoom): boolean => {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  if (!messages.length) return false;
  return messages.some(
    (message) =>
      message?.id !== 'delimiter-new' &&
      message?.pending !== true &&
      !!String(message?.body || '').trim()
  );
};

const PUSH_MESSAGE_ID_KEY = '@ethora/chat-component-pushMessageId';
const PUSH_ROOM_JID_KEY = '@ethora/chat-component-pushRoomJid';
// Took main's tighter timeouts + the new ACTIVE_ROOM_LOADER_HARD_CAP_MS over
// tf-dev's 5000ms presence wait. Main's flow uses prioritizeRoomPresence + a
// hard-cap timer instead of tf-dev's retry-on-empty pattern (commit 62b0b6d
// fix(chat): wait longer for migrated room history joins). Worth confirming
// with Roman that 1200ms is sufficient for the migrated-rooms case tf-dev's
// 5000ms was tuned for.
const ACTIVE_ROOM_PRESENCE_TIMEOUT_MS = 1200;
const ACTIVE_ROOM_FAST_PRESENCE_TIMEOUT_MS = 3000;
const ACTIVE_ROOM_LOADER_HARD_CAP_MS = 3000;
// Backoff for the BACKGROUND /chats/my refetches after joining a room by
// link. Measured against the QA backend, which registers the membership the
// MUC presence created a few seconds after the presence call returns.
const JOIN_SYNC_RETRY_DELAYS_MS = [1000, 2500, 5000];

const scrollToMessage = (messageId: string) => {
  const messageElement = document.querySelector(
    `[data-message-id="${messageId}"]`
  );
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messageElement.classList.add(MESSAGE_HIGHLIGHT_CLASS);
    setTimeout(() => messageElement.classList.remove(MESSAGE_HIGHLIGHT_CLASS), 2000);
  }
};

export const useRoomInitialization = (
  activeRoomJID: string,
  roomsList: Record<string, IRoom>,
  config: IConfig,
  messageLength: number
) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const syncRooms = useGetNewArchRoom();

  // Both effects below want to make sure we've joined activeRoomJID before
  // doing their own work. Without coordination each one calls
  // presenceInRoomStanza independently, which sends a duplicate <presence>
  // join for the same room on every activation. Share the in-flight (or
  // settled) join promise for the *current* activeRoomJID across effects so
  // only one join attempt happens per activation; getDefaultHistory awaits
  // it instead of starting a second one.
  const activeJoinRef = useRef<{ jid: string; promise: Promise<boolean> } | null>(
    null
  );

  // Rooms whose post-join room-list reconcile is already running, so the
  // effect re-running as the list settles doesn't stack up duplicate
  // background retry loops for the same room.
  const joinReconcileRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (client && activeRoomJID) {
      client.setActiveRoomJid(activeRoomJID);
      client.promoteRoomHistory(activeRoomJID);
      // Try fast explicit join for active room right after selection/login.
      const joinPromise = client.presenceInRoomStanza(
        activeRoomJID,
        0,
        ACTIVE_ROOM_FAST_PRESENCE_TIMEOUT_MS,
        true
      );
      activeJoinRef.current = { jid: activeRoomJID, promise: joinPromise };
      joinPromise
        .catch(() => {
          client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
          return false;
        })
        .finally(() => {
          // Pull authoritative room metadata (name, occupant count) via
          // disco#info - this guards against the API/disco#items race that
          // leaves the header showing a raw JID and "0 users".
          try {
            client.getRoomInfoStanza(activeRoomJID);
          } catch {
            /* non-fatal */
          }
        });
    }
    if (client && !activeRoomJID) {
      client.setActiveRoomJid(null);
    }
  }, [client, activeRoomJID]);

  useEffect(() => {
    const activeRoom = roomsList?.[activeRoomJID];
    const shouldLoadActiveHistory =
      !!activeRoomJID && !hasLoadedRoomHistory(activeRoom);

    const getDefaultHistory = async () => {
      if (!client) return;
      if (!activeRoomJID) return;
      // Took main's prioritizeRoomPresence + hardCapTimer flow over tf-dev's
      // double-presence + double-history retry (commit 62b0b6d). Main's
      // approach is functionally equivalent for the migrated-rooms case
      // (the empty-result branch below also calls prioritizeRoomPresence)
      // but cleaner. Verify behaviour with a slow-joining room before merge.
      //
      // Reuse the join kicked off by the sibling effect for this same
      // activation instead of issuing a second presenceInRoomStanza call
      // (see activeJoinRef above).
      const sharedJoin =
        activeJoinRef.current?.jid === activeRoomJID
          ? activeJoinRef.current.promise
          : null;
      const joined = await (
        sharedJoin ||
        client.presenceInRoomStanza(
          activeRoomJID,
          0,
          ACTIVE_ROOM_PRESENCE_TIMEOUT_MS,
          true
        )
      ).catch(() => false);
      if (!joined) {
        client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
      }
      dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
      let forceHidden = false;
      const hardCapTimer = setTimeout(() => {
        forceHidden = true;
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
      }, ACTIVE_ROOM_LOADER_HARD_CAP_MS);

      try {
        const res = await client.getHistoryStanza(
          activeRoomJID,
          30,
          undefined,
          undefined,
          {
            source: 'active',
            coalesceRoom: true,
            skipIfPreloaded: true,
          }
        );
        if (!res?.length) {
          client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
        }
        if (res && countUndefinedText(res) > 0) {
          dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
          await client.getHistoryStanza(
            activeRoomJID,
            20 + countUndefinedText(res),
            Number(res[0].id),
            undefined,
            {
              source: 'active',
              coalesceRoom: true,
            }
          );
        }
      } finally {
        clearTimeout(hardCapTimer);
        if (!forceHidden) {
          dispatch(
            setIsLoading({
              loading: false,
              chatJID: activeRoomJID,
              loadingText: undefined,
            })
          );
        }
      }
    };

    const initialPresenceAndHistory = async () => {
      if (!roomsList[activeRoomJID] && activeRoomJID && client) {
        // Entering a room we are not a member of yet - a QR code, a shared
        // link, a push deep link. The MUC presence join is what makes the
        // server register the membership, so two things have to be true for
        // the room to actually show up in this session:
        //
        //  1. the room list must be refetched AFTER the join settles. The
        //     join used to be fire-and-forget, so the refetch raced it and
        //     almost always lost.
        //  2. the 60s /chats/my cache must be dropped first, or the refetch
        //     just replays the pre-join list.
        //
        // Even then the backend registers the membership a few seconds
        // after our presence call returns, so one refetch is not enough.
        // The retries run in the BACKGROUND: history must not be held
        // hostage to the room list, or the user stares at an empty pane for
        // the whole backoff. Without this the room only appeared after a
        // full page reload, which looked exactly like "joining a public
        // chat by link is broken".
        await client
          .presenceInRoomStanza(
            activeRoomJID,
            0,
            ACTIVE_ROOM_PRESENCE_TIMEOUT_MS,
            false
          )
          .catch(() => false);
        if (config?.newArch === false) {
          await client.getRoomsStanza();
        } else {
          const targetJid = activeRoomJID;
          const wantedName = String(targetJid).split('@')[0];
          const items = await syncRooms(client, config, { force: true });
          const alreadyThere = items?.some((item) => item?.name === wantedName);
          // One background reconcile per room per mount, no matter how many
          // times this effect re-runs as the room list settles.
          if (
            !alreadyThere &&
            !joinReconcileRef.current.has(targetJid)
          ) {
            joinReconcileRef.current.add(targetJid);
            void (async () => {
              for (const delay of JOIN_SYNC_RETRY_DELAYS_MS) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                const retried = await syncRooms(client, config, {
                  force: true,
                }).catch(() => [] as typeof items);
                if (retried?.some((item) => item?.name === wantedName)) return;
              }
            })();
          }
        }
        await getDefaultHistory();
      } else {
        await getDefaultHistory();
      }
    };

    if (Object.keys(roomsList)?.length > 0) {
      if (
        activeRoomJID &&
        !roomsList?.[activeRoomJID] &&
        Object.keys(roomsList).length > 0
      ) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        initialPresenceAndHistory();
      } else if (
        activeRoomJID &&
        shouldLoadActiveHistory
      ) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        getDefaultHistory();
      } else {
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
      }
    } else if (!roomsList?.[activeRoomJID]) {
      initialPresenceAndHistory();
    }

  }, [
    activeRoomJID,
    Object.keys(roomsList).length,
    messageLength,
    roomsList?.[activeRoomJID]?.messages?.length,
  ]);

  // Push-notification deep link: runs on room activation only. It used to
  // live in the effect above, which re-runs on every incoming message and
  // re-read localStorage each time.
  useEffect(() => {
    if (!client || !activeRoomJID || typeof window === 'undefined') return;

    const pendingMessageId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PUSH_MESSAGE_ID_KEY)
        : null;
    const pendingRoomJID =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PUSH_ROOM_JID_KEY)
        : null;

    if (pendingMessageId && (!pendingRoomJID || pendingRoomJID === activeRoomJID)) {
      client
        .getHistoryStanza(activeRoomJID, 30, undefined, undefined, {
          source: 'active',
          coalesceRoom: true,
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => scrollToMessage(pendingMessageId), 200);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(PUSH_MESSAGE_ID_KEY);
            localStorage.removeItem(PUSH_ROOM_JID_KEY);
          }
        });
    }
  }, [client, activeRoomJID]);

  // Default-rooms bootstrap. Previously part of the message-count-keyed
  // effect above: while any default room was missing from roomsList, it
  // re-sent a presence stanza to EVERY default room on EVERY incoming
  // message. Now it reacts only to the room set changing, and each JID is
  // attempted once per mount.
  const attemptedDefaultRoomJoins = useRef<Set<string>>(new Set());
  useEffect(() => {
    const defaultRooms = Array.isArray(config?.defaultRooms)
      ? config.defaultRooms
      : [];
    if (!client || !defaultRooms.length || !roomsList) return;

    const missing = defaultRooms.filter(
      (room) =>
        roomsList[room.jid] === undefined &&
        !attemptedDefaultRoomJoins.current.has(room.jid)
    );
    if (!missing.length) return;

    missing.forEach((room) => {
      attemptedDefaultRoomJoins.current.add(room.jid);
      client.presenceInRoomStanza(room.jid, 0, 1200, false);
    });
    if (config?.newArch === false) {
      client.getRoomsStanza();
    }
  }, [client, config?.defaultRooms, Object.keys(roomsList).length]);
};
