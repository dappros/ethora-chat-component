import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { useAppDispatch } from '../../hooks/hooks';
import { getRoomByName } from '../../networking/api-requests/rooms.api';
import {
  clearRoomDraft,
  setRoomDraft,
  updateRoom,
} from '../../roomStore/roomsSlice';
import {
  AttachmentNotice,
  DropOverlay,
  DropTarget,
  EmojiPickerPopover,
  FilePreviewContainer,
  HiddenFileInput,
  MessageInputContainer,
  InputContainer,
  MessageInput,
} from './StyledInputComponents/StyledInputComponents';
import {
  TextareaInput,
  TextareaWrapper,
} from './StyledInputComponents/StyledInputComponents';
import AudioRecorder from '../InputComponents/AudioRecorder';
import AttachmentPreview from '../InputComponents/AttachmentPreview';
import { IConfig, IMentionSpan, RoomMember } from '../../types/types';
import Button from './Button';
import LazyEmojiPicker from '../EmojiPicker/LazyEmojiPicker';
import { AttachIcon, EmojiIcon, SendIcon } from '../../assets/icons';
import {
  resolveIconBgColor,
  resolveIconColor,
} from '../../helpers/resolveIconColor';
import { parseMessageBody } from '../../helpers/parseMessageBody';
import { useT } from '../../i18n/useT';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import { RootState, getActiveRoom } from '../../roomStore';
import { useMentionComposer } from '../../hooks/useMentionComposer';
import { MentionCandidate } from '../../helpers/mentions';
import MentionDropdown from '../InputComponents/MentionDropdown';
import MentionPickerModal from '../InputComponents/MentionPickerModal';

const DEFAULT_MAX_FILES = 5;

/** Typing pause after which the composer commits its text as a draft. */
const DRAFT_SAVE_DEBOUNCE_MS = 400;

/**
 * Hosts can widen the drop area past the composer by putting this attribute
 * on an ancestor. ChatRoom puts it on the whole message area, so a file
 * dropped anywhere over the conversation lands in the tray; without a
 * marked ancestor the composer itself is the drop zone (the thread
 * composer, an embedded SendInput, ...).
 */
const DROP_ZONE_ATTRIBUTE = 'data-ethora-drop-zone';

/**
 * A drag only counts as an attachment drag when it actually carries files -
 * dragging selected text, a link or an image out of the transcript must not
 * light up the drop target.
 */
const dragCarriesFiles = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
};

/** Identity for dedup: same name AND size AND mtime is the same pick. */
const fileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified ?? 0}`;

export interface SendInputProps {
  sendMessage: (
    message: string,
    mentions?: IMentionSpan[]
  ) => void | Promise<void>;
  /**
   * Receives a `File[]` for picked attachments (one message, N files) and a
   * `Blob` for voice notes. Single files still arrive as a one-element array.
   */
  sendMedia: (
    data: File[] | File | Blob,
    type: string
  ) => void | Promise<void>;
  isLoading: boolean;
  editMessage?: string;
  config?: IConfig;
  onFocus?: () => void;
  onBlur?: () => void;
  isMessageProcessing?: boolean;
  formatMessage?: (text: string) => string;
  multiline?: boolean;
  inputHeight?: number;
  showPreview?: boolean;
  previewParser?: (text: string) => (string | JSX.Element)[];
  onSendMessage?: (
    message: string,
    mentions?: IMentionSpan[]
  ) => void | Promise<void>;
  onSendMedia?: (
    data: File[] | File | Blob,
    type: string
  ) => void | Promise<void>;
  placeholderText?: string;
  /** Disables the @-mention autocomplete (e.g. for a composer variant that
   * doesn't want it). Defaults to enabled. */
  disableMentions?: boolean;
  /**
   * Disables per-room draft persistence. Set it on any SECOND composer
   * that is mounted for the same room as the main one - the thread
   * composer, for instance - since drafts are keyed by room JID and two
   * live composers would otherwise overwrite each other's text.
   */
  disableDrafts?: boolean;
}

const SendInput: React.FC<SendInputProps> = ({
  sendMessage,
  sendMedia,
  onFocus,
  onBlur,
  config,
  editMessage,
  isLoading,
  isMessageProcessing,
  formatMessage,
  multiline,
  inputHeight,
  showPreview,
  previewParser,
  onSendMessage,
  onSendMedia,
  placeholderText,
  disableMentions,
  disableDrafts,
}) => {
  const t = useT();
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(40);
  const [isFocused, setIsFocused] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Whichever of the textarea/input is actually rendered (only one is, per
  // `multiline`) - lets mention handling read/set caret position without
  // caring which element mode is active.
  const activeElRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(
    null
  );
  const pendingCaretRef = useRef<number | null>(null);
  const overflowCaretRef = useRef<number>(0);

  // @-mention support: candidate pool is the CURRENT room's members, merged
  // with usersSet the same way ChatProfileModal's member list is (affiliation
  // data alone is often missing name/avatar - usersSet fills that in from
  // <data> stamps on messages/API enrichment). See useMentionComposer.tsx
  // for the offset-tracking/atomic-backspace logic itself.
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  const selfUser = useSelector(
    (state: RootState) => state.chatSettingStore.user
  );
  const roomMembers: RoomMember[] = useMemo(() => {
    const members = Array.isArray(activeRoom?.members)
      ? activeRoom.members
      : [];
    return members.map((m) => {
      const key = String(m?.xmppUsername || '');
      const localKey = key.split('@')[0];
      const enriched = (usersSet as any)?.[key] || (usersSet as any)?.[localKey];
      if (!enriched) return m;
      return {
        ...m,
        firstName: m.firstName || enriched.firstName || '',
        lastName: m.lastName || enriched.lastName || '',
      };
    });
  }, [activeRoom?.members, usersSet]);

  const mention = useMentionComposer({
    roomMembers,
    selfId: selfUser?.xmppUsername || (selfUser as any)?.id,
  });
  const mentionsEnabled = !disableMentions;

  // `activeRoom.members` only gets populated by a live XMPP affiliation/
  // members-refresh event or by opening AddMembersModal/SelectUsersModal
  // (see stanzaHandlers.ts's onMembersRefreshSignal) - a freshly opened
  // room routinely has none yet, which would leave the mention dropdown
  // with no candidates to show. Mirror those callers' own fetch (GET
  // /v1/chats/my/<name>, then the same `updateRoom({ members })` dispatch
  // SelectUsersModal/AddMembersModal use) once per room, only when
  // mentions are enabled and the room doesn't already carry a member list.
  const dispatch = useAppDispatch();
  const fetchedMembersForRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mentionsEnabled) return;
    const jid = activeRoom?.jid;
    if (!jid) return;
    if (Array.isArray(activeRoom?.members) && activeRoom.members.length > 0) return;
    if (fetchedMembersForRoomRef.current === jid) return;
    fetchedMembersForRoomRef.current = jid;

    getRoomByName(jid.split('@')[0])
      .then((room) => {
        if (!room || !Array.isArray(room.members)) return;
        dispatch(updateRoom({ jid, updates: { members: room.members } }));
      })
      .catch(() => {
        // Best-effort: the dropdown just shows fewer/no candidates until a
        // live membership event fills activeRoom.members in some other way.
      });
  }, [mentionsEnabled, activeRoom?.jid, activeRoom?.members, dispatch]);

  const requestCaret = useCallback((position: number) => {
    pendingCaretRef.current = position;
  }, []);

  useEffect(() => {
    if (pendingCaretRef.current == null) return;
    const el = activeElRef.current;
    const pos = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  }, [message]);

  const maxFiles = Math.min(
    Math.max(1, config?.attachments?.maxFiles ?? DEFAULT_MAX_FILES),
    MAX_ATTACHMENTS_PER_MESSAGE
  );
  const maxFileSizeMb = config?.attachments?.maxFileSizeMb;

  // One blob URL per picked file, created here and revoked the moment the
  // file leaves the tray (or the composer unmounts). Creating them during
  // render - which is what this used to do - leaked one URL per keystroke.
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls = objectUrlsRef.current;
    const liveKeys = new Set(filePreviews.map(fileKey));

    filePreviews.forEach((file) => {
      const key = fileKey(file);
      if (urls.has(key)) return;
      const kind = getFileKind(file.type, file.name);
      if (kind === 'image' || kind === 'video' || kind === 'pdf') {
        urls.set(key, URL.createObjectURL(file));
      }
    });

    urls.forEach((url, key) => {
      if (!liveKeys.has(key)) {
        URL.revokeObjectURL(url);
        urls.delete(key);
      }
    });

    setObjectUrls(Object.fromEntries(urls));
  }, [filePreviews]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  /**
   * The single intake path for attachments, whatever produced them: the
   * file picker, a drop on the message area, or an image pasted into the
   * composer. Dedup, the size limit, the per-message count limit and the
   * notices they raise all live here so every source gets identical
   * validation and identical feedback.
   */
  const addFiles = useCallback(
    (picked: File[]) => {
      if (picked.length === 0) return;

      const sizeLimit = maxFileSizeMb ? maxFileSizeMb * 1024 * 1024 : null;
      const seen = new Set(filePreviews.map(fileKey));
      const accepted: File[] = [];
      const oversized: string[] = [];
      let droppedForCount = 0;

      picked.forEach((file) => {
        const key = fileKey(file);
        if (seen.has(key)) return;
        if (sizeLimit && file.size > sizeLimit) {
          oversized.push(file.name);
          return;
        }
        if (filePreviews.length + accepted.length >= maxFiles) {
          droppedForCount += 1;
          return;
        }
        seen.add(key);
        accepted.push(file);
      });

      if (accepted.length > 0) {
        setFilePreviews((prevFiles) => [...prevFiles, ...accepted]);
      }

      const notices: string[] = [];
      if (oversized.length > 0) {
        notices.push(
          t('attachment.tooLarge', {
            files: oversized.join(', '),
            size: String(maxFileSizeMb),
          })
        );
      }
      if (droppedForCount > 0) {
        notices.push(t('attachment.limit', { count: maxFiles }));
      }
      setAttachmentNotice(notices.length > 0 ? notices.join(' ') : null);
    },
    [filePreviews, maxFiles, maxFileSizeMb, t]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files || []);

      // Reset first: re-picking the same file must fire `change` again.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      addFiles(picked);
    },
    [addFiles]
  );

  // ------------------------------------------------------------------
  // Drag and drop / paste attachments
  //
  // The intake, limits and error paths are already there (addFiles above);
  // only the event handlers were missing. Files can be dropped anywhere on
  // the drop zone - the whole message area when a host marks one with
  // DROP_ZONE_ATTRIBUTE, the composer alone otherwise - and images can be
  // pasted straight into the input.
  // ------------------------------------------------------------------
  const attachmentsEnabled = !config?.disableMedia;
  const [dropZoneEl, setDropZoneEl] = useState<HTMLElement | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  // dragenter/dragleave fire per element crossed, so a single drag over the
  // transcript raises a burst of them; count depth instead of toggling, or
  // the target flickers off the moment the pointer crosses a message.
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const self = containerRef.current;
    if (!self) return;
    setDropZoneEl(
      (self.closest(`[${DROP_ZONE_ATTRIBUTE}]`) as HTMLElement | null) ?? self
    );
  }, []);

  useEffect(() => {
    if (!dropZoneEl || !attachmentsEnabled) return;

    const endDrag = () => {
      dragDepthRef.current = 0;
      setIsDropTargetActive(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!dragCarriesFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDropTargetActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragCarriesFiles(event)) return;
      // Required: an element that doesn't cancel dragover is not a drop
      // target at all, and the browser then navigates away to the file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!dragCarriesFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDropTargetActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!dragCarriesFiles(event)) return;
      event.preventDefault();
      endDrag();
      addFiles(Array.from(event.dataTransfer?.files || []));
    };

    dropZoneEl.addEventListener('dragenter', onDragEnter);
    dropZoneEl.addEventListener('dragover', onDragOver);
    dropZoneEl.addEventListener('dragleave', onDragLeave);
    dropZoneEl.addEventListener('drop', onDrop);
    return () => {
      dropZoneEl.removeEventListener('dragenter', onDragEnter);
      dropZoneEl.removeEventListener('dragover', onDragOver);
      dropZoneEl.removeEventListener('dragleave', onDragLeave);
      dropZoneEl.removeEventListener('drop', onDrop);
    };
  }, [dropZoneEl, attachmentsEnabled, addFiles]);

  // A file dropped anywhere the chat isn't would otherwise make the browser
  // navigate to it, throwing away the whole session. These run in the
  // bubble phase, after the zone handlers above, so a drop that WAS handled
  // is already defaultPrevented and this does nothing extra; a real drop
  // target elsewhere on the host page cancels its own events the same way
  // and keeps working.
  useEffect(() => {
    const swallowStrayDrag = (event: DragEvent) => {
      if (event.defaultPrevented) return;
      if (!dragCarriesFiles(event)) return;
      event.preventDefault();
    };
    const onWindowDrop = (event: DragEvent) => {
      swallowStrayDrag(event);
      dragDepthRef.current = 0;
      setIsDropTargetActive(false);
    };
    const onDragEnd = () => {
      dragDepthRef.current = 0;
      setIsDropTargetActive(false);
    };

    window.addEventListener('dragover', swallowStrayDrag);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('dragend', onDragEnd);
    return () => {
      window.removeEventListener('dragover', swallowStrayDrag);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!attachmentsEnabled) return;
      const pasted = Array.from(event.clipboardData?.files || []);
      const images = pasted.filter((file) =>
        String(file.type || '').startsWith('image/')
      );
      // Anything else - plain text above all - falls through to the normal
      // paste, so text still lands in the input untouched.
      if (images.length === 0) return;
      event.preventDefault();
      addFiles(images);
    },
    [attachmentsEnabled, addFiles]
  );

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleRemoveFile = useCallback((file: File) => {
    setFilePreviews((prevFiles) => prevFiles.filter((f) => f !== file));
    setAttachmentNotice(null);
  }, []);

  const calculateTextareaHeight = useCallback(
    (text: string) => {
      if (!multiline) return 40;

      const lineBreaks = (text.match(/\n/g) || []).length;
      const baseHeight = 40;
      const heightPerLine = 13;
      const maxHeight = 92;

      const calculatedHeight = baseHeight + lineBreaks * heightPerLine;
      return Math.min(Math.max(calculatedHeight, baseHeight), maxHeight);
    },
    [multiline]
  );

  const updateTextareaHeight = useCallback(
    (text: string) => {
      const newHeight = calculateTextareaHeight(text);
      setTextareaHeight(newHeight);
    },
    [calculateTextareaHeight]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      const caret = event.target.selectionStart ?? newValue.length;
      if (mentionsEnabled) {
        mention.handleTextChange(message, newValue, caret);
      }
      setMessage(newValue);
      updateTextareaHeight(newValue);
    },
    [updateTextareaHeight, mentionsEnabled, mention, message]
  );

  const applyMentionSelection = useCallback(
    (candidate: MentionCandidate, caretOverride?: number) => {
      const el = activeElRef.current;
      const caret = caretOverride ?? el?.selectionStart ?? message.length;
      const result = mention.selectCandidate(candidate, message, caret);
      if (!result) return;
      setMessage(result.text);
      updateTextareaHeight(result.text);
      requestCaret(result.caret);
    },
    [mention, message, updateTextareaHeight, requestCaret]
  );

  const openMentionOverflow = useCallback(() => {
    overflowCaretRef.current = activeElRef.current?.selectionStart ?? message.length;
    mention.setOverflowOpen(true);
  }, [mention, message]);

  /**
   * Splices text in at the caret (replacing the selection if there is one)
   * rather than appending, and leaves the caret just after what was
   * inserted. Mention spans are offset-shifted through the same
   * handleTextChange the typing path uses, so an emoji dropped in front of
   * an existing mention doesn't desync its offsets.
   */
  const insertAtCaret = useCallback(
    (insertion: string) => {
      if (!insertion) return;
      const el = activeElRef.current;
      const start = el?.selectionStart ?? message.length;
      const end = el?.selectionEnd ?? start;
      const newValue = message.slice(0, start) + insertion + message.slice(end);
      const caret = start + insertion.length;

      if (mentionsEnabled) {
        mention.handleTextChange(message, newValue, caret);
        // The insertion is a deliberate, non-typed edit: never let it
        // re-open the autocomplete just because the caret happens to land
        // inside something that parses as "@query".
        mention.closeDropdown();
      }
      setMessage(newValue);
      updateTextareaHeight(newValue);
      requestCaret(caret);
    },
    [message, mentionsEnabled, mention, updateTextareaHeight, requestCaret]
  );

  const toggleEmojiPicker = useCallback(() => {
    setEmojiPickerOpen((open) => {
      // Opening the picker gives the composer a second popover above the
      // input; close the mention autocomplete so only one is ever anchored
      // there, and so its key handling can't compete with the picker's.
      if (!open && mentionsEnabled) mention.closeDropdown();
      return !open;
    });
  }, [mentionsEnabled, mention]);

  // Dismiss on outside click / Escape. The picker owns focus while open (it
  // has its own search field), so Escape has to be caught at the document
  // level rather than on the textarea.
  useEffect(() => {
    if (!emojiPickerOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (emojiPopoverRef.current?.contains(target)) return;
      if (emojiButtonRef.current?.contains(target)) return;
      setEmojiPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEmojiPickerOpen(false);
      activeElRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiPickerOpen]);

  useEffect(() => {
    // `undefined` here flips the input from controlled to uncontrolled.
    setMessage(editMessage ?? '');
    if (editMessage) {
      updateTextareaHeight(editMessage);
    }
  }, [editMessage, updateTextareaHeight]);

  // ------------------------------------------------------------------
  // Per-room drafts
  //
  // The composer's text is local state and SendInput is never unmounted
  // when the active room changes, so without this every room shared one
  // buffer. Drafts live in the rooms slice (roomsSlice `drafts`, keyed by
  // room JID) rather than here so they survive both a room switch and,
  // through that slice's persistence, a reload.
  //
  // What is NOT a draft: an edit in progress and an active reply. An edit
  // is a rewrite of an already sent message and already has its own state
  // (roomsSlice's `editAction`, carrying the message id it belongs to);
  // storing it as the room's draft would clobber the unsent text it is
  // temporarily standing in for, and restoring it later would re-attach a
  // body to an edit that no longer exists. A reply target is likewise
  // already per-room state (`activeMessage` on the room). Only the plain
  // unsent buffer is stored - and when an edit ends, the room's own draft
  // is put back into the composer.
  // ------------------------------------------------------------------
  const draftsEnabled = !disableDrafts;
  const activeRoomJid = activeRoom?.jid;
  const roomDraft = useSelector((state: RootState) =>
    draftsEnabled && activeRoomJid
      ? (state.rooms.drafts?.[activeRoomJid] ?? '')
      : ''
  );
  // Read through a ref by the effects below: they react to the room
  // changing, never to our own debounced write landing back in the store.
  const roomDraftRef = useRef(roomDraft);
  roomDraftRef.current = roomDraft;

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<{ jid: string; text: string } | null>(null);
  const skipNextDraftSaveRef = useRef(false);
  const draftRoomRef = useRef<string | null>(null);
  const wasEditingRef = useRef(false);

  /** Commits whatever the debounce still owes, immediately. */
  const flushDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending) dispatch(setRoomDraft(pending));
  }, [dispatch]);

  const restoreDraftIntoComposer = useCallback(() => {
    const restored = roomDraftRef.current || '';
    // Whatever is in the composer right now belongs to the room we are
    // leaving (or to a finished edit): don't let the save effect write it
    // under the room we are arriving at.
    skipNextDraftSaveRef.current = true;
    setMessage(restored);
    updateTextareaHeight(restored);
    if (mentionsEnabled) mention.resetMentions();
    // Caret at the end, so the user carries on where they stopped. Only
    // when there is something to carry on from - an empty draft must not
    // pull focus into the composer on every room switch.
    if (restored) requestCaret(restored.length);
  }, [updateTextareaHeight, mentionsEnabled, mention, requestCaret]);

  const clearDraftForRoom = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    pendingDraftRef.current = null;
    if (!draftsEnabled || !activeRoomJid) return;
    dispatch(clearRoomDraft({ jid: activeRoomJid }));
  }, [draftsEnabled, activeRoomJid, dispatch]);

  useEffect(() => {
    if (!draftsEnabled) return;
    if (draftRoomRef.current === (activeRoomJid ?? null)) return;
    flushDraft();
    draftRoomRef.current = activeRoomJid ?? null;
    // An edit owns the composer while it runs; the transition effect below
    // hands the draft back when it ends.
    if (editMessage) return;
    restoreDraftIntoComposer();
  }, [
    draftsEnabled,
    activeRoomJid,
    editMessage,
    flushDraft,
    restoreDraftIntoComposer,
  ]);

  // Declared after the editMessage effect above on purpose: when an edit
  // ends that effect blanks the composer, and this one puts the room's own
  // unsent draft back in its place.
  useEffect(() => {
    const editing = !!editMessage;
    const wasEditing = wasEditingRef.current;
    wasEditingRef.current = editing;
    if (!draftsEnabled || !wasEditing || editing) return;
    restoreDraftIntoComposer();
  }, [editMessage, draftsEnabled, restoreDraftIntoComposer]);

  // Saving is driven off `message` rather than from inside the change
  // handler because the composer mutates that text from five places
  // (typing, emoji insert, mention pick, atomic mention backspace,
  // send/clear); a draft that silently missed one of them would be worse
  // than no draft at all.
  useEffect(() => {
    if (!draftsEnabled || !activeRoomJid) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (editMessage) return;

    pendingDraftRef.current = { jid: activeRoomJid, text: message };
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      const pending = pendingDraftRef.current;
      pendingDraftRef.current = null;
      if (pending) dispatch(setRoomDraft(pending));
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }, [message, activeRoomJid, draftsEnabled, editMessage, dispatch]);

  // Unmounting mid-debounce (the whole chat closing, a route change) must
  // not silently drop what was typed.
  const flushDraftRef = useRef(flushDraft);
  flushDraftRef.current = flushDraft;
  useEffect(() => () => flushDraftRef.current(), []);

  const effectiveSendMessage = onSendMessage || sendMessage;
  const effectiveSendMedia = onSendMedia || sendMedia;
  const hasTextContent = useCallback(
    (value: string) => /\S/.test(String(value || '')),
    []
  );

  const handleSendClick = useCallback(
    // AudioRecorder hands over the recorded Blob, not a URL - the old name
    // stuck around from when it did.
    async (audioUrl?: Blob) => {
      const outgoing = formatMessage ? formatMessage(message) : message;
      const trailingText = hasTextContent(outgoing) ? outgoing : null;

      let mediaPromise: void | Promise<void> = undefined;

      if (filePreviews.length > 0) {
        // The whole tray goes as one message; sendMedia uploads it in a
        // single request and emits a single stanza.
        mediaPromise = effectiveSendMedia(filePreviews, 'media');
        setIsRecording(false);
      } else if (audioUrl) {
        mediaPromise = effectiveSendMedia(audioUrl, 'audio/');
        setIsRecording(false);
      } else {
        if (!trailingText) {
          return;
        }
        effectiveSendMessage(trailingText, mention.mentionSpans);
        mention.resetMentions();
        clearDraftForRoom();
        setMessage('');
        setFilePreviews([]);
        setAttachmentNotice(null);
        setTextareaHeight(40);
        return;
      }

      mention.resetMentions();
      clearDraftForRoom();
      setMessage('');
      setFilePreviews([]);
      setAttachmentNotice(null);
      setTextareaHeight(40);

      if (trailingText) {
        // Wait for the media stanza to land before sending the caption so
        // recipients see media-then-text order on the wire.
        try {
          await mediaPromise;
        } catch {
          // Media sender owns its own error reporting; still emit the caption.
        }
        effectiveSendMessage(trailingText, mention.mentionSpans);
      }
    },
    [
      effectiveSendMedia,
      effectiveSendMessage,
      filePreviews,
      formatMessage,
      hasTextContent,
      message,
      mention,
      clearDraftForRoom,
    ]
  );

  const handleSecondaryClick = useCallback(() => {
    const outgoingBase = config.secondarySendButton.messageEdit + message;
    const outgoing = formatMessage ? formatMessage(outgoingBase) : outgoingBase;
    if (!hasTextContent(outgoing)) {
      return;
    }
    effectiveSendMessage(outgoing, mention.mentionSpans);
    mention.resetMentions();
    clearDraftForRoom();
    setMessage('');
    setFilePreviews([]);
    setAttachmentNotice(null);
    setTextareaHeight(40);
  }, [
    effectiveSendMessage,
    message,
    config?.secondarySendButton?.messageEdit,
    formatMessage,
    hasTextContent,
    mention,
    clearDraftForRoom,
  ]);

  // The caret can sit inside an "@query" that matches nobody, in which case
  // MentionDropdown renders nothing. Key handling has to follow what is
  // actually on screen, not just `isDropdownOpen`, or Escape/ArrowUp/
  // ArrowDown get swallowed by an invisible dropdown.
  const mentionDropdownVisible =
    mentionsEnabled &&
    mention.isDropdownOpen &&
    !mention.overflowOpen &&
    (mention.visibleCandidates.length > 0 || mention.hasOverflow);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (mentionDropdownVisible) {
        if (event.key === 'Escape') {
          event.preventDefault();
          mention.closeDropdown();
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          mention.moveHighlight(1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          mention.moveHighlight(-1);
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const overflowRowIndex = mention.visibleCandidates.length;
          if (mention.hasOverflow && mention.highlightedIndex === overflowRowIndex) {
            event.preventDefault();
            openMentionOverflow();
            return;
          }
          const candidate = mention.visibleCandidates[mention.highlightedIndex];
          if (candidate) {
            event.preventDefault();
            applyMentionSelection(candidate);
            return;
          }
        }
      }

      if (
        mentionsEnabled &&
        event.key === 'Backspace' &&
        !mention.isDropdownOpen
      ) {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const selStart = target.selectionStart ?? 0;
        const selEnd = target.selectionEnd ?? 0;
        const edit = mention.handleBackspace(message, selStart, selEnd);
        if (edit) {
          event.preventDefault();
          setMessage(edit.text);
          updateTextareaHeight(edit.text);
          requestCaret(edit.caret);
          return;
        }
      }

      if (event.key !== 'Enter') return;

      const hasContent = filePreviews.length > 0 || hasTextContent(message);
      if (!hasContent) return;

      if (multiline) {
        if (event.shiftKey) return;
        event.preventDefault();
      }

      if (config?.secondarySendButton?.overwriteEnterClick) {
        handleSecondaryClick();
      } else {
        handleSendClick();
      }
    },
    [
      config?.secondarySendButton?.overwriteEnterClick,
      handleSendClick,
      handleSecondaryClick,
      filePreviews.length,
      hasTextContent,
      message,
      multiline,
      mentionsEnabled,
      mentionDropdownVisible,
      mention,
      applyMentionSelection,
      openMentionOverflow,
      updateTextareaHeight,
      requestCaret,
    ]
  );

  const memoizedFilePreviews = useMemo(
    () =>
      filePreviews.map((file) => (
        <AttachmentPreview
          key={fileKey(file)}
          file={file}
          objectUrl={objectUrls[fileKey(file)]}
          onRemove={handleRemoveFile}
          config={config}
          removeLabel={t('attachment.remove')}
        />
      )),
    [filePreviews, objectUrls, handleRemoveFile, config, t]
  );

  return (
    <InputContainer ref={containerRef}>
      {isDropTargetActive &&
        dropZoneEl &&
        createPortal(
          <DropOverlay role="status" aria-live="polite">
            <DropTarget>{t('attachment.dropHint')}</DropTarget>
          </DropOverlay>,
          dropZoneEl
        )}
      {mentionsEnabled && mention.isDropdownOpen && !mention.overflowOpen && (
        <MentionDropdown
          candidates={mention.visibleCandidates}
          totalCount={mention.candidates.length}
          hasOverflow={mention.hasOverflow}
          highlightedIndex={mention.highlightedIndex}
          onHoverIndex={mention.setHighlightedIndex}
          onSelect={applyMentionSelection}
          onShowAll={openMentionOverflow}
        />
      )}
      {mentionsEnabled && mention.overflowOpen && (
        <MentionPickerModal
          members={roomMembers}
          selfId={selfUser?.xmppUsername || (selfUser as any)?.id}
          onSelect={(candidate) => {
            applyMentionSelection(candidate, overflowCaretRef.current);
            mention.setOverflowOpen(false);
          }}
          onClose={() => mention.closeDropdown()}
        />
      )}
      {emojiPickerOpen && (
        <EmojiPickerPopover ref={emojiPopoverRef}>
          <LazyEmojiPicker
            skinTonePosition="none"
            searchPosition="static"
            previewPosition="none"
            theme="light"
            onEmojiSelect={(emoji: { native?: string }) => {
              insertAtCaret(emoji?.native || '');
              setEmojiPickerOpen(false);
            }}
            style={{
              maxWidth: '320px',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          />
        </EmojiPickerPopover>
      )}
      <MessageInputContainer>
        {!isRecording && (
          <>
            {!config?.disableMedia && (
              <Button
                onClick={handleAttachClick}
                disabled={false}
                aria-label={t('action.attachFile')}
                EndIcon={<AttachIcon color={resolveIconColor(config)} bgcolor={resolveIconBgColor(config)} />}
              />
            )}
            <Button
              ref={emojiButtonRef}
              onClick={toggleEmojiPicker}
              // Keep the caret where the user left it: without this the
              // button steals focus on mousedown and the insertion point
              // is lost before the picker even opens.
              onMouseDown={(event) => event.preventDefault()}
              disabled={isLoading || isMessageProcessing}
              aria-label={t('action.emoji')}
              aria-expanded={emojiPickerOpen}
              EndIcon={
                <EmojiIcon
                  color={resolveIconColor(config)}
                  bgcolor={resolveIconBgColor(config)}
                />
              }
            />
            {multiline ? (
              <TextareaWrapper
                $dynamicHeight={textareaHeight}
                $color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                $isFocused={isFocused}
              >
                <TextareaInput
                  ref={(el) => {
                    (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                    activeElRef.current = el;
                  }}
                  placeholder={placeholderText || t('input.placeholder')}
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  disabled={isLoading || isMessageProcessing}
                  $dynamicHeight={textareaHeight}
                  $color={config?.colors?.primary}
                  $colorBg={config?.colors?.colorInput}
                />
              </TextareaWrapper>
            ) : (
              <MessageInput
                ref={(el: HTMLInputElement | null) => {
                  activeElRef.current = el;
                }}
                $color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                placeholder={placeholderText || t('input.placeholder')}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={isLoading || isMessageProcessing}
                style={{
                  height: inputHeight,
                  maxHeight: inputHeight || '40px',
                }}
              />
            )}
          </>
        )}
        {message || filePreviews.length > 0 || config?.disableMedia ? (
          <>
            {config?.secondarySendButton?.enabled && (
              <Button
                onClick={() => handleSecondaryClick()}
                disabled={
                  isMessageProcessing || (!message && filePreviews.length === 0)
                }
                aria-label={
                  typeof config?.secondarySendButton?.label === 'string'
                    ? config.secondarySendButton.label
                    : t('action.send')
                }
                style={{
                  color:
                    filePreviews.length > 0
                      ? 'var(--ethora-color-text-on-primary, #fff)'
                      : !message || message === ''
                        ? 'var(--ethora-color-text-muted, #D4D4D8)'
                        : 'var(--ethora-color-text-on-primary, #fff)',
                  borderRadius: 'var(--ethora-radius-full, 100px)',
                  backgroundColor:
                    filePreviews.length > 0
                      ? resolveIconColor(config)
                      : !message || message === ''
                        ? 'transparent'
                        : resolveIconColor(config),
                  ...config?.secondarySendButton.buttonStyles,
                }}
                EndIcon={
                  <SendIcon
                    bgcolor={resolveIconBgColor(config)}
                    color={
                      filePreviews.length > 0
                        ? 'var(--ethora-color-text-on-primary, #fff)'
                        : !message || message === ''
                          ? 'var(--ethora-color-text-muted, #D4D4D8)'
                          : 'var(--ethora-color-text-on-primary, #fff)'
                    }
                  />
                }
              >
                {config?.secondarySendButton?.label}
              </Button>
            )}
            {config?.secondarySendButton?.hideInputSendButton ? null : (
              <Button
                onClick={() => handleSendClick()}
                disabled={
                  (message === '' && filePreviews.length === 0) ||
                  isMessageProcessing
                }
                aria-label={t('action.send')}
                EndIcon={
                  <SendIcon
                    bgcolor={resolveIconBgColor(config)}
                    color={
                      message === '' && filePreviews.length === 0
                        ? 'var(--ethora-color-text-muted, #D4D4D8)' // empty/disabled → muted grey
                        : 'var(--ethora-icon-color, #0052CD)' // active → colors.icons (locked by the icon-tint rule)
                    }
                  />
                }
                style={{
                  borderRadius: 'var(--ethora-radius-full, 100px)',
                  backgroundColor: 'transparent',
                }}
              />
            )}
          </>
        ) : (
          <AudioRecorder
            setIsRecording={setIsRecording}
            isRecording={isRecording}
            handleSendClick={handleSendClick}
          />
        )}
      </MessageInputContainer>

      {multiline && showPreview && message && (
        <div
          style={{
            marginTop: 'var(--ethora-space-2, 8px)',
            padding: 'var(--ethora-space-3, 12px)',
            backgroundColor: 'var(--ethora-color-bg-subtle, #fafafa)',
            border: '1px solid var(--ethora-color-border, #E4E4E7)',
            borderRadius: 'var(--ethora-radius-md, 12px)',
            color: 'var(--ethora-color-text, #141414)',
          }}
        >
          {
            (previewParser || ((text: string) => parseMessageBody({ text })))(
              message
            ) as React.ReactNode
          }
        </div>
      )}

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        multiple={maxFiles > 1}
        accept={config?.attachments?.accept}
        onChange={handleFileChange}
      />
      {filePreviews.length > 0 && (
        <FilePreviewContainer>{memoizedFilePreviews}</FilePreviewContainer>
      )}
      {attachmentNotice && (
        <AttachmentNotice role="status">{attachmentNotice}</AttachmentNotice>
      )}
    </InputContainer>
  );
};

export default SendInput;
