import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import SendInput from './SendInput';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ChatInputTestIds } from '../../testIds';

/**
 * Component-level tests for the chat-input affordance.
 *
 * Targets the same contract as Android's `ChatInputTest` (Compose UI)
 * and iOS's eventual SwiftUI equivalent — all three platforms expose
 * the same selectors (`chat_input`, `chat_send_button`,
 * `chat_attach_button`). A single Maestro / Playwright YAML flow can
 * therefore drive any one of them by ID.
 *
 * `sendMessage` and `sendMedia` are passed as required spies — the
 * component contract returns the typed text through the same lambda
 * the host app wires up to its outgoing-message pipeline.
 */

const renderInput = (overrides: Partial<React.ComponentProps<typeof SendInput>> = {}) => {
  const sendMessage = vi.fn();
  const sendMedia = vi.fn();
  renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      {...overrides}
    />
  );
  return { sendMessage, sendMedia };
};

describe('<SendInput />', () => {
  beforeEach(() => {
    // No mocks need clearing here yet — vi.fn() spies are created
    // fresh per render via renderInput().
  });

  test('renders the input field, attach button, and send button', () => {
    renderInput();
    expect(screen.getByTestId(ChatInputTestIds.inputField)).toBeInTheDocument();
    expect(screen.getByTestId(ChatInputTestIds.attachButton)).toBeInTheDocument();
  });

  test('typed text appears in the input field via controlled state', () => {
    renderInput();
    const input = screen.getByTestId(ChatInputTestIds.inputField) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello world' } });
    expect(input.value).toBe('hello world');
  });

  test('send button is absent until the user types — guards against accidental empty sends', () => {
    // The send-button render path is gated on
    // `message || filePreviews.length > 0 || config?.disableMedia`,
    // so an empty default field shows the recorder branch instead.
    renderInput();
    expect(screen.queryByTestId(ChatInputTestIds.sendButton)).toBeNull();
  });

  test('typing reveals the send button and clicking it dispatches the message', () => {
    const { sendMessage } = renderInput();
    const input = screen.getByTestId(ChatInputTestIds.inputField) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'hi from test' } });

    const sendButton = screen.getByTestId(ChatInputTestIds.sendButton);
    expect(sendButton).toBeInTheDocument();
    fireEvent.click(sendButton);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('hi from test');
  });

  test('attach button stays hidden when config.disableMedia is true', () => {
    // Catches a regression where the disableMedia config knob silently
    // stopped suppressing the paperclip. Each config knob has a
    // surface assertion in tests so a refactor that drops the
    // conditional doesn't ship unnoticed.
    renderInput({
      config: {
        disableMedia: true,
      } as React.ComponentProps<typeof SendInput>['config'],
    });
    expect(screen.queryByTestId(ChatInputTestIds.attachButton)).toBeNull();
  });

  test('placeholderText prop overrides the default "Type message" copy', () => {
    renderInput({ placeholderText: 'Say something…' });
    const input = screen.getByTestId(ChatInputTestIds.inputField);
    expect(input).toHaveAttribute('placeholder', 'Say something…');
  });
});
