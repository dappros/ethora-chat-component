import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import { addRoom, setLogoutState, updateRoom } from '../roomStore/roomsSlice';

const ROOM = 'big_room@conference.example.com';
const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `id${i}`,
    firstName: 'F',
    lastName: String(i),
    xmppUsername: `u${i}`,
    jid: `u${i}@example.com`,
  }));

const membership = (user: string, affiliation: string) =>
  parse(
    `<message xmlns='jabber:client' from='${ROOM}'>` +
      `<x xmlns='http://jabber.org/protocol/muc#user'>` +
      `<item jid='${user}@example.com' affiliation='${affiliation}'/></x></message>`
  );

const presence = (nick: string, type: string | null, affiliation: string) =>
  parse(
    `<presence xmlns='jabber:client' from='${ROOM}/${nick}'${type ? ` type='${type}'` : ''}>` +
      `<x xmlns='http://jabber.org/protocol/muc#user'>` +
      `<item jid='${nick}@example.com' affiliation='${affiliation}' role='participant'/></x></presence>`
  );

const cnt = () => store.getState().rooms.rooms[ROOM].usersCnt;
const len = () => store.getState().rooms.rooms[ROOM].members.length;

describe('live membership handlers keep usersCnt on truncated rooms', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    store.dispatch(
      addRoom({
        roomData: {
          jid: ROOM,
          name: 'Big',
          title: 'Big',
          type: 'public',
          members: mk(30),
          usersCnt: 435,
          messages: [],
        } as any,
      } as any)
    );
    store.dispatch(updateRoom({ jid: ROOM, updates: { usersCnt: 435 } }));
  });

  it('seed is truncated', () => {
    expect(cnt()).toBe(435);
    expect(len()).toBe(30);
  });

  it('message join of a new user is +1', () => {
    handleStanza(membership('newbie', 'member'), {} as any);
    expect(cnt()).toBe(436);
    expect(len()).toBe(31);
  });

  it('message leave of a listed member is -1', () => {
    handleStanza(membership('u3', 'none'), {} as any);
    expect(cnt()).toBe(434);
    expect(len()).toBe(29);
  });

  it('message leave of an unlisted member is -1 without touching members', () => {
    handleStanza(membership('stranger', 'none'), {} as any);
    expect(cnt()).toBe(434);
    expect(len()).toBe(30);
  });

  it('presence of an unlisted member does not inflate the count', () => {
    handleStanza(presence('stranger', null, 'member'), {} as any);
    expect(cnt()).toBe(435);
  });

  it('presence kick of a listed member is -1', () => {
    handleStanza(presence('u5', 'unavailable', 'none'), {} as any);
    expect(cnt()).toBe(434);
  });

  it('members-only refresh keeps the true total', () => {
    store.dispatch(updateRoom({ jid: ROOM, updates: { members: mk(30) } }));
    expect(cnt()).toBe(435);
  });

  const roomInfo = (occupants: number) =>
    parse(
      `<iq xmlns='jabber:client' type='result' id='roomInfo' from='${ROOM}'>` +
        `<query xmlns='http://jabber.org/protocol/disco#info'>` +
        `<x xmlns='jabber:x:data' type='result'><field var='muc#roominfo_occupants'>` +
        `<value>${occupants}</value></field></x></query></iq>`
    );

  it('roominfo occupants figure never lowers the API total of a truncated room', () => {
    handleStanza(roomInfo(30), {} as any);
    expect(cnt()).toBe(435);
    handleStanza(roomInfo(440), {} as any);
    expect(cnt()).toBe(440);
  });
});
