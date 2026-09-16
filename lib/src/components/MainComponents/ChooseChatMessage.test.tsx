import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../hooks/useChatSettingState', () => ({
  useChatSettingState: () => ({ config: {} }),
}));

import { ChooseChatMessage } from './ChooseChatMessage';

describe('ChooseChatMessage', () => {
  it('shows the idle prompt by default', () => {
    render(<ChooseChatMessage />);
    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
    expect(
      screen.getByText('Choose a chat to start messaging.')
    ).toBeInTheDocument();
  });

  it('explains the failure when a requested room is unavailable', () => {
    // A dead QR / expired link / members-only room used to render the exact
    // same "pick a chat" placeholder as an idle pane, with no hint that
    // anything had been attempted or failed.
    render(<ChooseChatMessage unavailable />);
    expect(screen.getByText("This chat isn't available")).toBeInTheDocument();
    expect(
      screen.getByText(
        'The link may have expired, or you may not be a member of this chat.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Start a Conversation')).not.toBeInTheDocument();
  });
});
