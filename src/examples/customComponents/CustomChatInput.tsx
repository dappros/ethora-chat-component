import React, { useCallback, useRef, useState } from 'react';
import { SendInputProps } from '../../components/styled/SendInput';

type CustomChatInputProps = SendInputProps & {
  onSendMessage?: (message: string) => void;
  onSendMedia?: (data: any, type: string) => void;
  placeholderText?: string;
};

const CustomChatInput: React.FC<CustomChatInputProps> = ({
  onSendMessage,
  onSendMedia,
  isLoading,
  isMessageProcessing,
  placeholderText = 'Type a message',
}) => {
  const [value, setValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = value.trim().length > 0 && !isMessageProcessing && !isLoading;

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSend) return;
      onSendMessage?.(value.trim());
      setValue('');
    },
    [canSend, onSendMessage, value]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files[0]) {
        onSendMedia?.(files[0], files[0].type || 'media');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onSendMedia]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 border-t border-gray-200 bg-white p-3"
      style={{ borderTop: '1px solid #E4E4E7' }}
    >
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-full border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        disabled={isLoading}
      >
        Attach
      </button>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        type="text"
        placeholder={placeholderText}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={isLoading || isMessageProcessing}
        className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        style={{ borderRadius: '999px' }}
      />
      <button
        type="submit"
        disabled={!canSend}
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
};

export default CustomChatInput;

