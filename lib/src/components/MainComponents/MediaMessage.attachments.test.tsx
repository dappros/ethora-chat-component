import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaMessage from './MediaMessage';
import { IMessage } from '../../types/types';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

const baseMessage = {
  id: 'm1',
  body: 'media',
  roomJid: 'room@conference.xmpp.example',
  date: new Date().toISOString(),
  user: { id: 'u1' },
  isMediafile: 'true',
} as unknown as IMessage;

const renderMessage = (message: Partial<IMessage>) =>
  renderWithProviders(
    <MediaMessage
      message={{ ...baseMessage, ...message } as IMessage}
      mimeType={message.mimetype}
      location={message.location}
      locationPreview={message.locationPreview}
    />,
    { preloadedState: { chatSettingStore: { config: {} } } as never }
  );

describe('MediaMessage', () => {
  it('renders a legacy single-file image message unchanged', () => {
    renderMessage({
      mimetype: 'image/png',
      location: 'https://files.example/a.png',
      locationPreview: 'https://files.example/a-thumb.png',
      originalName: 'a.png',
    });

    const image = screen.getByAltText('a.png') as HTMLImageElement;
    expect(image.src).toBe('https://files.example/a-thumb.png');
  });

  it('gives a PDF its own card instead of the generic file box', () => {
    renderMessage({
      mimetype: 'application/pdf',
      location: 'https://files.example/report.pdf',
      originalName: 'report.pdf',
      size: '2048',
    });

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.00 KB')).toBeInTheDocument();
  });

  // Storage labels anything it cannot sniff as octet-stream, which used to
  // route documents into the audio player.
  it('recognises a PDF that the server mislabelled as octet-stream', () => {
    renderMessage({
      mimetype: 'application/octet-stream',
      location: 'https://files.example/contract.pdf',
      originalName: 'contract.pdf',
    });

    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('renders every attachment of a multi-file message', () => {
    renderMessage({
      mimetype: 'image/png',
      location: 'https://files.example/one.png',
      originalName: 'one.png',
      attachments: [
        {
          location: 'https://files.example/one.png',
          mimetype: 'image/png',
          originalName: 'one.png',
        },
        {
          location: 'https://files.example/two.png',
          mimetype: 'image/png',
          originalName: 'two.png',
        },
        {
          location: 'https://files.example/three.pdf',
          mimetype: 'application/pdf',
          originalName: 'three.pdf',
        },
      ],
    });

    expect(screen.getByAltText('one.png')).toBeInTheDocument();
    expect(screen.getByAltText('two.png')).toBeInTheDocument();
    expect(screen.getByText('three.pdf')).toBeInTheDocument();
  });

  it('shows a placeholder for attachments that are still uploading', () => {
    renderMessage({
      mimetype: 'media',
      location: '',
      originalName: 'pending-a.png',
      attachments: [
        { location: '', mimetype: 'image/png', originalName: 'pending-a.png' },
        { location: '', mimetype: 'image/png', originalName: 'pending-b.png' },
      ],
    });

    expect(screen.getByLabelText('pending-a.png')).toBeInTheDocument();
    expect(screen.getByLabelText('pending-b.png')).toBeInTheDocument();
  });

  it('falls back to the unsupported notice with nothing to show', () => {
    renderMessage({ mimetype: undefined, location: undefined });
    expect(screen.getByText('Unsupported media type')).toBeInTheDocument();
  });
});
