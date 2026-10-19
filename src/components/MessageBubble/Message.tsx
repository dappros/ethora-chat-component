import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { IUser, MessageProps } from '../../types/types';
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhotoContainer,
  MessageFooter,
  REACTION_HANG_PX,
} from '../styled/StyledComponents';
import MediaMessage from '../MainComponents/MediaMessage';
import MediaCaption from './MediaCaption';
import {
  shallowEqual,
  useDispatch,
  useSelector,
  useStore,
} from 'react-redux';
import {
  computeReceiptState,
  getReceiptIndex,
  NO_RECEIPTS,
  receiptStateEqual,
  ReceiptState,
} from '../../helpers/receiptState';
import { messageTimestamp } from '../../networking/receiptsPolicy';
import { RootState } from '../../roomStore';
import { createUserNameFromSetUser } from '../../helpers/createUserNameFromSetUser';
import { lookupUserEntry } from '../../helpers/userEntry';

import { MessageAvatarPhoto } from './MessageAvatarPhoto';
import MessageInteractions from './MessageInteractions';
import {
  setActiveModal,
  setDeleteModal,
  setSelectedUser,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { BottomReplyContainer } from './BottomReplyContainer';
import {
  removeRoomMessage,
  setActiveMessage,
  setEditAction,
} from '../../roomStore/roomsSlice';
import { MessageReply } from './MessageReply';
import { DeletedMessage } from './DeletedMessage';
import { useXmppClient } from '../../context/xmppProvider';
import { MessageReaction } from './MessageReaction';
import MessageTranslate from './MessageTranslate';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { DoubleTick, LockOffIcon, SingleTick } from '../../assets/icons';
import { parseMessageBody } from '../../helpers/parseMessageBody';
import URLPreviewCard from './URLPreviewCard';
import { useMessageHeapState } from '../../hooks/useMessageHeapState';
import { parseMessageReference } from '../../helpers/parseMessageReference';
import { useMessageTranslation } from '../../hooks/useMessageTranslation';
import TranslatedMessageBody from './TranslatedMessageBody';
import { useT } from '../../i18n/useT';
import QuickReplies from './QuickReplies';
import {
  parseQuickReplies,
  hasAnsweredQuickReplies,
  QuickReply,
} from '../../helpers/quickReplies';
import { useSendMessage } from '../../hooks/useSendMessage';
import { isOpaqueXmppUserId } from '../../helpers/xmppUsername';
import {
  requestUsers,
  subscribeUserResolver,
  getUserLookupStatus,
} from '../../helpers/userResolver';
import { parseBotMarkup, stripBotMarkup } from '../../helpers/botMarkup';
import styled from 'styled-components';
import {
  resolveTranslateMode,
  shouldTagOutgoingTranslateSource,
} from '../../utils/translateModePolicy';
import { resendMessage } from '../../utils/resendMessage';
import { hasMediaRetry, retryMediaSend } from '../../helpers/mediaSendRetry';
import { getMessageAttachments, isMediaMessage } from '../../helpers/attachments';
import { getMessageCaption } from '../../helpers/caption';
import {
  getMediaBlockMode,
  getMediaTimeLayout,
} from '../../helpers/mediaBubble';

// Inherits CustomMessageTimestamp's colour/size - just the WhatsApp/
// Telegram-style italic to read as a tag, not a second timestamp.
// Shown instead of a name while the sender's profile is still being looked
// up: short and fixed so the bubble does not jump when the name arrives.
const SENDER_NAME_PLACEHOLDER = '\u2026';

// Stable empty list for tooltip names, so a bubble with nothing to name
// keeps the same reference across store updates.
const NO_NAMES: string[] = [];

const EditedLabel = styled.span`
  font-style: italic;
`;

// Danger tone comes from a themable custom property so a host can retint it
// (and so nothing here hardcodes a red). The literal is only the fallback
// for hosts that never define the variable.
const FailedNotice = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  color: var(--ethora-color-danger, #d92d20);
  font-family: var(--ethora-font-family, 'Open Sans', sans-serif);
  font-size: var(--ethora-font-size-xs, 0.75rem);
`;

const FailedNote = styled.div`
  margin-top: 2px;
  text-align: right;
  color: var(--ethora-color-danger, #d92d20);
  font-family: var(--ethora-font-family, 'Open Sans', sans-serif);
  font-size: var(--ethora-font-size-xs, 0.75rem);
`;

const RetryButton = styled.button`
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
  padding: 0 8px;

  &:hover:not(:disabled) {
    opacity: 0.75;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const firstUrlRegex =
  /(https?:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+)/;

// Hover-only (no click) status tooltip on the sent/delivered/seen tick -
// same CSS-hover convention as MessageReaction.tsx's emoji tooltip.
const TickStatusWrapper = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;

  &:hover .tick-tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const TickTooltip = styled.span`
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s;
  position: absolute;
  bottom: 120%;
  right: 0;
  background-color: #333;
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  width: max-content;
  max-width: 260px;
  text-align: left;
  pointer-events: none;
  z-index: 1;
`;

/** One line of the tick tooltip; a large-group tooltip stacks two of these. */
const TickTooltipLine = styled.span`
  display: block;
  white-space: normal;
  overflow-wrap: anywhere;
`;

/**
 * Groups with more than this many other members get count-based receipts
 * ("Read by 12 of 467") instead of a list of names. Names only make sense
 * for a handful of people; in a large room they read as if only those
 * people got the message.
 */
const SMALL_GROUP_MAX_OTHERS = 5;

/** Read-receipt tick size, in px: it centres on the 12px time's x-height. */
const TICK_SIZE_PX = 14;


const Message: React.FC<MessageProps> = forwardRef<
  HTMLDivElement,
  MessageProps
>(({ message, isUser, isReply, isLastInGroup: lastInRun }, ref) => {
  const { client } = useXmppClient();
  const { sendMessage } = useSendMessage();
  const t = useT();
  const { user, config, langSource, translateMode, translateSendEnabled } =
    useChatSettingState();
  const { idSet } = useMessageHeapState();
  // Reads of rooms.usersSet below are narrow: a selector per entry this
  // bubble renders, and `store.getState()` at event/tooltip time. The bubble
  // never subscribes to the whole map.
  const store = useStore<RootState>();
  const interactionsDisabled = Boolean(config?.disableInteractions);
  const profilesDisabled = Boolean(config?.disableProfilesInteractions);

  const effectiveTranslateMode = resolveTranslateMode(
    config?.translates,
    translateMode
  );
  const isAutoTranslate =
    !!config?.translates?.enabled && effectiveTranslateMode !== 'manual';
  const readerLocale =
    config?.translates?.readerLocale || config?.i18n?.locale || langSource;
  const translationDisplay = useMessageTranslation(
    message,
    readerLocale,
    isAutoTranslate
  );

  // Read sender name live from usersSet so user-update stanzas trigger immediate re-render.
  // Select ONLY this sender's entry: subscribing to the whole usersSet map
  // re-rendered every mounted bubble on every insertUsers dispatch.
  const senderUserId = message.user?.id ?? '';
  const senderLocal = senderUserId.split('@')[0];
  const senderEntry = useSelector(
    (state: RootState) =>
      lookupUserEntry(state.rooms.usersSet, senderLocal) ??
      lookupUserEntry(state.rooms.usersSet, senderUserId)
  );
  // A usersSet hit with blank firstName/lastName (a profile that hasn't
  // finished populating yet - the common case right after someone new
  // registers) is worth no more than a miss. Falling straight to `senderLocal`
  // in that case is what showed the raw xmpp id as the sender's name instead
  // of the name the sender already stamped on the message itself
  // (message.user.name, resolved by resolveSenderDisplayName/enrichMessageAuthor
  // when the message was inserted) - try that before giving up to the id.
  const usersSetDisplayName = senderEntry
    ? `${senderEntry.firstName ?? ''} ${senderEntry.lastName ?? ''}`.trim()
    : '';
  // Neither `message.user?.name` nor `senderLocal` is guaranteed readable:
  // a message carried over from before the opaque-id fix (persisted state)
  // can still have the raw xmpp id baked in as its name, and `senderLocal`
  // always IS the raw id. Showing either as a "name" is the bug this whole
  // change is about - fall through to 'Unknown' instead, same as a sender
  // usersSet has never heard of.
  // 'Deleted User' baked into message.user.name only means "not resolved at
  // insert time"; whether the user is truly gone is the resolver's 404 below.
  const safeMessageName =
    message.user?.name &&
    message.user.name !== 'Deleted User' &&
    !isOpaqueXmppUserId(message.user.name)
      ? message.user.name
      : '';
  const safeSenderLocal = isOpaqueXmppUserId(senderLocal) ? '' : senderLocal;
  // Ask the backend for a sender nobody has told us about (big rooms ship
  // only 30 members). The resolver debounces and de-duplicates.
  useEffect(() => {
    if (!senderEntry && senderLocal) requestUsers([senderLocal]);
  }, [senderEntry, senderLocal]);
  const lookupStatus = useSyncExternalStore(
    subscribeUserResolver,
    () => getUserLookupStatus(senderLocal),
    () => 'pending' as const
  );
  // The sender's own name stamped on the stanza's <data> by clients of this
  // SDK. It is only the LAST resort (older backends and clients), used once
  // the lookup has finished without a name, and it is never written into
  // usersSet. insertion-time enrichment may have baked it into
  // message.user.name, so a message name equal to it counts as <data>, not
  // as a member/usersSet name.
  const dataFull = String((message as any)?.fullName || '').trim();
  const dataComposed =
    dataFull ||
    `${String((message as any)?.senderFirstName || '').trim()} ${String(
      (message as any)?.senderLastName || ''
    ).trim()}`.trim();
  const trustedMessageName =
    safeMessageName && safeMessageName !== dataComposed ? safeMessageName : '';
  const lookupPending = lookupStatus === 'pending';
  // Chain: usersSet (member or lookup result) > a name from a member/seed >
  // loading placeholder while the lookup runs > <data> name > readable id >
  // Unknown user (Deleted User only when the backend confirmed 404).
  const senderNamePending =
    !usersSetDisplayName && !trustedMessageName && lookupPending;
  const unresolvedPlaceholder =
    lookupStatus === 'notfound' ? 'Deleted User' : t('user.unknown');
  const senderDisplayName = senderNamePending
    ? SENDER_NAME_PLACEHOLDER
    : usersSetDisplayName ||
      trustedMessageName ||
      dataComposed ||
      safeSenderLocal ||
      unresolvedPlaceholder;
  // usersSet first, same reason as the name above: a message restored from
  // the persist cache never carries an avatar URL at all (profileImage is
  // deliberately absent from PERSISTED_MESSAGE_USER_FIELDS - it's exactly
  // the bulky per-message duplicate usersSet exists to replace), and even
  // a freshly-received live message only carries the sender's avatar as of
  // whenever THEY last set it, not whenever it's actually rendered. Live-
  // measured on a real account: usersSet had a profileImage for 2,524 of
  // 3,483 known users, while `message.user.profileImage` was empty on
  // nearly every historical message - reading only the message-level copy
  // is why senders you'd already resolved a name for still showed a blank
  // initials circle instead of their photo.
  const senderProfileImage =
    senderEntry?.profileImage || message.user?.profileImage || '';
  const referencedMessage = parseMessageReference(message.mainMessage);

  const dispatch = useDispatch();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  } | null>(
    interactionsDisabled
      ? null
      : {
          visible: false,
          x: 0,
          y: 0,
        }
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // How far the reaction chips hang below the bubble, measured by
  // MessageReaction, so the row reserves room for every wrapped chip row.
  const [reactionHang, setReactionHang] = useState(REACTION_HANG_PX);

  // A media bubble previews a link only from its caption. Its body is the
  // placeholder or a legacy echo of the file URL, and treating that as a link
  // pulled a preview card under a picture-only bubble (and with it the time
  // out of the overlay), sometimes and not other times.
  const isMediaBubble = isMediaMessage(message);
  const captionText = isMediaBubble ? getMessageCaption(message) : undefined;
  const previewSource = isMediaBubble ? captionText : message?.body;
  useEffect(() => {
    if (previewSource && typeof previewSource === 'string') {
      const match = previewSource.match(firstUrlRegex);
      setPreviewUrl(match ? match[0] : null);
    } else {
      setPreviewUrl(null);
    }
  }, [previewSource]);

  const handleContextMenu = (event: React.MouseEvent | React.TouchEvent) => {
    if (interactionsDisabled) return;

    event.preventDefault();

    const x = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const y = 'touches' in event ? event.touches[0].clientY : event.clientY;

    // Just record the click/tap point here. The menu's real size depends on
    // which rows render (Reply/Copy/Edit/Delete are conditional) and on
    // whether the emoji picker is open, so MessageInteractions measures its
    // own rendered container and clamps/flips it against the viewport
    // instead of us guessing a fixed menu size up front.
    setContextMenu({
      visible: true,
      x,
      y,
    });
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (event: React.TouchEvent) => {
    timerRef.current = setTimeout(() => {
      handleContextMenu(event);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const avatarClickable =
    !profilesDisabled &&
    !senderNamePending &&
    senderDisplayName !== 'Deleted User' &&
    senderDisplayName !== unresolvedPlaceholder;

  const handleUserAvatarClick = (user: IUser): void => {
    if (profilesDisabled || user?.name === 'Deleted User') return;
    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    // The bubble's own avatar/name already read from usersSet (senderEntry),
    // because message.user is a stale copy taken at send time: profileImage is
    // usually empty, description is never there, and the name may be older
    // than the sender's current profile. Dispatching message.user as-is made
    // the right-side profile show an initials placeholder and empty About
    // even while the clicked avatar was displaying the real photo. Enrich
    // from senderEntry when we have it, falling back to message.user per
    // field - same chain the bubble renders with.
    const enriched: IUser = {
      ...user,
      firstName: senderEntry?.firstName ?? (user as any)?.firstName,
      lastName: senderEntry?.lastName ?? (user as any)?.lastName,
      name:
        (senderEntry
          ? `${senderEntry.firstName ?? ''} ${senderEntry.lastName ?? ''}`.trim()
          : '') ||
        user?.name,
      profileImage: senderEntry?.profileImage ?? (user as any)?.profileImage,
      description: senderEntry?.description ?? (user as any)?.description,
      xmppUsername:
        senderEntry?.xmppUsername ?? (user as any)?.xmppUsername ?? senderLocal,
      userJID: senderEntry?.jid ?? user?.userJID,
    };
    dispatch(setSelectedUser(enriched));
  };

  // Opens the same profile modal a message-bubble avatar click does (see
  // handleUserAvatarClick above), for a clicked @-mention. Resolves the
  // mentioned user's live data from usersSet when available (fresher name/
  // avatar than whatever was true at send time), falling back to the
  // jid/name recorded in the mention itself.
  const handleMentionClick = (mention: { jid: string; name: string }): void => {
    if (profilesDisabled || !mention?.jid) return;
    const localKey = mention.jid.split('@')[0];
    // Read at click time, not subscribed: the profile opened is the latest.
    const usersSet = store.getState().rooms.usersSet;
    const enriched =
      lookupUserEntry(usersSet, mention.jid) ??
      lookupUserEntry(usersSet, localKey);
    const [firstName, ...rest] = (
      enriched
        ? `${enriched.firstName ?? ''} ${enriched.lastName ?? ''}`.trim()
        : mention.name
    ).split(' ');

    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    dispatch(
      setSelectedUser({
        id: localKey,
        firstName: enriched?.firstName || firstName || mention.name,
        lastName: enriched?.lastName || rest.join(' '),
        name: enriched
          ? `${enriched.firstName ?? ''} ${enriched.lastName ?? ''}`.trim()
          : mention.name,
        userJID: mention.jid,
        profileImage: enriched?.profileImage,
      } as IUser)
    );
  };

  const handleReplyMessage = () => {
    dispatch(setEditAction({ isEdit: false }));

    if (!isReply && message.mainMessage) {
      const messageCore = parseMessageReference(message.mainMessage);
      if (!messageCore?.id || !messageCore?.roomJid) {
        return;
      }
      return dispatch(
        setActiveMessage({ id: messageCore.id, chatJID: messageCore.roomJid })
      );
    }

    return dispatch(
      setActiveMessage({ id: message.id, chatJID: message.roomJid })
    );
  };

  const handleDeleteMessage = () => {
    dispatch(
      setDeleteModal({
        isDeleteModal: true,
        roomJid: message.roomJid,
        messageId: message.id,
      })
    );

    // client.deleteMessageStanza(message.roomJid, message.id);
  };

  const handleEditMessage = () => {
    dispatch(
      setEditAction({
        isEdit: true,
        roomJid: message.roomJid,
        messageId: message.id,
        text: message.body,
      })
    );
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
    });
  };

  const handleReactionMessage = (emoji: string) => {
    if (!message.reaction) {
      return client.sendMessageReactionStanza(
        message.id,
        message.roomJid,
        [emoji],
        { firstName: user.firstName, lastName: user.lastName }
      );
    }
    if (
      message.reaction &&
      message.reaction[user.xmppUsername] &&
      message.reaction[user.xmppUsername].emoji.includes(emoji)
    ) {
      const filterEmoji = message.reaction[user.xmppUsername].emoji.filter(
        (reaction) => reaction !== emoji
      );

      return client.sendMessageReactionStanza(
        message.id,
        message.roomJid,
        filterEmoji,
        { firstName: user.firstName, lastName: user.lastName }
      );
    }

    client.sendMessageReactionStanza(
      message.id,
      message.roomJid,
      [...(message.reaction[user.xmppUsername]?.emoji || []), emoji],
      { firstName: user.firstName, lastName: user.lastName }
    );
  };

  const isPending = idSet.has(message.id) || message?.pending || false;

  // Delivery/read tick status (XEP-0184/XEP-0333) - "seen" wins over
  // "delivered" wins over plain "sent". lastDisplayedByUser is a room-level
  // watermark (last message id each user has displayed), so "seen" means
  // some other user's watermark is at-or-after this message. The selector
  // resolves the reader list itself and returns a small array (compared
  // shallowly), so a bubble does not re-render on every new room message,
  // and only own messages do the lookup at all.
  // Read/delivery state for this own bubble (XEP-0184/XEP-0333). The room
  // lookup tables are built once per messages array and shared by every
  // bubble, so each bubble only walks its viewers. The selector returns small
  // arrays compared by content, so the bubble re-renders only when who has
  // read or received it actually changes.
  const receipts = useSelector(
    (state: RootState): ReceiptState => {
      if (!isUser) return NO_RECEIPTS;
      const room = state.rooms.rooms[message.roomJid];
      if (!room?.messages?.length) return NO_RECEIPTS;
      return computeReceiptState({
        index: getReceiptIndex(room.messages),
        messageId: message.id,
        messageTs: messageTimestamp(message),
        receivedBy: message.receivedBy,
        lastReceivedByUser: room.lastReceivedByUser,
        lastDisplayedByUser: room.lastDisplayedByUser,
        selfId: user?.xmppUsername,
      });
    },
    receiptStateEqual
  );
  const seenBy = receipts.seenBy;
  const deliveredBy = receipts.deliveredBy;
  const roomType = useSelector(
    (state: RootState) => state.rooms.rooms[message.roomJid]?.type
  );
  const isGroupRoom = roomType !== 'private';
  // True member count of the room (members can be truncated for big rooms,
  // usersCnt is the total). A number, so the bubble re-renders only when the
  // size itself changes.
  const roomSize = useSelector((state: RootState): number => {
    const room = state.rooms.rooms[message.roomJid];
    return Math.max(room?.usersCnt ?? 0, room?.members?.length ?? 0);
  });

  const me = user?.xmppUsername;
  const receivedBy = useMemo(
    () => deliveredBy.filter((xmppUsername) => xmppUsername !== me),
    [deliveredBy, me]
  );
  const status: 'sent' | 'delivered' | 'seen' =
    seenBy.length > 0 ? 'seen' : receivedBy.length > 0 ? 'delivered' : 'sent';

  // Other members in the room (the sender excluded). The true size comes
  // from usersCnt because members is capped for big rooms. With no size
  // known, count the other users we have receipts or read marks from.
  const othersTotal = useMemo(() => {
    const knownOthers = new Set<string>([...receivedBy, ...seenBy]);
    return Math.max(
      roomSize > 0 ? roomSize - 1 : knownOthers.size,
      receivedBy.length,
      seenBy.length
    );
  }, [receivedBy, seenBy, roomSize]);

  // Reader names are only needed for a small group tooltip. They are read
  // here as a short list of strings (shallow-compared), so the bubble
  // re-renders when a named reader is renamed or the list changes, and not on
  // any other usersSet change. Large groups and 1:1 rooms select nothing.
  const namesShown = isGroupRoom && othersTotal <= SMALL_GROUP_MAX_OTHERS;
  const seenNames = useSelector(
    (state: RootState): string[] =>
      namesShown && status === 'seen'
        ? seenBy.map((xmppUsername) =>
            createUserNameFromSetUser(state.rooms.usersSet, xmppUsername)
          )
        : NO_NAMES,
    shallowEqual
  );
  const deliveredNames = useSelector(
    (state: RootState): string[] =>
      namesShown && status === 'delivered'
        ? receivedBy.map((xmppUsername) =>
            createUserNameFromSetUser(state.rooms.usersSet, xmppUsername)
          )
        : NO_NAMES,
    shallowEqual
  );

  const tickInfo = useMemo(() => {
    if (!isGroupRoom) {
      const tooltip =
        status === 'seen'
          ? t('message.receipt.read')
          : status === 'delivered'
            ? t('message.receipt.delivered')
            : t('message.receipt.sent');
      return { status, lines: [tooltip] };
    }

    if (othersTotal <= SMALL_GROUP_MAX_OTHERS) {
      const tooltip =
        status === 'seen'
          ? t('message.receipt.readBy', {
              names: seenNames.join(', '),
            })
          : status === 'delivered'
            ? t('message.receipt.deliveredTo', {
                names: deliveredNames.join(', '),
              })
            : t('message.receipt.sent');
      return { status, lines: [tooltip] };
    }

    // Large group: counts only, never names. "seen" means at least one
    // reader, "delivered" at least one receipt.
    const readBy = seenBy.length;
    const sentTo = receivedBy.length;
    const total = othersTotal;
    const lines: string[] = [];
    if (readBy > 0) {
      lines.push(t('message.receipt.readByCount', { count: readBy, total }));
    }
    if (sentTo > 0) {
      lines.push(
        t('message.receipt.deliveredToCount', { count: sentTo, total })
      );
    }
    if (lines.length === 0) {
      lines.push(t('message.receipt.sent'));
    }
    return { status, lines };
  }, [
    status,
    seenBy,
    receivedBy,
    seenNames,
    deliveredNames,
    isGroupRoom,
    othersTotal,
    t,
  ]);
  const readStatus = tickInfo.status;

  // "failed" is only ever a prompt to retry, never a claim the message was
  // not delivered - the server may have taken it and simply not echoed yet.
  // A late echo clears the flag (see addRoomMessage), so a message the
  // server accepted can never stay in this state.
  const sentLogicEnabled = !config?.disableSentLogic;
  const isFailed = Boolean(sentLogicEnabled && isUser && message?.failed);
  // A failed media message keeps its File objects and retry runner only in
  // memory. After a reload the message can still be in the persisted store
  // with no runner behind it, and a Retry button there would do nothing. In
  // that case offer Remove instead, which drops the optimistic message.
  const mediaRetryLost = Boolean(
    isFailed && message?.isMediafile === 'true' && !hasMediaRetry(message.id)
  );

  // Buttons the bot attached to this message. Only ever shown on incoming
  // messages: an outgoing bubble carrying them would mean the user is
  // offering the bot a choice, which is not a thing.
  // Buttons also arrive inside the reply text itself: an AI agent taught the
  // Ethora chat protocol in its system prompt writes
  // <bot-data type="buttons">[A],[B]</bot-data> into its answer, since the
  // text is all it controls. Same buttons, same behaviour as the attribute.
  const botMarkup = useMemo(
    () => (isUser ? null : parseBotMarkup(message.body)),
    [isUser, message.body]
  );

  const quickReplies = useMemo<QuickReply[]>(() => {
    if (isUser) return [];
    const fromAttribute = parseQuickReplies(message.quickReplies);
    const fromBody = botMarkup?.buttons ?? [];
    if (!fromBody.length) return fromAttribute;
    const seen = new Set(fromAttribute.map((reply) => reply.value));
    const merged = [...fromAttribute];
    for (const reply of fromBody) {
      if (seen.has(reply.value)) continue;
      seen.add(reply.value);
      merged.push(reply);
    }
    return merged;
  }, [isUser, message.quickReplies, botMarkup]);

  const handleQuickReply = useCallback(
    (reply: QuickReply, questionId: string) => {
      // The answer is an ordinary message: the bot sees it through the same
      // path as typed input, and the transcript reads naturally. Nothing
      // else is sent anywhere.
      sendMessage(reply.value, message.roomJid);

      // Notification only, and deliberately after the send - a host driving
      // a scripted flow (quiz, intake) hangs off this, and a throw in its
      // handler must not cost the user their answer.
      try {
        const result = config?.eventHandlers?.onQuickReply?.({
          messageId: message.id,
          roomJID: message.roomJid,
          reply,
          questionId,
        });
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((error) =>
            console.error('Error in quick reply handler:', error)
          );
        }
      } catch (error) {
        console.error('Error in quick reply handler:', error);
      }
    },
    [config?.eventHandlers, message.id, message.roomJid, sendMessage]
  );

  const handleRemoveLostMedia = () => {
    // Hard removal: the optimistic message never reached the server, so a
    // tombstone would read as a deleted message that was never sent.
    dispatch(
      removeRoomMessage({ roomJID: message.roomJid, messageId: message.id })
    );
  };

  const handleRetrySend = () => {
    if (!isFailed) return;
    // A media message's files are held for their own uploads; retrying it
    // re-runs those and sends the album, never the text resend path.
    if (message?.isMediafile === 'true') {
      void retryMediaSend(message.id);
      return;
    }
    // The bubble flips straight back to "sending" (setMessageSendRetrying),
    // so the button this click came from unmounts - that is the first line
    // of defence against a double tap. resendMessage holds the second one,
    // a per-message-id single-writer slot, for the racy cases a re-render
    // cannot cover.
    void resendMessage(
      {
        originalMessageId: message.id,
        body: message.body,
        roomJid: message.roomJid,
        isReply:
          typeof message.isReply === 'boolean'
            ? message.isReply
            : !!message.isReply,
        showInChannel: message.showInChannel,
        mainMessage: message.mainMessage,
      },
      {
        preserveMessageId: true,
        // Match whatever a fresh send would do, so a retry does not silently
        // drop the `<translate source>` tag the first attempt carried.
        respectTranslateConfig: shouldTagOutgoingTranslateSource(
          config?.translates?.enabled,
          translateSendEnabled
        ),
      }
    ).catch((error) => {
      console.error('Failed to retry message send:', error);
    });
  };

  // A media bubble lays out its files as one block (see AttachmentList). When
  // that block is only pictures or videos, the time floats over it as a pill.
  const mediaAttachments = isMediaBubble ? getMessageAttachments(message) : [];
  const mediaBlockMode = getMediaBlockMode(mediaAttachments);
  // A media message with no caption has no text to translate.
  const showsTranslateRow =
    !isUser &&
    Boolean(config?.translates?.enabled) &&
    effectiveTranslateMode === 'manual' &&
    (!isMediaBubble || Boolean(captionText));
  const mediaTime = getMediaTimeLayout({
    attachments: mediaAttachments,
    hasCaption: Boolean(captionText),
    failed: isFailed,
    hasQuickReplies: quickReplies.length > 0,
    hasUrlPreview: Boolean(previewUrl) && !message.isDeleted,
    hasTranslateRow: showsTranslateRow,
  });
  const timeOverPicture = isMediaBubble && mediaTime.mode === 'overlay';

  // A short text message shows its time at the end of the last line of text
  // instead of on a line of its own. The time always sits bottom right, for
  // own and other people's bubbles alike.
  const timeInline =
    !isMediaBubble && !message.isDeleted && !translationDisplay.hasTranslation;
  const hasReactions = !!message.reaction && Object.keys(message.reaction).length > 0;
  // The tail marks the last bubble of a sender's run. Media-only bubbles (the
  // time floats over the picture) and system or deleted rows get none.
  const isLastInGroup = lastInRun !== false;
  const isMediaOnly = isMediaBubble && mediaTime.mediaOnly;
  const showsTail =
    isLastInGroup &&
    !message.isDeleted &&
    !message.callLog &&
    message.isSystemMessage !== 'true' &&
    !isMediaOnly;

  const timeNode = (
    <CustomMessageTimestamp
      $inline={timeInline}
      $media={isMediaBubble}
      $overlay={timeOverPicture}
      $bordered={!message.isDeleted && !isUser}
    >
      {sentLogicEnabled && isUser && isPending && !isFailed && 'sending...'}
      {message.isEdited && !message.isDeleted && (
        <EditedLabel>{t('message.edited')}</EditedLabel>
      )}
      {message.unencrypted && (
        <span
          title={t('e2ee.notEncryptedHint')}
          style={{ display: 'inline-flex', flexShrink: 0 }}
        >
          <LockOffIcon
            width={14}
            height={14}
            role="img"
            aria-label={t('e2ee.notEncrypted')}
          />
        </span>
      )}
      {new Date(message.date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}
      {sentLogicEnabled && isUser && !isPending && !isFailed && (
        <TickStatusWrapper>
          {timeOverPicture ? (
            readStatus === 'sent' ? (
              <SingleTick color="#FFFFFF" width={TICK_SIZE_PX} height={TICK_SIZE_PX} />
            ) : (
              <DoubleTick
                width={TICK_SIZE_PX}
                height={TICK_SIZE_PX}
                stroke={readStatus === 'seen' ? '#7DB3FF' : '#FFFFFF'}
              />
            )
          ) : readStatus === 'sent' ? (
            <SingleTick color="#8C8C8C" width={TICK_SIZE_PX} height={TICK_SIZE_PX} />
          ) : (
            <DoubleTick
              width={TICK_SIZE_PX}
              height={TICK_SIZE_PX}
              stroke={readStatus === 'seen' ? '#0052CD' : '#8C8C8C'}
            />
          )}
          <TickTooltip className="tick-tooltip">
            {tickInfo.lines.map((line, index) => (
              <TickTooltipLine key={index}>{line}</TickTooltipLine>
            ))}
          </TickTooltip>
        </TickStatusWrapper>
      )}
    </CustomMessageTimestamp>
  );

  return (
    <>
      <CustomMessageContainer
        key={message.id}
        $isUser={isUser}
        $reply={!!message?.reply?.length}
        $reaction={hasReactions}
        $reactionHang={reactionHang}
        $lastInGroup={isLastInGroup}
        ref={ref}
      >
        {!isUser && (
          // With profiles disabled the avatar is purely decorative: no
          // handler at all (not one that silently returns) and a default
          // cursor, so it stops advertising a click that does nothing.
          <CustomMessagePhotoContainer
            onClick={
              avatarClickable
                ? () => handleUserAvatarClick(message.user)
                : undefined
            }
            style={avatarClickable ? undefined : { cursor: 'default' }}
          >
            <MessageAvatarPhoto
              src={senderProfileImage}
              username={senderDisplayName}
              style={{ cursor: avatarClickable ? 'pointer' : 'default' }}
            />
          </CustomMessagePhotoContainer>
        )}
        <CustomMessageBubble
          data-ethora-bubble=""
          data-time-mode={
            isMediaBubble ? mediaTime.mode : timeInline ? 'inline' : 'row'
          }
          $deleted={message.isDeleted}
          $tail={showsTail}
          $isUser={isUser}
          $media={isMediaBubble}
          $solo={isMediaBubble && mediaBlockMode === 'solo'}
          onContextMenu={
            !config?.disableInteractions ? handleContextMenu : undefined
          }
          onTouchStart={
            !config?.disableInteractions ? handleTouchStart : undefined
          }
          onTouchEnd={!config?.disableInteractions ? handleTouchEnd : undefined}
        >
          {!isUser && (
            <CustomUserName
              $isUser={isUser}
              $media={isMediaBubble}
              $color={config?.colors?.primary}
              style={
                senderNamePending
                  ? { opacity: 0.5, minWidth: '1.5em', display: 'inline-block' }
                  : undefined
              }
            >
              {senderDisplayName}
            </CustomUserName>
          )}
          {!isReply && referencedMessage?.text && (
            <MessageReply
              handleReplyMessage={handleReplyMessage}
              isUser={isUser}
              text={referencedMessage.text}
              color={config?.colors?.primary}
            />
          )}
          {isMediaBubble ? (
            <>
              <MediaMessage
                mimeType={message.mimetype}
                locationPreview={message.locationPreview}
                location={message?.location}
                message={message}
              />
              <MediaCaption
                message={message}
                onMentionClick={handleMentionClick}
              />
            </>
          ) : (
            // Muted while unsent so the bubble reads as "not landed yet"
            // without shouting - the danger tone belongs on the notice below,
            // which is the part carrying the action.
            <CustomMessageText
              style={{
                opacity: isFailed ? 0.6 : 1,
                // Short text and its time share one line; a longer text
                // fills the width and the time wraps below it, right-aligned.
                ...(timeInline
                  ? {
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      columnGap: 12,
                    }
                  : null),
              }}
            >
              {message.isDeleted && message.id !== 'delimiter-new' ? (
                <DeletedMessage />
              ) : (
                (() => {
                  const filteredText = config?.messageTextFilter?.enabled
                    ? config.messageTextFilter.filterFunction(
                        translationDisplay.displayText
                      )
                    : translationDisplay.displayText;
                  // The markup is for the client, not the reader.
                  const displayText = isUser
                    ? filteredText
                    : stripBotMarkup(filteredText);
                  // Mention offsets index into the ORIGINAL sent body, not a
                  // translation - only apply them when we're actually
                  // showing that original text, so a mismatched offset can't
                  // splice a mention marker into the wrong spot.
                  const mentionsForDisplay =
                    displayText === message.body ? message.mentions : undefined;
                  const body = (
                    <div className="message-body" style={{ minWidth: 0 }}>
                      {parseMessageBody({
                        text: displayText,
                        mentions: mentionsForDisplay,
                        onMentionClick: handleMentionClick,
                      })}
                    </div>
                  );

                  if (!translationDisplay.hasTranslation) return body;
                  return (
                    <TranslatedMessageBody
                      isUser={isUser}
                      originalText={
                        isUser
                          ? translationDisplay.originalText
                          : stripBotMarkup(translationDisplay.originalText)
                      }
                      accentColor={config?.colors?.primary}
                    >
                      {body}
                    </TranslatedMessageBody>
                  );
                })()
              )}
              {timeInline && timeNode}
            </CustomMessageText>
          )}

          {/* Inside the bubble, under the content: media, then caption, then
              the reaction row, then the time row (see MessageReaction). */}
          {message.reaction && (
            <MessageReaction
              reaction={message.reaction}
              onHangChange={setReactionHang}
              changeReaction={
                interactionsDisabled ? () => undefined : handleReactionMessage
              }
              color={config.colors?.primary || '#0052CD'}
              userName={`${user.firstName} ${user.lastName}`}
            />
          )}

          {showsTranslateRow && (
            <MessageTranslate
              message={message}
              config={config}
              isUser={isUser}
            />
          )}
          {!timeInline && timeNode}
          {quickReplies.length > 0 && !message.isDeleted && (
            <QuickReplies
              replies={quickReplies}
              messageId={message.id}
              accentColor={config?.colors?.primary}
              colorScheme={config?.colorScheme}
              answered={hasAnsweredQuickReplies(message.id)}
              onSelect={handleQuickReply}
            />
          )}
          {isFailed && mediaRetryLost && (
            <>
              <FailedNotice>
                <span>{t('message.notDelivered')}</span>
                <RetryButton
                  type="button"
                  onClick={handleRemoveLostMedia}
                  aria-label={t('message.removeAriaLabel')}
                >
                  {t('message.remove')}
                </RetryButton>
              </FailedNotice>
              <FailedNote>{t('message.mediaLostNote')}</FailedNote>
            </>
          )}
          {isFailed && !mediaRetryLost && (
            <FailedNotice>
              <span>{t('message.notDelivered')}</span>
              <RetryButton
                type="button"
                onClick={handleRetrySend}
                aria-label={t('message.retryAriaLabel')}
              >
                {t('message.retry')}
              </RetryButton>
            </FailedNotice>
          )}
          {previewUrl && !message.isDeleted && (
            <URLPreviewCard url={previewUrl} isUserMessage={isUser} />
          )}
        </CustomMessageBubble>
        <MessageFooter $isUser={isUser}>
          {message?.reply?.length && message?.reply?.length > 0 ? (
            <BottomReplyContainer
              isUser={isUser}
              onClick={handleReplyMessage}
              reply={message?.reply}
              color={config.colors?.primary}
            />
          ) : null}
        </MessageFooter>
      </CustomMessageContainer>

      {!interactionsDisabled && (
        <MessageInteractions
          isReply={isReply}
          isUser={isUser}
          message={message}
          setContextMenu={setContextMenu}
          contextMenu={contextMenu}
          handleReplyMessage={handleReplyMessage}
          handleDeleteMessage={handleDeleteMessage}
          handleEditMessage={handleEditMessage}
          handleReactionMessage={handleReactionMessage}
        />
      )}
    </>
  );
});

// Memoized: with the reducers now preserving message identity, rows whose
// message object didn't change skip re-rendering entirely.
const MemoizedMessage = React.memo(Message);

export { MemoizedMessage as Message };
