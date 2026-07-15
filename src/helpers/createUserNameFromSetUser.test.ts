import { describe, expect, it } from 'vitest';
import {
  createUserNameFromSetUser,
  resolveSenderDisplayName,
} from './createUserNameFromSetUser';

describe('createUserNameFromSetUser', () => {
  it('builds "First Last" from a usersSet entry', () => {
    expect(
      createUserNameFromSetUser(
        { alice: { xmppUsername: 'alice', firstName: 'Alice', lastName: 'Doe' } as any },
        'alice'
      )
    ).toBe('Alice Doe');
  });

  it('returns the literal "Deleted User" as a miss sentinel', () => {
    expect(createUserNameFromSetUser({}, 'alice')).toBe('Deleted User');
  });
});

// Regression: right after reconnect/re-login, a burst of messages can
// arrive before usersSet (member list / presence) has finished hydrating.
// A cache-only lookup showed the literal "Deleted User" for every one of
// them, even though the sender is very much not deleted - every client
// stamps senderFirstName/senderLastName/fullName on the outgoing stanza
// itself, so that name is available immediately, no cache required.
describe('resolveSenderDisplayName', () => {
  const emptyUsersSet = {};

  it('uses the name already stamped on the message when usersSet is empty (the reported bug)', () => {
    const message = {
      user: { id: 'alice@example.com' },
      senderFirstName: 'Alice',
      senderLastName: 'Doe',
    } as any;

    expect(resolveSenderDisplayName(message, emptyUsersSet)).toBe('Alice Doe');
  });

  it('prefers fullName over separate first/last when both are present', () => {
    const message = {
      user: { id: 'alice@example.com' },
      fullName: 'Alice The Great',
      senderFirstName: 'Alice',
      senderLastName: 'Doe',
    } as any;

    expect(resolveSenderDisplayName(message, emptyUsersSet)).toBe('Alice The Great');
  });

  it('prefers a usersSet entry over the stanza-stamped name once the cache catches up', () => {
    const message = {
      user: { id: 'alice' },
      senderFirstName: 'Alice',
      senderLastName: 'Doe',
    } as any;
    const usersSet = {
      alice: { xmppUsername: 'alice', firstName: 'Alice', lastName: 'Updated' } as any,
    };

    expect(resolveSenderDisplayName(message, usersSet)).toBe('Alice Updated');
  });

  it('treats a previously-resolved "Deleted User" as unresolved, not a real name', () => {
    const message = {
      user: { id: 'alice@example.com', name: 'Deleted User' },
      senderFirstName: 'Alice',
      senderLastName: 'Doe',
    } as any;

    expect(resolveSenderDisplayName(message, emptyUsersSet)).toBe('Alice Doe');
  });

  it('keeps an already-resolved real name as-is without re-deriving it', () => {
    const message = {
      user: { id: 'alice@example.com', name: 'Cached Name' },
      senderFirstName: 'Alice',
      senderLastName: 'Doe',
    } as any;

    expect(resolveSenderDisplayName(message, emptyUsersSet)).toBe('Cached Name');
  });

  it('falls back to the bare username when nothing else is available', () => {
    const message = { user: { id: 'alice@example.com' } } as any;

    expect(resolveSenderDisplayName(message, emptyUsersSet)).toBe('alice');
  });

  it('matches a usersSet entry keyed by the bare local part of a full JID', () => {
    const message = { user: { id: 'alice@example.com' } } as any;
    const usersSet = {
      alice: { xmppUsername: 'alice', firstName: 'Alice', lastName: 'Doe' } as any,
    };

    expect(resolveSenderDisplayName(message, usersSet)).toBe('Alice Doe');
  });
});
