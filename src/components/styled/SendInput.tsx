import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  FilePreview,
  FilePreviewContainer,
  HiddenFileInput,
  MessageInputContainer,
  VideoPreview,
  InputContainer,
  MessageInput,
  ImagePreview,
} from './StyledInputComponents/StyledInputComponents';
import {
  TextareaInput,
  TextareaWrapper,
} from './StyledInputComponents/StyledInputComponents';
import AudioRecorder from '../InputComponents/AudioRecorder';
import { IConfig } from '../../types/types';
import Button from './Button';
import { AttachIcon, FileIcon, RemoveIcon, SendIcon } from '../../assets/icons';
import {
  resolveIconBgColor,
  resolveIconColor,
} from '../../helpers/resolveIconColor';
import { parseMessageBody } from '../../helpers/parseMessageBody';
import { useT } from '../../i18n/useT';
import { OutgoingMention } from '../../networking/xmpp/sendTextMessage.xmpp';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';

export interface SendInputProps {
  sendMessage: (message: string, mentions?: OutgoingMention[]) => void | Promise<void>;
  sendMedia: (data: any, type: string) => void | Promise<void>;
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
  onSendMessage?: (message: string, mentions?: OutgoingMention[]) => void | Promise<void>;
  onSendMedia?: (data: any, type: string) => void | Promise<void>;
  placeholderText?: string;
}

interface MentionCandidate {
  xmppUsername: string;
  displayName: string;
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
}) => {
  const t = useT();
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(40);
  const [isFocused, setIsFocused] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mentions (XEP-0372): mention text is committed as literal "@Display
  // Name " in the composer text, and offsets are resolved from that text
  // right before sending (see resolveMentions) rather than tracked live -
  // simpler than diffing the textarea on every keystroke, and self-heals
  // if the user edits/deletes part of a mention (it just stops matching).
  const { roomsList, activeRoomJID } = useRoomState();
  const { user: currentUser } = useChatSettingState();
  const [mentionQuery, setMentionQuery] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [committedMentions, setCommittedMentions] = useState<
    MentionCandidate[]
  >([]);

  const mentionCandidates = useMemo((): MentionCandidate[] => {
    if (!mentionQuery) return [];
    const members = roomsList?.[activeRoomJID]?.members || [];
    const q = mentionQuery.query.toLowerCase();
    return members
      .filter(
        (m) => m.xmppUsername && m.xmppUsername !== currentUser?.xmppUsername
      )
      .map((m) => ({
        xmppUsername: m.xmppUsername,
        displayName:
          `${m.firstName || ''} ${m.lastName || ''}`.trim() ||
          m.xmppUsername,
      }))
      .filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.xmppUsername.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [mentionQuery, roomsList, activeRoomJID, currentUser?.xmppUsername]);

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        const newFiles = Array.from(files);
        setFilePreviews((prevFiles) => {
          const fileSet = new Set(prevFiles.map((file) => file.name));

          const uniqueNewFiles = newFiles.filter(
            (newFile) => !fileSet.has(newFile.name)
          );
          let combinedFiles = [...prevFiles, ...uniqueNewFiles];

          if (combinedFiles.length > 5) {
            combinedFiles = combinedFiles?.slice(0, 5);
          }

          return combinedFiles;
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    []
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
      setMessage(newValue);
      updateTextareaHeight(newValue);

      const caret = event.target.selectionStart ?? newValue.length;
      const uptoCaret = newValue.slice(0, caret);
      // "@" trigger: preceded by start-of-text or whitespace, no
      // whitespace between the "@" and the caret yet.
      const match = uptoCaret.match(/(?:^|\s)@([^\s@]*)$/);
      if (match) {
        setMentionQuery({ start: caret - match[1].length - 1, query: match[1] });
        setMentionSelectedIndex(0);
      } else {
        setMentionQuery(null);
      }
    },
    [updateTextareaHeight]
  );

  const handleSelectMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionQuery) return;
      const insertText = `@${candidate.displayName} `;
      const before = message.slice(0, mentionQuery.start);
      const after = message.slice(
        mentionQuery.start + 1 + mentionQuery.query.length
      );
      const newMessage = `${before}${insertText}${after}`;
      setMessage(newMessage);
      updateTextareaHeight(newMessage);
      setCommittedMentions((prev) => [
        ...prev,
        { xmppUsername: candidate.xmppUsername, displayName: candidate.displayName },
      ]);
      setMentionQuery(null);

      const caretPos = before.length + insertText.length;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(caretPos, caretPos);
        }
      });
    },
    [message, mentionQuery, updateTextareaHeight]
  );

  // Resolves committed mentions to XEP-0372 begin/end offsets in the final
  // outgoing text, in insertion order. A mention the user edited/deleted
  // simply won't be found and is dropped.
  const resolveMentions = useCallback(
    (text: string): OutgoingMention[] | undefined => {
      if (!committedMentions.length) return undefined;
      let searchFrom = 0;
      const resolved: OutgoingMention[] = [];
      for (const mention of committedMentions) {
        const needle = `@${mention.displayName}`;
        const idx = text.indexOf(needle, searchFrom);
        if (idx === -1) continue;
        resolved.push({
          begin: idx,
          end: idx + needle.length,
          xmppUsername: mention.xmppUsername,
        });
        searchFrom = idx + needle.length;
      }
      return resolved.length > 0 ? resolved : undefined;
    },
    [committedMentions]
  );

  useEffect(() => {
    setMessage(editMessage);
    if (editMessage) {
      updateTextareaHeight(editMessage);
    }
  }, [editMessage, updateTextareaHeight]);

  const effectiveSendMessage = onSendMessage || sendMessage;
  const effectiveSendMedia = onSendMedia || sendMedia;
  const hasTextContent = useCallback(
    (value: string) => /\S/.test(String(value || '')),
    []
  );

  const handleSendClick = useCallback(
    async (audioUrl?: string) => {
      const outgoing = formatMessage ? formatMessage(message) : message;
      const trailingText = hasTextContent(outgoing) ? outgoing : null;
      const mentions = trailingText ? resolveMentions(outgoing) : undefined;

      let mediaPromise: void | Promise<void> = undefined;

      if (filePreviews.length > 0) {
        mediaPromise = effectiveSendMedia(filePreviews[0], 'media');
        setIsRecording(false);
      } else if (audioUrl) {
        mediaPromise = effectiveSendMedia(audioUrl, 'audio/');
        setIsRecording(false);
      } else {
        if (!trailingText) {
          return;
        }
        effectiveSendMessage(trailingText, mentions);
        setMessage('');
        setFilePreviews([]);
        setTextareaHeight(40);
        setCommittedMentions([]);
        return;
      }

      setMessage('');
      setFilePreviews([]);
      setTextareaHeight(40);
      setCommittedMentions([]);

      if (trailingText) {
        // Wait for the media stanza to land before sending the caption so
        // recipients see media-then-text order on the wire.
        try {
          await mediaPromise;
        } catch {
          // Media sender owns its own error reporting; still emit the caption.
        }
        effectiveSendMessage(trailingText, mentions);
      }
    },
    [
      effectiveSendMedia,
      effectiveSendMessage,
      filePreviews,
      formatMessage,
      hasTextContent,
      message,
      resolveMentions,
    ]
  );

  const handleSecondaryClick = useCallback(() => {
    const outgoingBase = config.secondarySendButton.messageEdit + message;
    const outgoing = formatMessage ? formatMessage(outgoingBase) : outgoingBase;
    if (!hasTextContent(outgoing)) {
      return;
    }
    effectiveSendMessage(outgoing, resolveMentions(outgoing));
    setMessage('');
    setFilePreviews([]);
    setTextareaHeight(40);
    setCommittedMentions([]);
  }, [
    effectiveSendMessage,
    message,
    config?.secondarySendButton?.messageEdit,
    formatMessage,
    hasTextContent,
    resolveMentions,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (mentionQuery && mentionCandidates.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setMentionSelectedIndex((i) => (i + 1) % mentionCandidates.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionSelectedIndex(
            (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length
          );
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          handleSelectMention(mentionCandidates[mentionSelectedIndex]);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setMentionQuery(null);
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
      mentionQuery,
      mentionCandidates,
      mentionSelectedIndex,
      handleSelectMention,
    ]
  );

  const renderFilePreview = useCallback((file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const fileType = file.type.split('/')[0];

    if (fileType === 'image') {
      return <ImagePreview src={fileUrl} alt={file.name} />;
    } else if (fileType === 'video') {
      return <VideoPreview src={fileUrl} controls />;
    } else {
      return <FileIcon alt={file.name} color={resolveIconColor(config)} fill={resolveIconBgColor(config)}/>;
    }
  }, [config]);

  const memoizedFilePreviews = useMemo(() => {
    return filePreviews.map(
      (file: any, idx: number) =>
        idx < 1 && (
          <FilePreview key={file.name}>
            {renderFilePreview(file)}
            <Button
              style={{
                position: 'absolute',
                backgroundColor: 'transparent',
                top: 4,
                right: 4,
                height: 16,
                width: 16,
              }}
              onClick={() => handleRemoveFile(file)}
              EndIcon={<RemoveIcon style={{ height: 16, width: 16 }} />}
            />
          </FilePreview>
        )
    );
  }, [filePreviews, renderFilePreview, handleRemoveFile]);

  return (
    <InputContainer style={{ position: 'relative' }}>
      {mentionQuery && mentionCandidates.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 16,
            marginBottom: 4,
            width: 240,
            maxHeight: 200,
            overflowY: 'auto',
            backgroundColor: '#fcfcfc',
            border: '1px solid #E4E4E7',
            borderRadius: 8,
            boxShadow: '0px 4px 16px -4px rgba(18, 18, 25, 0.15)',
            zIndex: 1000,
          }}
        >
          {mentionCandidates.map((candidate, index) => (
            <div
              key={candidate.xmppUsername}
              onMouseDown={(event) => {
                // mousedown (not click) so this fires before the
                // textarea's blur handler steals focus.
                event.preventDefault();
                handleSelectMention(candidate);
              }}
              onMouseEnter={() => setMentionSelectedIndex(index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor:
                  index === mentionSelectedIndex ? '#F0F0F0' : 'transparent',
                fontSize: 'var(--ethora-font-size-sm, 14px)',
                color: '#141414',
              }}
            >
              {candidate.displayName}
            </div>
          ))}
        </div>
      )}
      <MessageInputContainer>
        {!isRecording && (
          <>
            {!config?.disableMedia && (
              <Button
                onClick={handleAttachClick}
                disabled={false}
                EndIcon={<AttachIcon color={resolveIconColor(config)} bgcolor={resolveIconBgColor(config)} />}
              />
            )}
            {multiline ? (
              <TextareaWrapper
                $dynamicHeight={textareaHeight}
                $color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                $isFocused={isFocused}
              >
                <TextareaInput
                  ref={textareaRef}
                  placeholder="Type message"
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
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
                $color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                placeholder={placeholderText || t('input.placeholder')}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
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
                style={{
                  color:
                    filePreviews.length > 0
                      ? '#fff'
                      : !message || message === ''
                        ? '#D4D4D8'
                        : '#fff',
                  borderRadius: '100px',
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
                        ? '#fff'
                        : !message || message === ''
                          ? '#D4D4D8'
                          : '#fff'
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
                EndIcon={
                  <SendIcon
                    bgcolor={resolveIconBgColor(config)}
                    color={
                      message === '' && filePreviews.length === 0
                        ? '#D4D4D8' // empty/disabled → muted grey
                        : 'var(--ethora-icon-color, #0052CD)' // active → colors.icons (locked by the icon-tint rule)
                    }
                  />
                }
                style={{
                  borderRadius: '100px',
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
            marginTop: 8,
            padding: 12,
            backgroundColor: '#fafafa',
            border: '1px solid #E4E4E7',
            borderRadius: 12,
            color: '#141414',
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
        onChange={handleFileChange}
      />
      {filePreviews.length > 0 && (
        <FilePreviewContainer>{memoizedFilePreviews}</FilePreviewContainer>
      )}
    </InputContainer>
  );
};

export default SendInput;
