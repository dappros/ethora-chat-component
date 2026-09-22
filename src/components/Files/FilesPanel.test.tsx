import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IMessage, IRoom } from '../../types/types';

const removeMock = vi.fn();
const loadMoreMock = vi.fn();
const refreshMock = vi.fn();

const useMyFilesMock = vi.fn();
vi.mock('../../hooks/useMyFiles', () => ({
  useMyFiles: (...args: unknown[]) => useMyFilesMock(...args),
}));

const deleteMessageStanzaMock = vi.fn();
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { deleteMessageStanza: deleteMessageStanzaMock } }),
}));

import FilesPanel from './FilesPanel';

const file = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  originalname: `document-${id}.pdf`,
  mimetype: 'application/pdf',
  size: 2048,
  roomName: 'general',
  location: `https://secure-files.example.com/${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const setHookResult = (overrides: Partial<ReturnType<typeof defaultResult>>) => {
  useMyFilesMock.mockReturnValue({ ...defaultResult(), ...overrides });
};

function defaultResult() {
  return {
    items: [],
    total: 0,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: loadMoreMock,
    refresh: refreshMock,
    remove: removeMock,
  };
}

describe('FilesPanel', () => {
  beforeEach(() => {
    removeMock.mockReset().mockResolvedValue(undefined);
    loadMoreMock.mockReset();
    refreshMock.mockReset();
    useMyFilesMock.mockReset();
    deleteMessageStanzaMock.mockReset();
  });

  it('renders the loading skeleton on first load', () => {
    setHookResult({ loading: true, items: [] });

    renderWithProviders(<FilesPanel />);

    expect(screen.queryByText('document-1.pdf')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no files', () => {
    setHookResult({ items: [] });

    renderWithProviders(<FilesPanel />);

    expect(screen.getByText('No files yet')).toBeInTheDocument();
  });

  it('renders an error state with retry', () => {
    setHookResult({ items: [], error: 'network down' });

    renderWithProviders(<FilesPanel />);

    expect(screen.getByText('Could not load files')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('renders document rows for non-media files', () => {
    setHookResult({ items: [file('1'), file('2', { originalname: 'a.docx' })] });

    renderWithProviders(<FilesPanel />);

    expect(screen.getByText('document-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('a.docx')).toBeInTheDocument();
  });

  it('filter chips narrow the visible list by category', () => {
    setHookResult({
      items: [
        file('1', { originalname: 'doc.pdf', mimetype: 'application/pdf' }),
        file('2', { originalname: 'song.mp3', mimetype: 'audio/mpeg' }),
      ],
    });

    renderWithProviders(<FilesPanel />);

    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText('song.mp3')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Audio'));

    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('song.mp3')).toBeInTheDocument();
  });

  it('search input narrows the visible list by name', () => {
    setHookResult({
      items: [file('1', { originalname: 'alpha.pdf' }), file('2', { originalname: 'beta.pdf' })],
    });

    renderWithProviders(<FilesPanel />);

    fireEvent.change(screen.getByPlaceholderText('Search files...'), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('alpha.pdf')).toBeInTheDocument();
    expect(screen.queryByText('beta.pdf')).not.toBeInTheDocument();
  });

  it('delete flow: click delete, confirm, then remove() is called', async () => {
    setHookResult({ items: [file('1')] });

    renderWithProviders(<FilesPanel />);

    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByText('Yes'));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('1'));
  });

  // Bug: deleting a file only removed it on the backend - the chat message
  // that carried it kept pointing at the now-404ing URL and rendered as a
  // broken "No image available" bubble. Deleting must also tombstone the
  // matching message(s) locally and over XMPP.
  it('deleting a file also tombstones the chat message that carries it, locally and over XMPP', async () => {
    const roomJID = 'room-1@conference.example.com';
    const message: IMessage = {
      id: 'msg-1',
      body: 'media',
      date: new Date().toISOString(),
      roomJid: roomJID,
      user: { id: 'me@example.com', name: 'Me' },
      isMediafile: 'true',
      attachmentId: '1',
      location: 'https://secure-files.example.com/1',
    } as IMessage;
    const room: IRoom = {
      jid: roomJID,
      name: roomJID,
      title: 'Room One',
      usersCnt: 0,
      messages: [message],
      isLoading: false,
      roomBg: null,
    } as IRoom;

    setHookResult({ items: [file('1', { roomName: roomJID })] });

    const storeRef: { current: any } = { current: null };
    renderWithProviders(<FilesPanel />, {
      preloadedState: {
        rooms: { rooms: { [roomJID]: room } } as any,
      },
      storeRef,
    });

    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByText('Yes'));

    await waitFor(() =>
      expect(deleteMessageStanzaMock).toHaveBeenCalledWith(roomJID, 'msg-1')
    );
    expect(removeMock).toHaveBeenCalledWith('1');
    const state = storeRef.current.getState();
    expect(state.rooms.rooms[roomJID].messages[0].isDeleted).toBe(true);
  });

  // A retraction goes out to everyone in the room and cannot be taken
  // back, so it must wait for the backend to confirm the file is actually
  // gone - otherwise a failed delete leaves a "deleted" message next to a
  // file that still exists.
  it('does not retract anything when the file delete itself fails', async () => {
    const roomJID = 'room-1@conference.example.com';
    const message: IMessage = {
      id: 'msg-1',
      body: 'media',
      date: new Date().toISOString(),
      roomJid: roomJID,
      user: { id: 'me@example.com', name: 'Me' },
      isMediafile: 'true',
      attachmentId: '1',
      location: 'https://secure-files.example.com/1',
    } as IMessage;
    const room: IRoom = {
      jid: roomJID,
      name: roomJID,
      title: 'Room One',
      usersCnt: 0,
      messages: [message],
      isLoading: false,
      roomBg: null,
    } as IRoom;

    removeMock.mockReset().mockRejectedValue(new Error('nope'));
    setHookResult({ items: [file('1', { roomName: roomJID })] });

    const storeRef: { current: any } = { current: null };
    renderWithProviders(<FilesPanel />, {
      preloadedState: {
        rooms: { rooms: { [roomJID]: room } } as any,
      },
      storeRef,
    });

    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByText('Yes'));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('1'));

    expect(deleteMessageStanzaMock).not.toHaveBeenCalled();
    const state = storeRef.current.getState();
    expect(state.rooms.rooms[roomJID].messages[0].isDeleted).toBeFalsy();
  });

  it('deleting a file with no locally loaded message just removes the file, without touching XMPP', async () => {
    setHookResult({ items: [file('1', { roomName: 'some-other-room' })] });

    renderWithProviders(<FilesPanel />);

    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByText('Yes'));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('1'));
    expect(deleteMessageStanzaMock).not.toHaveBeenCalled();
  });

  it('shows a Load more button when hasMore is true and no filter/search is active', () => {
    setHookResult({ items: [file('1')], hasMore: true });

    renderWithProviders(<FilesPanel />);

    const loadMoreButton = screen.getByText('Load more');
    fireEvent.click(loadMoreButton);
    expect(loadMoreMock).toHaveBeenCalled();
  });
});
