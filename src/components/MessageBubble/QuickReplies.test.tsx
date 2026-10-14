import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuickReplies from './QuickReplies';
import { resetAnsweredQuickReplies } from '../../helpers/quickReplies';

const LONG_LABEL =
  'Could you walk me through how the quarterly insurance claim reconciliation works';

describe('QuickReplies', () => {
  beforeEach(() => {
    resetAnsweredQuickReplies();
  });

  it('groups the buttons under an accessible label, each a type=button', () => {
    render(
      <QuickReplies
        messageId="m1"
        replies={[
          { name: 'Yes', value: 'Yes' },
          { name: 'No', value: 'No' },
        ]}
        onSelect={vi.fn()}
      />
    );

    const group = screen.getByRole('group', { name: 'Quick replies' });
    const buttons = screen.getAllByRole('button');
    expect(group).toContainElement(buttons[0]);
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toHaveAttribute('type', 'button'));
  });

  it('keeps the full label in title when a long label is ellipsised', () => {
    render(
      <QuickReplies
        messageId="m2"
        replies={[{ name: LONG_LABEL, value: LONG_LABEL }]}
        onSelect={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: LONG_LABEL });
    expect(button).toHaveAttribute('title', LONG_LABEL);
    expect(button.textContent).toBe(LONG_LABEL);
  });

  it('gives short labels the same title, so hover always shows the full text', () => {
    render(
      <QuickReplies
        messageId="m3"
        replies={[{ name: 'Why?', value: 'Why?' }]}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Why?' })).toHaveAttribute(
      'title',
      'Why?'
    );
  });

  it('reports the tapped reply with its question id and then removes the row', () => {
    const onSelect = vi.fn();
    render(
      <QuickReplies
        messageId="m4"
        replies={[
          { name: 'Why?', value: 'Why?', questionId: 'why' },
          { name: 'Skip', value: 'Skip' },
        ]}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      { name: 'Why?', value: 'Why?', questionId: 'why' },
      'why'
    );
    expect(screen.queryByRole('group', { name: 'Quick replies' })).toBeNull();
  });
});
