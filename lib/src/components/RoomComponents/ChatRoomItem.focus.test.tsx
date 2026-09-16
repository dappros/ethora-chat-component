import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';
import { RoomListTestIds } from '../../testIds';

const noop = () => {};

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 0,
    ...overrides,
  }) as IRoom;

const getRow = () =>
  document.querySelector(
    `[data-testid="${RoomListTestIds.roomRow}"]`
  ) as HTMLElement;

// Regression for: a mouse click on a room row left a thick purple
// :focus-visible ring drawn around it. The row is a plain div made
// focusable with role="button"/tabIndex=0, not a real <button> - and
// unlike a real button, browsers show :focus-visible for a pointer click
// on that kind of element (it needed tabIndex to be focusable at all, so
// the browser treats a click landing focus on it as worth flagging, not
// just an incidental side effect the way it is for a native control).
// Moving DOM focus onto click is itself just the browser's default
// mousedown action, so cancelling that default stops the row from ever
// taking focus on a pointer interaction - :focus-visible can never match
// something that was never focused. Tab-driven keyboard focus doesn't go
// through mousedown, so it must still land on the row exactly as before.
describe('ChatRoomItem row focus behavior', () => {
  it('leaves no focus on the row after a pointer click, and still opens the room', async () => {
    const performClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom()}
        isChatActive={false}
        performClick={performClick}
        config={{} as never}
      />
    );

    const row = getRow();
    expect(row).not.toBeNull();
    // The browser may focus the row on mousedown; what matters is that it
    // does not stay focused once the click has been handled, so no ring
    // is left behind for a pointer user.
    expect(document.activeElement).not.toBe(row);

    // userEvent.click() (unlike a bare fireEvent.click()) dispatches the
    // full pointerdown/mousedown/mouseup/click sequence a real mouse click
    // produces, including the browser's own focus-follows-mousedown step -
    // so it actually exercises the default action the row's handler
    // cancels, instead of only the synthetic click a real browser would
    // never see on its own.
    await user.click(row);

    expect(document.activeElement).not.toBe(row);
    // Cancelling the browser's default focus action on mousedown must not
    // cancel the click itself - the row still has to open the room.
    expect(performClick).toHaveBeenCalledTimes(1);
  });

  it('still accepts focus reached by keyboard (Tab), for the visible ring to attach to', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom()}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    const row = getRow();
    expect(row).not.toBeNull();
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute('role')).toBe('button');

    // Tab landing on an element is a direct focus, with no preceding
    // mousedown - .focus() is the faithful way to reproduce that in a
    // jsdom test (there is no real browser Tab order to drive here).
    row.focus();
    expect(document.activeElement).toBe(row);
  });

  it('defines the keyboard focus ring as an inset, token-driven box-shadow (no outline, no hardcoded colour)', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom()}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    const row = getRow();

    // styled-components gives the row two classes: a static "sc-..."
    // component-id class, and a dynamic hash class the actual CSS rules
    // are keyed on (e.g. "sc-fszimp dgovu" -> rules are written against
    // ".dgovu"). The dynamic one is always last.
    const classes = Array.from(row.classList);
    const dynamicClass = classes[classes.length - 1];

    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');

    // Find the block for this row's own generated class rather than
    // searching the whole sheet - BurgerButton/TabButton deliberately keep
    // the outline treatment (real <button>s, small targets, no bleed into
    // a hairline divider), so a sheet-wide search for "outline" would pass
    // even if this row's own rule regressed back to one.
    const ruleStart = css.indexOf(`.${dynamicClass}:focus-visible{`);
    expect(ruleStart).toBeGreaterThan(-1);
    const rule = css.slice(ruleStart, css.indexOf('}', ruleStart) + 1);

    expect(rule).toContain('box-shadow:inset');
    expect(rule).toContain('var(--ethora-color-primary');
    expect(rule).toContain('var(--ethora-focus-ring-width');
    expect(rule).not.toMatch(/outline:\s*2px solid/);
  });
});
