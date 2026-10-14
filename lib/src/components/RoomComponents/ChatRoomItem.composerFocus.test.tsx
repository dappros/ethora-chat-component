import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';
import { RoomListTestIds } from '../../testIds';
import {
  resetComposerFocusForTests,
  takeComposerFocusRequest,
} from '../../helpers/composerFocus';

const JID = 'room1@conference.example.com';

const makeRoom = (): IRoom =>
  ({ jid: JID, title: 'Room One', name: 'Room One', messages: [], unreadMessages: 0 }) as IRoom;

const getRow = () =>
  document.querySelector(`[data-testid="${RoomListTestIds.roomRow}"]`) as HTMLElement;

/** Viewport at or below `maxWidth` px; everything else is a desktop. */
const stubViewport = (maxWidth: number | null) => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const match = /max-width:\s*(\d+)px/.exec(query);
    const matches = maxWidth !== null && !!match && maxWidth <= Number(match[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
};

const renderRow = (isChatActive: boolean, performClick = vi.fn()) =>
  renderWithProviders(
    <ChatRoomItem
      chat={makeRoom()}
      isChatActive={isChatActive}
      performClick={performClick}
      config={{} as never}
    />
  );

afterEach(() => {
  resetComposerFocusForTests();
});

describe('room row asks the composer for focus', () => {
  it('requests focus on a desktop click and still opens the room', async () => {
    const restore = stubViewport(null);
    const performClick = vi.fn();
    const user = userEvent.setup();
    renderRow(false, performClick);

    await user.click(getRow());

    expect(performClick).toHaveBeenCalledTimes(1);
    expect(takeComposerFocusRequest(JID)).toBe(true);
    restore();
  });

  it('requests focus again when the already open chat is clicked', async () => {
    const restore = stubViewport(null);
    const performClick = vi.fn();
    const user = userEvent.setup();
    renderRow(true, performClick);

    await user.click(getRow());

    expect(takeComposerFocusRequest(JID)).toBe(true);
    restore();
  });

  it('requests focus for Enter on a desktop row', () => {
    const restore = stubViewport(null);
    renderRow(false);

    fireEvent.keyDown(getRow(), { key: 'Enter' });

    expect(takeComposerFocusRequest(JID)).toBe(true);
    restore();
  });

  it('does not request focus on a phone-sized viewport, so the keyboard stays down', async () => {
    const restore = stubViewport(400);
    const performClick = vi.fn();
    const user = userEvent.setup();
    renderRow(false, performClick);

    await user.click(getRow());

    expect(performClick).toHaveBeenCalledTimes(1);
    expect(takeComposerFocusRequest(JID)).toBe(false);
    restore();
  });

  it('treats the 767px breakpoint as the phone boundary', () => {
    const restore = stubViewport(767);
    renderRow(false);

    fireEvent.click(getRow());

    expect(takeComposerFocusRequest(JID)).toBe(false);
    restore();
  });
});
