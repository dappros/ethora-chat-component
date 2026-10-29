import { describe, expect, it, vi } from 'vitest';
import { xml } from '@xmpp/client';
import { getRoomAccess } from './getRoomAccess.xmpp';

const NS = 'http://jabber.org/protocol/disco#info';
const ROOM = 'app_room@conference.example.com';

const discoResult = (...features: string[]) =>
  xml('iq', { type: 'result' }, xml('query', { xmlns: NS }, ...features.map((v) => xml('feature', { var: v }))));

const clientResolving = (res: unknown) => ({ iqCaller: { request: vi.fn().mockResolvedValue(res) } }) as any;
const clientRejecting = (err: unknown) => ({ iqCaller: { request: vi.fn().mockRejectedValue(err) } }) as any;

describe('getRoomAccess', () => {
  it('sends a disco#info query to the room', async () => {
    const client = clientResolving(discoResult('muc_open'));
    await getRoomAccess(ROOM, client, 1234);
    const [iq, timeout] = client.iqCaller.request.mock.calls[0];
    expect(iq.attrs).toMatchObject({ type: 'get', to: ROOM });
    expect(iq.getChild('query', NS)).toBeTruthy();
    expect(timeout).toBe(1234);
  });

  it('tells an open room from a members-only one', async () => {
    expect(await getRoomAccess(ROOM, clientResolving(discoResult('muc_public', 'muc_open')))).toBe('open');
    expect(await getRoomAccess(ROOM, clientResolving(discoResult('muc_hidden', 'muc_membersonly')))).toBe('membersOnly');
    expect(await getRoomAccess(ROOM, clientResolving(discoResult('muc_public')))).toBe('unknown');
  });

  it('maps stanza errors', async () => {
    expect(await getRoomAccess(ROOM, clientRejecting({ condition: 'item-not-found' }))).toBe('notFound');
    expect(await getRoomAccess(ROOM, clientRejecting({ condition: 'forbidden' }))).toBe('membersOnly');
    expect(await getRoomAccess(ROOM, clientRejecting({ condition: 'registration-required' }))).toBe('membersOnly');
    expect(await getRoomAccess(ROOM, clientRejecting(new Error('timeout')))).toBe('unknown');
  });
});
