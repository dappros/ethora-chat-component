import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import DropdownMenu from './DropdownMenu';
import { useModalDismiss } from '../../hooks/useModalDismiss';

// Regression tests for the "More Options" dropdown that could not be
// dismissed:
//  1. no Escape handling at all;
//  2. the click-outside listener guarded on `buttonRef.current`, which was
//     only ever attached in the `openButton` branch - the plain-trigger
//     branch (the room-list sidebar burger) left it null, so the whole
//     condition short-circuited to false and the menu never closed;
//  3. every menu owned private state, so two menus could be open at once;
//  4. opening a modal left the menu open underneath it.
// All four now come from the shared layer stack in useModalDismiss.

const options = [
  { label: 'Profile', icon: null, onClick: vi.fn() },
  { label: 'Logout', icon: null, onClick: vi.fn() },
];

const otherOptions = [{ label: 'Report', icon: null, onClick: vi.fn() }];

const openMenu = async (name: string) => {
  const triggers = screen.getAllByRole('button', { name });
  await userEvent.click(triggers[0]);
};

describe('DropdownMenu dismissal', () => {
  it('gives the plain trigger an accessible name and aria-expanded', async () => {
    renderWithProviders(<DropdownMenu options={options} />);

    const trigger = screen.getByRole('button', { name: 'More Options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape', async () => {
    renderWithProviders(<DropdownMenu options={options} />);

    await openMenu('More Options');
    expect(screen.getByText('Profile')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
  });

  it('returns focus to the trigger when it closes', async () => {
    renderWithProviders(<DropdownMenu options={options} />);

    const trigger = screen.getByRole('button', { name: 'More Options' });
    trigger.focus();
    await userEvent.click(trigger);
    // Focus moves into the menu on open.
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes when a press lands outside it', async () => {
    renderWithProviders(
      <>
        <button type="button">elsewhere</button>
        <DropdownMenu options={options} />
      </>
    );

    await openMenu('More Options');
    expect(screen.getByText('Logout')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));

    await waitFor(() =>
      expect(screen.queryByText('Logout')).not.toBeInTheDocument()
    );
  });

  it('still closes when an ancestor stops propagation on the press', async () => {
    renderWithProviders(
      <div
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <button type="button">elsewhere</button>
        <DropdownMenu options={options} />
      </div>
    );

    await openMenu('More Options');
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));

    await waitFor(() =>
      expect(screen.queryByText('Logout')).not.toBeInTheDocument()
    );
  });

  it('does not re-open when the trigger itself is pressed to close it', async () => {
    renderWithProviders(<DropdownMenu options={options} />);

    const trigger = screen.getByRole('button', { name: 'More Options' });
    await userEvent.click(trigger);
    expect(screen.getByText('Profile')).toBeInTheDocument();

    // A full press sequence on the trigger: the outside-press listener must
    // not close the menu only for the trigger's own click to re-open it.
    await userEvent.click(trigger);

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('lets only one menu be open at a time', async () => {
    renderWithProviders(
      <>
        <DropdownMenu options={options} />
        <DropdownMenu
          options={otherOptions}
          openButton={<button type="button" aria-label="Room options" />}
        />
      </>
    );

    await openMenu('More Options');
    expect(screen.getByText('Profile')).toBeInTheDocument();

    await openMenu('Room options');

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  it('ignores an Escape another handler already dealt with', async () => {
    // The composer's @-mention dropdown preventDefault()s Escape to close
    // itself; the menu layer must not consume that same key press.
    renderWithProviders(<DropdownMenu options={options} />);

    await openMenu('More Options');

    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    document.dispatchEvent(handled);

    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});

// A stand-in for any modal built on useModalDismiss (New Chat, profile,
// settings ...): what matters is that it registers a 'modal' layer.
const FakeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ onClose, containerRef });
  return (
    <div ref={containerRef} role="dialog">
      <button type="button">modal-action</button>
    </div>
  );
};

const MenuWithModal: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <DropdownMenu options={options} />
      <button type="button" onClick={() => setModalOpen(true)}>
        open-modal
      </button>
      {modalOpen && <FakeModal onClose={() => setModalOpen(false)} />}
    </>
  );
};

describe('DropdownMenu and modals', () => {
  it('closes the open menu when a modal opens on top', async () => {
    renderWithProviders(<MenuWithModal />);

    await openMenu('More Options');
    expect(screen.getByText('Profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'open-modal' }));

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not let the superseded menu steal focus back from the modal', async () => {
    renderWithProviders(<MenuWithModal />);

    await openMenu('More Options');
    fireEvent.click(screen.getByRole('button', { name: 'open-modal' }));

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'modal-action' })
    );
  });

  it('lets Escape close a menu opened inside a modal without closing the modal', async () => {
    const handleModalClose = vi.fn();
    renderWithProviders(
      <>
        <FakeModal onClose={handleModalClose} />
        <DropdownMenu options={options} />
      </>
    );

    // The menu registers on top of the already-open modal layer.
    await openMenu('More Options');
    expect(screen.getByText('Profile')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    );
    // The modal sits below the menu on the stack, so it keeps its Escape.
    expect(handleModalClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
