import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import SideDrawer, { DrawerNavRow } from './SideDrawer';

// The profile/settings panels used to render as a full-page surface that
// replaced the room list and the chat. They now share this one drawer, so the
// dismissal contract (Escape, focus in, focus back) and the accessible name
// live in exactly one place - these tests pin that place down.
describe('SideDrawer', () => {
  it('is a dialog named by its own heading', () => {
    renderWithProviders(
      <SideDrawer title="Settings" onClose={() => {}}>
        <div>body</div>
      </SideDrawer>
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toBeTruthy();
    // The heading is a real <h2>, not a styled div, so the panel has a
    // document outline rather than just big text.
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <SideDrawer title="Profile" onClose={onClose}>
        <div>body</div>
      </SideDrawer>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <SideDrawer title="Profile" onClose={onClose} backLabel="Go back">
        <div>body</div>
      </SideDrawer>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the drawer and restores it on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'chat title';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderWithProviders(
      <SideDrawer title="Chat Profile" onClose={() => {}}>
        <button type="button">inside</button>
      </SideDrawer>
    );

    // First focusable in DOM order is the header's close/back button.
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
    expect(
      screen
        .getByRole('dialog', { name: 'Chat Profile' })
        .contains(document.activeElement)
    ).toBe(true);

    unmount();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('renders nav rows as real buttons carrying their hint text', () => {
    const onClick = vi.fn();
    renderWithProviders(
      <SideDrawer title="Settings" onClose={() => {}}>
        <DrawerNavRow label="Manage Data" hint="Download or delete" onClick={onClick} />
      </SideDrawer>
    );

    const row = screen.getByRole('button', { name: /Manage Data/ });
    expect(row.textContent).toContain('Download or delete');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
