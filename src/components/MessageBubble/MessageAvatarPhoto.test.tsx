import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import { MessageAvatarPhoto } from './MessageAvatarPhoto';
import { markAvatarLoaded, resetAvatarCache } from '../../helpers/avatarImageCache';

const renderIt = (ui: React.ReactElement, fileToken = 'T1') => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice },
    preloadedState: {
      chatSettingStore: {
        ...(chatSettingsSlice(undefined, { type: '@@init' }) as any),
        user: { fileToken },
      },
    } as any,
  });
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('MessageAvatarPhoto', () => {
  beforeEach(() => resetAvatarCache());

  it('paints initials immediately while the photo is still loading', () => {
    renderIt(
      <MessageAvatarPhoto src="https://files.chat.ethora.com/a.jpg" username="Jane Doe" />
    );
    expect(screen.getByText('JD')).toBeTruthy();
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.style.opacity).toBe('0');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('shows the photo and drops initials once loaded', () => {
    renderIt(
      <MessageAvatarPhoto src="https://files.chat.ethora.com/a.jpg" username="Jane Doe" />
    );
    fireEvent.load(screen.getByRole('img'));
    expect((screen.getByRole('img') as HTMLImageElement).style.opacity).toBe('1');
    expect(screen.queryByText('JD')).toBeNull();
  });

  it('falls back to initials when the photo fails', () => {
    renderIt(
      <MessageAvatarPhoto src="https://files.chat.ethora.com/b.jpg" username="Jane Doe" />
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JD')).toBeTruthy();
  });

  it('does not repeat a request for a URL that just failed', () => {
    const url = 'https://files.chat.ethora.com/dead.jpg';
    const first = renderIt(<MessageAvatarPhoto src={url} username="Jane Doe" />);
    fireEvent.error(screen.getByRole('img'));
    first.unmount();
    renderIt(<MessageAvatarPhoto src={url} username="Jane Doe" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JD')).toBeTruthy();
  });

  it('renders the token in the URL at once and reuses a loaded URL after rotation', () => {
    const base = 'https://secure-files.chat-qa.ethora.com/secure-media/x.png';
    const a = renderIt(<MessageAvatarPhoto src={base} username="Jane Doe" />, 'T1');
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(`${base}?ft=T1`);
    fireEvent.load(img);
    a.unmount();

    // New component after the token rotated: same bytes, no new URL, no flash.
    renderIt(<MessageAvatarPhoto src={base} username="Jane Doe" />, 'T2');
    const again = screen.getByRole('img') as HTMLImageElement;
    expect(again.getAttribute('src')).toBe(`${base}?ft=T1`);
    expect(again.style.opacity).toBe('1');
    expect(screen.queryByText('JD')).toBeNull();
  });

  it('draws a photo loaded earlier this session at once (no empty flash on remount)', () => {
    markAvatarLoaded('https://files.chat.ethora.com/a.jpg');
    renderIt(
      <MessageAvatarPhoto src="https://files.chat.ethora.com/a.jpg" username="Jane Doe" />
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.style.opacity).toBe('1');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('decoding')).toBe('sync');
  });
});
