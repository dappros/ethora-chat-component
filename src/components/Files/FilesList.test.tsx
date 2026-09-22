import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import FilesList from './FilesList';
import { ApiFile, IRoom } from '../../types/types';

// Regression tests for the Files tab list layout (screenshot: a raw room id
// like "646cc8dc...._6a3421940fb625942" overflowed the row, collided with
// the download/delete buttons, and forced a horizontal scrollbar on the
// whole panel).

const file = (overrides: Partial<ApiFile> = {}): ApiFile =>
  ({
    _id: '1',
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: 2048,
    location: 'https://secure-files.example.com/1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as ApiFile;

const makeRoom = (jid: string, title: string): IRoom =>
  ({
    jid,
    name: jid,
    title,
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
  }) as IRoom;

const noop = vi.fn();

describe('FilesList - room tag resolution and row layout', () => {
  it('shows the resolved room title instead of the raw room id', () => {
    const roomJID = '646cc8dc96d4a4dc8f7b2f2d_6a3421940fb625942@conference.example.com';

    renderWithProviders(
      <FilesList
        items={[file({ roomName: roomJID })]}
        onPreview={noop}
        onDownload={noop}
        onDelete={noop}
      />,
      {
        preloadedState: {
          rooms: { rooms: { [roomJID]: makeRoom(roomJID, 'Support chat') } } as any,
        },
      }
    );

    expect(screen.getByText('Support chat')).toBeInTheDocument();
    expect(screen.queryByText(roomJID)).not.toBeInTheDocument();
  });

  it('hides the room tag entirely when the room cannot be resolved locally, instead of printing the raw id', () => {
    const roomJID = '646cc8dc96d4a4dc8f7b2f2d_6a3421940fb625942@conference.example.com';

    const { container } = renderWithProviders(
      <FilesList
        items={[file({ roomName: roomJID })]}
        onPreview={noop}
        onDownload={noop}
        onDelete={noop}
      />
      // No rooms preloaded - the room isn't loaded locally.
    );

    expect(screen.queryByText(roomJID)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(roomJID);
  });

  it('renders the file name and does not show a room tag when the file has no roomName', () => {
    renderWithProviders(
      <FilesList
        items={[file({ originalname: 'no-room.pdf', roomName: undefined })]}
        onPreview={noop}
        onDownload={noop}
        onDelete={noop}
      />
    );

    expect(screen.getByText('no-room.pdf')).toBeInTheDocument();
  });
});
