import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';
import roomsReducer from '../../roomStore/roomsSlice';
import {
  requestComposerFocus,
  resetComposerFocusForTests,
  takeComposerFocusRequest,
} from '../../helpers/composerFocus';

const JID = 'room1@conference.example.com';
const OTHER_JID = 'room2@conference.example.com';

// Rooms slice in the state a signed-in session starts from, with one room
// open. Built from the reducer so new slice fields never go stale here.
const MEMBER = { xmppUsername: 'peer@example.com', firstName: 'Peer', lastName: 'One' };

const roomsWithActive = (activeRoomJID: string) => {
  const initial = roomsReducer(undefined, { type: '@@test/init' });
  return {
    ...initial,
    activeRoomJID,
    rooms: {
      // A member is seeded so the composer does not try to load the roster.
      [JID]: { jid: JID, name: 'room1', messages: [], members: [MEMBER] },
      [OTHER_JID]: { jid: OTHER_JID, name: 'room2', messages: [], members: [MEMBER] },
    },
  };
};

const renderComposer = (props: Partial<React.ComponentProps<typeof SendInput>> = {}) => {
  const sendMessage = vi.fn();
  const sendMedia = vi.fn(async () => true);
  const result = renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      {...props}
    />,
    {
      preloadedState: { rooms: roomsWithActive(JID) } as never,
    }
  );
  const input = result.container.querySelector(
    'input:not([type="file"]), textarea'
  ) as HTMLInputElement;
  return { ...result, input, sendMessage, sendMedia };
};

afterEach(() => {
  resetComposerFocusForTests();
});

describe('composer focus on a chat switch', () => {
  it('takes focus when the room list asks for it', async () => {
    const { input } = renderComposer({ focusOnRoomSwitch: true });
    expect(document.activeElement).not.toBe(input);

    act(() => {
      requestComposerFocus(JID);
    });

    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('takes focus again on a repeat request for the same room', async () => {
    const { input } = renderComposer({ focusOnRoomSwitch: true });

    act(() => requestComposerFocus(JID));
    await waitFor(() => expect(document.activeElement).toBe(input));

    input.blur();
    expect(document.activeElement).not.toBe(input);

    act(() => requestComposerFocus(JID));
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('takes focus when it mounts after the request was made', async () => {
    // The request is parked before the composer exists; a composer that
    // mounts afterwards must still claim it once it is in the DOM.
    requestComposerFocus(JID);
    const { input } = renderComposer({ focusOnRoomSwitch: true });

    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('ignores a request for another room', async () => {
    const { input } = renderComposer({ focusOnRoomSwitch: true });

    act(() => requestComposerFocus(OTHER_JID));

    expect(document.activeElement).not.toBe(input);
    // Still parked for the room it was made for.
    expect(takeComposerFocusRequest(OTHER_JID)).toBe(true);
  });

  it('leaves a second composer alone, so the request stays for the main one', async () => {
    const { input } = renderComposer({ focusOnRoomSwitch: false });

    act(() => requestComposerFocus(JID));

    expect(document.activeElement).not.toBe(input);
    expect(takeComposerFocusRequest(JID)).toBe(true);
  });
});

describe('caption sent with a media message', () => {
  const pickFile = (container: HTMLElement) => {
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'photo.png', { type: 'image/png', lastModified: 1 });
    fireEvent.change(fileInput, { target: { files: [file] } });
    return file;
  };

  it('hands the caption to the media send and never sends it as a text message', async () => {
    const { container, input, sendMedia, sendMessage } = renderComposer();
    const file = pickFile(container);
    fireEvent.change(input, { target: { value: 'look at this' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(1));
    expect(sendMedia).toHaveBeenCalledWith([file], 'media', {
      text: 'look at this',
      mentions: expect.anything(),
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('clears the composer at once, even when the media is not delivered', async () => {
    // The caption is part of the media message now: a failed upload keeps it
    // on that message (for the retry), so it is not put back in the composer.
    const undelivered = vi.fn(async () => false);
    const { container, input, sendMessage } = renderComposer({
      sendMedia: undelivered,
    });
    pickFile(container);
    fireEvent.change(input, { target: { value: 'look at this' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(undelivered).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
