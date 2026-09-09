import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';

// The real picker lazily imports @emoji-mart/react + the full emoji dataset.
// Rendering that in jsdom tests nothing about the composer and costs a
// multi-hundred-KB JSON parse per test file, so stand in for it with a
// button that fires the same onEmojiSelect payload emoji-mart does.
vi.mock('../EmojiPicker/LazyEmojiPicker', () => ({
  default: ({ onEmojiSelect }: any) => (
    <button
      type="button"
      data-testid="mock-emoji"
      onClick={() => onEmojiSelect({ native: '😀' })}
    >
      pick
    </button>
  ),
}));

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

const setup = () => {
  const sendMedia = vi.fn();
  const sendMessage = vi.fn();

  const { container } = renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      multiline
    />,
    { preloadedState: { chatSettingStore: { config: {} } } as never }
  );

  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  const emojiButton = screen.getByLabelText('Insert emoji');

  return { sendMedia, sendMessage, textarea, emojiButton };
};

describe('SendInput emoji picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes an accessible, i18n-driven name for the trigger', () => {
    const { emojiButton } = setup();
    expect(emojiButton).toBeTruthy();
    expect(emojiButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and closes the picker on the trigger', () => {
    const { emojiButton } = setup();

    expect(screen.queryByTestId('mock-emoji')).toBeNull();

    fireEvent.click(emojiButton);
    expect(screen.getByTestId('mock-emoji')).toBeTruthy();
    expect(emojiButton.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(emojiButton);
    expect(screen.queryByTestId('mock-emoji')).toBeNull();
  });

  // The whole point of the feature: an emoji goes where the caret is, not
  // onto the end of whatever is already typed.
  it('inserts the emoji at the caret, not at the end', () => {
    const { textarea, emojiButton } = setup();

    fireEvent.change(textarea, { target: { value: 'hello world' } });
    textarea.setSelectionRange(5, 5);

    fireEvent.click(emojiButton);
    fireEvent.click(screen.getByTestId('mock-emoji'));

    expect(textarea.value).toBe('hello😀 world');
  });

  it('leaves the caret just after the inserted emoji, in the textarea', () => {
    const { textarea, emojiButton } = setup();

    fireEvent.change(textarea, { target: { value: 'ab' } });
    textarea.setSelectionRange(1, 1);

    fireEvent.click(emojiButton);
    fireEvent.click(screen.getByTestId('mock-emoji'));

    expect(textarea.value).toBe('a😀b');
    // '😀' is a surrogate pair: two UTF-16 code units.
    expect(textarea.selectionStart).toBe(1 + '😀'.length);
    expect(document.activeElement).toBe(textarea);
  });

  it('replaces the current selection rather than inserting beside it', () => {
    const { textarea, emojiButton } = setup();

    fireEvent.change(textarea, { target: { value: 'good bad end' } });
    textarea.setSelectionRange(5, 8);

    fireEvent.click(emojiButton);
    fireEvent.click(screen.getByTestId('mock-emoji'));

    expect(textarea.value).toBe('good 😀 end');
  });

  it('closes the picker after a pick', () => {
    const { textarea, emojiButton } = setup();

    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.click(emojiButton);
    fireEvent.click(screen.getByTestId('mock-emoji'));

    expect(screen.queryByTestId('mock-emoji')).toBeNull();
  });

  it('closes the picker on Escape and on an outside click', () => {
    const { emojiButton } = setup();

    fireEvent.click(emojiButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mock-emoji')).toBeNull();

    fireEvent.click(emojiButton);
    expect(screen.getByTestId('mock-emoji')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('mock-emoji')).toBeNull();
  });

  it('sends the message with the emoji in it', () => {
    const { textarea, emojiButton, sendMessage } = setup();

    fireEvent.change(textarea, { target: { value: 'hi' } });
    textarea.setSelectionRange(2, 2);
    fireEvent.click(emojiButton);
    fireEvent.click(screen.getByTestId('mock-emoji'));

    fireEvent.click(screen.getByLabelText('Send'));
    expect(sendMessage).toHaveBeenCalledWith('hi😀', []);
  });
});
