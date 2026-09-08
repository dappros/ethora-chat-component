import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarkdownBody from './MarkdownBody';
import { spliceMentionMarkup } from './mentions';
import { IMentionSpan } from '../types/types';

// Guards the one link in the mention chain that the pure-helper tests can't
// reach: the custom `<mention>` tag spliceMentionMarkup emits has to survive
// rehype-raw and land on MarkdownBody's `components` override, not render as
// escaped text or get dropped.
describe('MarkdownBody mention rendering', () => {
  const spans: IMentionSpan[] = [
    { jid: 'alice@xmpp.chat.ethora.com', name: 'Alice Smith', offset: 4, length: 12 },
  ];

  it('renders a mention span as a clickable element and reports the click', () => {
    const onMentionClick = vi.fn();
    const text = spliceMentionMarkup('Hey @Alice Smith, look', spans);

    render(<MarkdownBody text={text} onMentionClick={onMentionClick} />);

    const mention = screen.getByRole('button');
    expect(mention.textContent).toBe('@Alice Smith');

    fireEvent.click(mention);
    expect(onMentionClick).toHaveBeenCalledWith({
      jid: 'alice@xmpp.chat.ethora.com',
      name: 'Alice Smith',
    });
  });

  it('renders a mention with no jid as plain, non-interactive text', () => {
    render(
      <MarkdownBody
        text={'Hey <mention data-name="Alice">@Alice</mention>'}
        onMentionClick={vi.fn()}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/@Alice/)).toBeTruthy();
  });
});
