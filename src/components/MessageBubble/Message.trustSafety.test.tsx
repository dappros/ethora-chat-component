import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import FilePreviewModal from '../Modals/FilePreviewModal/FilePreviewModal';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'you are terrible',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'alice', name: 'Alice Smith' },
    ...overrides,
  }) as IMessage;

const room = (messages: IMessage[] = []): IRoom =>
  ({ jid: ROOM_JID, name: 'room1', title: 'Room 1', usersCnt: 0, messages }) as unknown as IRoom;

const renderMessage = (
  message: IMessage,
  { usersSet = {}, locale }: { usersSet?: Record<string, unknown>; locale?: string } = {}
) =>
  renderWithProviders(<Message message={message} isUser={false} isReply={false} />, {
    preloadedState: {
      chatSettingStore: {
        user: { xmppUsername: 'me' },
        config: locale ? { i18n: { locale } } : {},
      } as never,
      rooms: { rooms: { [ROOM_JID]: room() }, usersSet } as never,
    },
  });

describe('moderated messages', () => {
  it('blur collapses the text until tapped', () => {
    renderMessage(makeMessage({ moderation: { action: 'blur', category: 'toxicity' } }));
    expect(screen.getByTestId('moderated-blurred')).toHaveTextContent(
      'Hidden: may be offensive. Tap to view'
    );
    expect(screen.queryByText('you are terrible')).toBeNull();

    fireEvent.click(screen.getByTestId('moderated-blurred'));
    expect(screen.getByText('you are terrible')).toBeInTheDocument();
  });

  it.each(['pii', 'phi'])('blur for %s uses the personal information wording', (category) => {
    renderMessage(makeMessage({ moderation: { action: 'blur', category } }));
    expect(screen.getByTestId('moderated-blurred')).toHaveTextContent(
      'Hidden: may contain personal or health information. Tap to view'
    );
  });

  it('hidden shows only the notice', () => {
    renderMessage(makeMessage({ body: '', moderation: { action: 'hidden', category: 'severe' } }));
    expect(screen.getByTestId('moderated-hidden')).toHaveTextContent('Message hidden by moderators');
    expect(screen.queryByTestId('moderated-blurred')).toBeNull();
  });

  it('deleted uses the existing deleted rendering', () => {
    renderMessage(
      makeMessage({ body: '', isDeleted: true, moderation: { action: 'deleted' } })
    );
    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('moderated-hidden')).toBeNull();
  });

  it('is localised', () => {
    renderMessage(makeMessage({ moderation: { action: 'hidden' }, body: '' }), { locale: 'es' });
    expect(screen.getByTestId('moderated-hidden')).toHaveTextContent(
      'Mensaje ocultado por los moderadores'
    );
  });
});

describe('masked sender', () => {
  it('renders "Suspended account" with a neutral avatar and no profile action', () => {
    const { store } = renderMessage(
      makeMessage({ senderMasked: true, user: { id: 'alice', name: 'Suspended account' } as never }),
      // Even when the member list still knows the real name.
      { usersSet: { alice: { xmppUsername: 'alice', firstName: 'Alice', lastName: 'Smith' } } }
    );
    expect(screen.getByText('Suspended account')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).toBeNull();
    const avatar = screen.getByTestId('masked-sender-avatar');
    fireEvent.click(avatar);
    expect(store.getState().chatSettingStore.selectedUser).toBeUndefined();
    expect(store.getState().chatSettingStore.activeModal).toBeUndefined();
  });

  it('is localised', () => {
    renderMessage(makeMessage({ senderMasked: true }), { locale: 'fr' });
    expect(screen.getByText('Compte suspendu')).toBeInTheDocument();
  });
});

describe('sensitive media in the viewer', () => {
  const SECURE = 'https://secure-files.example.com/bucket';
  const sensitive = makeMessage({
    id: 's1',
    body: 'media',
    isMediafile: 'true',
    mimetype: 'image/png',
    location: `${SECURE}/a.png`,
    locationPreview: `${SECURE}/a-thumb.png`,
    originalName: 'a.png',
    isSensitive: 'true',
  });

  const renderViewer = (revealed: Record<string, true> = {}) =>
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: {
        chatSettingStore: {
          activeFile: { fileName: 'a.png', fileURL: `${SECURE}/a.png`, mimetype: 'image/png' },
          user: { fileToken: 'TOKEN', xmppUsername: 'me' },
          config: {},
        } as never,
        rooms: { activeRoomJID: ROOM_JID, rooms: { [ROOM_JID]: room([sensitive]) } } as never,
        trustSafety: {
          policy: {},
          age: { status: 'idle', birthYear: null, isAdult: null, declaredAt: null, canDeclareAdult: true },
          revealed,
          blocked: {},
        } as never,
      },
    });

  it('stays covered until revealed, and cannot be saved meanwhile', () => {
    renderViewer();
    expect(screen.getByTestId('sensitive-cover')).toBeInTheDocument();
    expect(screen.queryByTestId('image-lightbox-image')).toBeNull();
    expect(screen.getByLabelText('Save')).toBeDisabled();
  });

  it('shows the original once the message was revealed', () => {
    renderViewer({ s1: true });
    expect(screen.queryByTestId('sensitive-cover')).toBeNull();
    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      `${SECURE}/a.png?ft=TOKEN`
    );
  });
});
