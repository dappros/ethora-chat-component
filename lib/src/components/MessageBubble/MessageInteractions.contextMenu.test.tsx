import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

// Regression tests for the right-click message menu getting clipped by the
// composer at the bottom of the screen (reported via screenshot: the Delete
// row rendered behind the input bar). The menu used to be positioned with a
// hardcoded "menu height" guess computed before any of it existed on screen;
// now it measures its own rendered container and flips/clamps against the
// real viewport.

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me@example.com', name: 'Me' },
    ...overrides,
  }) as IMessage;

const makeRoom = (): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
  }) as IRoom;

function renderMessage(message: IMessage) {
  return renderWithProviders(
    <Message message={message} isUser={true} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: {
          rooms: { [ROOM_JID]: makeRoom() },
          usersSet: {},
        } as any,
      },
    }
  );
}

// The only element the menu sets an inline top/left style on is the
// (ref-measured) ContainerInteractions wrapper - grab it by that trait
// rather than reaching for internals.
const getMenuContainer = () =>
  Array.from(document.querySelectorAll<HTMLElement>('div')).find(
    (el) => el.style.top !== '' && el.style.left !== ''
  );

const openContextMenu = async (x: number, y: number) => {
  fireEvent.contextMenu(screen.getByText('hello'), {
    clientX: x,
    clientY: y,
  });
  await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument());
};

describe('MessageInteractions - context menu viewport clamping', () => {
  let originalOffsetHeight: PropertyDescriptor | undefined;
  let originalOffsetWidth: PropertyDescriptor | undefined;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    });

    originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight'
    );
    originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetWidth'
    );
  });

  afterEach(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalOffsetHeight
      );
    }
    if (originalOffsetWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetWidth',
        originalOffsetWidth
      );
    }
  });

  const stubMenuSize = (width: number, height: number) => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: width,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: height,
    });
  };

  it('keeps the menu at the click point when it fits on screen', async () => {
    stubMenuSize(240, 100);
    renderMessage(makeMessage());

    await openContextMenu(300, 50);

    const menu = getMenuContainer();
    expect(menu?.style.top).toBe('50px');
    expect(menu?.style.left).toBe('300px');
  });

  it('flips the menu above the click point when it would overflow the bottom', async () => {
    // A tall menu (e.g. Reply/Copy/Edit/Delete + reactions) clicked near the
    // bottom of a 500px-tall viewport used to render mostly behind the
    // composer.
    stubMenuSize(240, 400);
    renderMessage(makeMessage());

    await openContextMenu(300, 450);

    const menu = getMenuContainer();
    // 450 + 400 + margin overflows 500, so it flips above the click point:
    // 450 - 400 = 50.
    expect(menu?.style.top).toBe('50px');
  });

  it('clamps a flip that would still go off the top edge to the viewport margin', async () => {
    stubMenuSize(240, 400);
    renderMessage(makeMessage());

    // Clicked very close to the top; flipping straight up would go negative.
    await openContextMenu(300, 60);

    const menu = getMenuContainer();
    const top = parseFloat(menu?.style.top ?? '0');
    expect(top).toBeGreaterThanOrEqual(8);
  });

  it('clamps horizontally so the menu never runs off the right edge', async () => {
    stubMenuSize(300, 100);
    renderMessage(makeMessage());

    await openContextMenu(750, 50);

    const menu = getMenuContainer();
    // window is 800px wide, menu is 300px wide, margin 8px -> 800-300-8=492.
    expect(menu?.style.left).toBe('492px');
  });
});
