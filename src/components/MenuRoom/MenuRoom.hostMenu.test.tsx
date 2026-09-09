import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RoomMenu } from './MenuRoom';

const renderMenu = (config: Record<string, unknown>) =>
  renderWithProviders(
    <RoomMenu handleLeaveClick={vi.fn()} handleReportClick={vi.fn()} />,
    { preloadedState: { chatSettingStore: { config } as any } }
  );

const clickTheMoreButton = () => {
  const button = document.querySelector('button');
  if (!button) throw new Error('room menu button not rendered');
  fireEvent.click(button);
};

describe('chat header room menu (config.headerChatMenu)', () => {
  it('opens the built-in Report/Leave dropdown when no handler is given', () => {
    renderMenu({});

    clickTheMoreButton();

    expect(screen.getByText('Report')).toBeTruthy();
    expect(screen.getByText('Leave')).toBeTruthy();
  });

  it('calls the host handler instead of opening the dropdown', () => {
    const headerChatMenu = vi.fn();
    renderMenu({ headerChatMenu });

    clickTheMoreButton();

    expect(headerChatMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Report')).toBeNull();
    expect(screen.queryByText('Leave')).toBeNull();
  });

  it('keeps the button labelled through i18n so it stays reachable', () => {
    renderMenu({ headerChatMenu: vi.fn(), i18n: { locale: 'es' } });

    expect(screen.getByLabelText('Menú del chat')).toBeTruthy();
  });
});
