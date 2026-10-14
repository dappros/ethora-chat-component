import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import FilePreviewModal from './FilePreviewModal';

vi.mock('../../../helpers/downloadFile', () => ({
  downloadFile: vi.fn(() => Promise.resolve('blob')),
}));

const ROOM = 'room@conference.xmpp.example.com';
const URL_A = 'https://files.example.com/photo-09.png';

const message = (user: Record<string, unknown>) => ({
  id: '1',
  body: 'media',
  roomJid: ROOM,
  date: '2026-10-13T18:32:00.000Z',
  user,
  location: URL_A,
  mimetype: 'image/png',
  originalName: 'photo-09.png',
});

const draw = (
  user: Record<string, unknown> | null,
  extra: { usersSet?: Record<string, unknown>; me?: Record<string, unknown>; activeFile?: Record<string, unknown> } = {}
) =>
  renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
    preloadedState: {
      chatSettingStore: {
        activeFile: extra.activeFile ?? {
          fileName: 'photo-09.png',
          fileURL: URL_A,
          mimetype: 'image/png',
        },
        user: { fileToken: '', ...extra.me },
        config: {},
      },
      rooms: {
        activeRoomJID: ROOM,
        usersSet: extra.usersSet ?? {},
        rooms: {
          [ROOM]: {
            jid: ROOM,
            type: 'group',
            messages: user ? [message(user)] : [],
          },
        },
      },
    } as never,
  });

describe('viewer header sender', () => {
  it('shows the name on the first line and "date · file" under it', () => {
    const { container } = draw({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' });
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).toContain('Ada Lovelace');
    expect(header.textContent).toContain('photo-09.png');
    expect(header.textContent).toContain('AL');
    expect(header.textContent).not.toContain('?');
    expect(header.textContent?.indexOf('Ada Lovelace')).toBeLessThan(
      header.textContent?.indexOf('photo-09.png') ?? -1
    );
  });

  it('resolves a sender with no name on the message through usersSet', () => {
    const { container } = draw(
      { id: 'bob_x' },
      { usersSet: { bob_x: { firstName: 'Bob', lastName: 'Ray' } } }
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).toContain('Bob Ray');
    expect(header.textContent).not.toContain('?');
  });

  it('resolves an own message without a name to the signed-in profile', () => {
    const { container } = draw(
      { id: 'me_user' },
      { me: { xmppUsername: 'me_user', firstName: 'Mia', lastName: 'Self' } }
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).toContain('Mia Self');
    expect(header.textContent).toContain('MS');
  });

  it('an unknown sender gets a glyph avatar and no name, never "?"', () => {
    const { container } = draw({ id: '6a2c08adef26ca2d3e1e3677' });
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).not.toContain('?');
    expect(screen.getByTestId('avatar-unknown-glyph')).toBeTruthy();
    expect(header.textContent).toContain('photo-09.png');
  });

  it('uses the sender handed over with the file when it is outside the gallery', () => {
    const { container } = draw(null, {
      activeFile: {
        fileName: 'photo-09.png',
        fileURL: URL_A,
        mimetype: 'image/png',
        date: '2026-10-13T18:32:00.000Z',
        sender: { id: 'x', firstName: 'Cy', lastName: 'Dee' },
      },
    });
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).toContain('Cy Dee');
    expect(header.textContent).toContain('CD');
  });

  it('the album open path carries the sender through siblings', async () => {
    const { galleryFromFiles } = await import('../../../helpers/roomImageGallery');
    const sender = { id: 'x', firstName: 'Cy', lastName: 'Dee' };
    const [entry] = galleryFromFiles([
      { fileName: 'a.png', fileURL: URL_A, mimetype: 'image/png', sender, date: 'd' },
    ]);
    expect(entry.sender).toEqual(sender);
  });
});
