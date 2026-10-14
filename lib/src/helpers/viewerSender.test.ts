import { describe, expect, it } from 'vitest';
import { resolveViewerSender } from './viewerSender';

const me = {
  xmppUsername: 'me_user',
  firstName: 'Mia',
  lastName: 'Self',
  profileImage: 'https://f/me.jpg',
};

describe('resolveViewerSender', () => {
  it('uses first and last name from the message', () => {
    expect(
      resolveViewerSender({ sender: { firstName: 'Ada', lastName: 'Lovelace' } }).name
    ).toBe('Ada Lovelace');
  });

  it('uses the message user name when first/last are missing', () => {
    expect(resolveViewerSender({ sender: { id: 'x', name: 'Grace Hopper' } }).name).toBe(
      'Grace Hopper'
    );
  });

  it('looks the sender up in usersSet by xmpp username', () => {
    const r = resolveViewerSender({
      sender: { id: 'bob_x@xmpp.example.com' },
      usersSet: { bob_x: { firstName: 'Bob', lastName: 'Ray', profileImage: 'https://f/b.jpg' } },
    });
    expect(r).toEqual({ name: 'Bob Ray', photo: 'https://f/b.jpg' });
  });

  it('own message with no name on it resolves to the signed-in profile', () => {
    const r = resolveViewerSender({ sender: { id: 'me_user' }, me });
    expect(r).toEqual({ name: 'Mia Self', photo: 'https://f/me.jpg' });
  });

  it("someone else's message never takes the signed-in profile", () => {
    const r = resolveViewerSender({ sender: { id: 'other', username: 'other' }, me });
    expect(r.name).toBe('other');
    expect(r.photo).toBeUndefined();
  });

  it('falls back to the username before the @', () => {
    expect(resolveViewerSender({ sender: { username: 'carol@xmpp.example.com' } }).name).toBe(
      'carol'
    );
  });

  it('never exposes an opaque id as a name', () => {
    const opaque = '6a2c08adef26ca2d3e1e3677_6a2c08aeef26ca2d3e1e368e';
    expect(resolveViewerSender({ sender: { id: opaque, username: opaque } }).name).toBe('');
  });

  it('names a 1:1 peer after the room when nothing else is known', () => {
    const opaque = '6a2c08adef26ca2d3e1e3677';
    expect(
      resolveViewerSender({ sender: { id: opaque }, peerRoomName: 'Dana Peer' }).name
    ).toBe('Dana Peer');
  });

  it('returns an empty name for no sender', () => {
    expect(resolveViewerSender({}).name).toBe('');
  });
});
