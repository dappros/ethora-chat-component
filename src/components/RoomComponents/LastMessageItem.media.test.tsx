import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import LastMessageItem from './LastMessageItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LastMessage } from '../../types/types';

const att = (extra: Record<string, unknown> = {}) => ({
  location: 'https://files.example.com/a.png',
  locationPreview: 'https://files.example.com/a-small.png',
  mimetype: 'image/png',
  originalName: 'a.png',
  ...extra,
});

const draw = (message: Partial<LastMessage>, sealed = false) =>
  renderWithProviders(
    <LastMessageItem lastMessage={message as LastMessage} sealed={sealed} />,
    {
      preloadedState: {
        chatSettingStore: { user: { fileToken: 'TOK' }, config: {} },
      } as never,
    }
  );

const user = { id: 'u1', name: 'Alice Smith' } as never;

describe('LastMessageItem media preview', () => {
  it('image: small lazy thumbnail with the file token, then "Photo"', () => {
    const { container } = draw({ body: 'media', user, attachments: [att()] as never });
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('a-small.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Alice Smith')).toBeTruthy();
  });

  it('several images say "N photos"', () => {
    draw({ body: 'media', user, attachments: [att(), att(), att()] as never });
    expect(screen.getByText('3 photos')).toBeTruthy();
  });

  it('a failed thumbnail drops to the inline icon, no broken image left', () => {
    const { container } = draw({ body: 'media', user, attachments: [att()] as never });
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Photo')).toBeTruthy();
  });

  it('video with a poster gets a play overlay; without one a neutral tile', () => {
    const video = (preview?: string) =>
      att({ mimetype: 'video/mp4', originalName: 'v.mp4', location: 'https://f/v.mp4', locationPreview: preview });
    const first = draw({ body: 'media', user, attachments: [video('https://f/v.jpg')] as never });
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByTestId('last-message-play')).toBeTruthy();
    first.unmount();

    const { container } = draw({ body: 'media', user, attachments: [video()] as never });
    expect(screen.getByText('Video')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByTestId('last-message-play')).toBeNull();
  });

  it('voice message and audio labels', () => {
    const voice = draw({
      body: 'media',
      user,
      attachments: [att({ mimetype: 'application/octet-stream', originalName: 'rec', duration: '65' })] as never,
    });
    expect(screen.getByText('Voice message 1:05')).toBeTruthy();
    voice.unmount();
    draw({ body: 'media', user, attachments: [att({ mimetype: 'audio/mpeg', originalName: 'a.mp3' })] as never });
    expect(screen.getByText('Audio')).toBeTruthy();
  });

  it('file shows its name', () => {
    draw({
      body: 'media',
      user,
      attachments: [att({ mimetype: 'application/pdf', originalName: 'report.pdf' })] as never,
    });
    expect(screen.getByText('report.pdf')).toBeTruthy();
  });

  it('caption follows the label', () => {
    draw({ body: 'Sunset', user, attachments: [att()] as never });
    expect(screen.getByText('Photo, Sunset')).toBeTruthy();
  });

  it('e2ee room: label and icon only, never an image element', () => {
    const { container } = draw({ body: 'secret', user, attachments: [att()] as never }, true);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
  });

  it('omits the sender line when there is no name', () => {
    draw({ body: 'media', user: { id: 'x', name: '' } as never, attachments: [att()] as never });
    expect(screen.getByText('Photo')).toBeTruthy();
  });
});
