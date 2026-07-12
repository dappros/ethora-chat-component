import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';

// jsdom doesn't implement this - SendInput's file previews call it directly.
beforeAll(() => {
  (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
});

const ROOM_JID = 'room1@conference.example.com';

const makeFile = (name: string) =>
  new File(['x'], name, { type: 'image/png' });

function renderSendInput(sendMedia: any, sendMessage = vi.fn()) {
  return renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      multiline
      config={{} as any}
    />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: {
          rooms: { [ROOM_JID]: { jid: ROOM_JID, members: [] } },
          activeRoomJID: ROOM_JID,
          usersSet: {},
        } as any,
      },
    }
  );
}

const selectFiles = (input: HTMLElement, files: File[]) => {
  fireEvent.change(input, { target: { files } });
};

describe('SendInput - multi-file selection', () => {
  it('previews every selected file, not just the first', () => {
    const { container } = renderSendInput(vi.fn());
    const fileInput = container.querySelector('input[type="file"]')!;

    selectFiles(fileInput, [makeFile('a.png'), makeFile('b.png'), makeFile('c.png')]);

    expect(container.querySelectorAll('img').length).toBe(3);
  });

  it('the hidden file input accepts multiple files', () => {
    const { container } = renderSendInput(vi.fn());
    const fileInput = container.querySelector('input[type="file"]')!;
    expect(fileInput.hasAttribute('multiple')).toBe(true);
  });

  it('sends all files in parallel with a shared albumId when there is more than one', async () => {
    const sendMedia = vi.fn().mockResolvedValue(true);
    const { container } = renderSendInput(sendMedia);
    const fileInput = container.querySelector('input[type="file"]')!;
    selectFiles(fileInput, [makeFile('a.png'), makeFile('b.png')]);

    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(2));

    const [firstCallAlbumId] = [sendMedia.mock.calls[0][2]];
    expect(firstCallAlbumId).toBeTruthy();
    expect(sendMedia.mock.calls[1][2]).toBe(firstCallAlbumId);
  });

  it('does not tag a lone file with an albumId', async () => {
    const sendMedia = vi.fn().mockResolvedValue(true);
    const { container } = renderSendInput(sendMedia);
    const fileInput = container.querySelector('input[type="file"]')!;
    selectFiles(fileInput, [makeFile('a.png')]);

    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(1));
    expect(sendMedia.mock.calls[0][2]).toBeUndefined();
  });

  it('keeps a failed file in the preview with an error state, clears the successful ones', async () => {
    const sendMedia = vi.fn(async (file: File) => file.name !== 'bad.png');
    const { container } = renderSendInput(sendMedia);
    const fileInput = container.querySelector('input[type="file"]')!;
    selectFiles(fileInput, [makeFile('good.png'), makeFile('bad.png')]);

    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(1));
    expect(screen.getByTitle('Failed to send - press send to retry')).toBeTruthy();
  });
});
