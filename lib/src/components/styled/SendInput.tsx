import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  AttachmentNotice,
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
import { IConfig } from '../../types/types';
import Button from './Button';
import { AttachIcon, SendIcon } from '../../assets/icons';
import {
  resolveIconBgColor,
  resolveIconColor,
} from '../../helpers/resolveIconColor';
import { parseMessageBody } from '../../helpers/parseMessageBody';
import { useT } from '../../i18n/useT';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';

const DEFAULT_MAX_FILES = 5;

/** Identity for dedup: same name AND size AND mtime is the same pick. */
const fileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified ?? 0}`;

export interface SendInputProps {
  sendMessage: (message: string) => void | Promise<void>;
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
  onSendMessage?: (message: string) => void | Promise<void>;
  onSendMedia?: (
    data: File[] | File | Blob,
    type: string
  ) => void | Promise<void>;
  placeholderText?: string;
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
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files || []);

      // Reset first: re-picking the same file must fire `change` again.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      setMessage(newValue);
      updateTextareaHeight(newValue);
    },
    [updateTextareaHeight]
  );

  useEffect(() => {
    // `undefined` here flips the input from controlled to uncontrolled.
    setMessage(editMessage ?? '');
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
        effectiveSendMessage(trailingText);
        setMessage('');
        setFilePreviews([]);
        setAttachmentNotice(null);
        setTextareaHeight(40);
        return;
      }

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
        effectiveSendMessage(trailingText);
      }
    },
    [
      effectiveSendMedia,
      effectiveSendMessage,
      filePreviews,
      formatMessage,
      hasTextContent,
      message,
    ]
  );

  const handleSecondaryClick = useCallback(() => {
    const outgoingBase = config.secondarySendButton.messageEdit + message;
    const outgoing = formatMessage ? formatMessage(outgoingBase) : outgoingBase;
    if (!hasTextContent(outgoing)) {
      return;
    }
    effectiveSendMessage(outgoing);
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
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    <InputContainer>
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
            {multiline ? (
              <TextareaWrapper
                $dynamicHeight={textareaHeight}
                $color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                $isFocused={isFocused}
              >
                <TextareaInput
                  ref={textareaRef}
                  placeholder={placeholderText || t('input.placeholder')}
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
