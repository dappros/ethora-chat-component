import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MediaCaption from './MediaCaption';

describe('MediaCaption', () => {
  it('renders the caption text', () => {
    render(<MediaCaption message={{ caption: 'look at this' }} />);
    expect(screen.getByTestId('media-caption')).toHaveTextContent('look at this');
  });

  it('renders nothing when the message has no caption', () => {
    const { container } = render(<MediaCaption message={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a blank caption', () => {
    const { container } = render(<MediaCaption message={{ caption: '   ' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders markdown links, like a text message', async () => {
    const { container } = render(
      <MediaCaption message={{ caption: 'see [the docs](https://example.com/docs)' }} />
    );
    await waitFor(() => expect(container.querySelector('a')).not.toBeNull());
    const link = container.querySelector('a');
    expect(link).toHaveTextContent('the docs');
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
  });

  it('makes caption mentions clickable through the caption span offsets', async () => {
    const onMentionClick = vi.fn();
    render(
      <MediaCaption
        message={{
          caption: 'hi @Alice look',
          captionMentions: [{ jid: 'alice@xmpp.example', name: 'Alice', offset: 3, length: 6 }],
        }}
        onMentionClick={onMentionClick}
      />
    );

    const mention = await screen.findByRole('button');
    expect(mention.textContent).toBe('@Alice');
    fireEvent.click(mention);
    expect(onMentionClick).toHaveBeenCalledWith(
      expect.objectContaining({ jid: 'alice@xmpp.example', name: 'Alice' })
    );
  });
});
