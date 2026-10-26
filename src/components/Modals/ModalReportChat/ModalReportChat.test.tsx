import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const postReportRoom = vi.fn();
vi.mock('../../../networking/api-requests/rooms.api.ts', () => ({
  postReportRoom: (...args: unknown[]) => postReportRoom(...args),
}));

import { ModalReportChat } from './ModalReportChat';

const ROOM = 'app1_9b2f6c1e@conference.xmpp.chat.ethora.com';

const render = () => {
  const storeRef: { current: any } = { current: null };
  renderWithProviders(<ModalReportChat />, {
    storeRef,
    preloadedState: {
      chatSettingStore: { config: {}, user: { token: 't' } } as any,
      rooms: {
        rooms: {},
        usersSet: {},
        activeRoomJID: ROOM,
        reportRoom: { isOpen: true },
      } as any,
    },
  });
  return storeRef;
};

describe('ModalReportChat', () => {
  beforeEach(() => {
    postReportRoom.mockReset().mockResolvedValue({});
  });

  it('sends the chosen category in the server format, with the bare room name', async () => {
    render();
    fireEvent.click(screen.getByText('Violence'));
    await act(async () => {
      fireEvent.click(screen.getByText('Report'));
    });
    expect(postReportRoom).toHaveBeenCalledWith({
      chatName: 'app1_9b2f6c1e',
      category: 'violance',
      text: 'Violence',
    });
    expect(await screen.findByText('Report sent. Thank you.')).toBeTruthy();
  });

  it('sends the typed details for Other (not a stale empty text)', async () => {
    render();
    fireEvent.click(screen.getByText('Other'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'impersonates our support' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Report'));
    });
    expect(postReportRoom).toHaveBeenCalledWith({
      chatName: 'app1_9b2f6c1e',
      category: 'other',
      text: 'impersonates our support',
    });
  });

  it('closes on success and stays open with an error toast on failure', async () => {
    const storeRef = render();
    postReportRoom.mockRejectedValueOnce(new Error('Error reporting chat'));
    fireEvent.click(screen.getByText('Spam'));
    await act(async () => {
      fireEvent.click(screen.getByText('Report'));
    });
    expect(
      await screen.findByText('Could not send the report. Please try again.')
    ).toBeTruthy();
    expect(storeRef.current.getState().rooms.reportRoom.isOpen).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByText('Report'));
    });
    expect(postReportRoom).toHaveBeenCalledTimes(2);
    expect(storeRef.current.getState().rooms.reportRoom.isOpen).toBe(false);
  });
});
