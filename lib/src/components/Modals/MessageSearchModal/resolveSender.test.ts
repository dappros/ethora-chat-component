import { describe, expect, it } from 'vitest';
import { localPart, resolveSender } from './resolveSender';

const hit = (over = {}) => ({
  from: 'app1_user1@xmpp.chat-qa.ethora.com',
  fromUserId: 'user1',
  ...over,
});

describe('resolveSender', () => {
  it('finds the name by the local part of the JID, which carries an xmpp host', () => {
    // Regression: usersSet is keyed "app1_user1" but `from` arrives with
    // "@xmpp.host", so the lookup missed and every hit read "Someone".
    const usersSet = { app1_user1: { firstName: 'Ada', lastName: 'Lovelace' } };
    expect(resolveSender(hit(), { usersSet })).toEqual({
      name: 'Ada Lovelace',
      isSelf: false,
    });
  });

  it('falls back to the room member with the same user id', () => {
    const members = [
      { _id: 'other', firstName: 'No' },
      { _id: 'user1', firstName: 'Grace', lastName: 'Hopper' },
    ];
    expect(resolveSender(hit(), { usersSet: {}, members }).name).toBe(
      'Grace Hopper'
    );
  });

  it('recognises the current user whether or not their JID carries the host', () => {
    expect(resolveSender(hit(), { myXmppUsername: 'app1_user1' }).isSelf).toBe(
      true
    );
    expect(
      resolveSender(hit(), {
        myXmppUsername: 'app1_user1@xmpp.chat-qa.ethora.com',
      }).isSelf
    ).toBe(true);
    expect(
      resolveSender(hit(), { myXmppUsername: 'app1_someone' }).isSelf
    ).toBe(false);
  });

  it('returns an empty name, never an opaque id, when nobody matches', () => {
    expect(resolveSender(hit(), { usersSet: {}, members: [] })).toEqual({
      name: '',
      isSelf: false,
    });
  });

  it('localPart strips the host and tolerates nothing', () => {
    expect(localPart('a_b@host')).toBe('a_b');
    expect(localPart('a_b')).toBe('a_b');
    expect(localPart(undefined)).toBe('');
  });
});
