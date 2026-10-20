import { describe, expect, it } from 'vitest';
import {
  decideIncomingWhileBusy,
  isCallRoomTypeAllowed,
  normalizeIceServers,
  parseCallCreateResponse,
  parseCallTokenAttrs,
} from './callMode';

describe('normalizeIceServers', () => {
  it('reads an array, a JSON string and an { iceServers } envelope', () => {
    const list = [
      { urls: 'stun:stun.example.com:3478' },
      {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
        username: '1700000000:u',
        credential: 'secret',
      },
    ];
    expect(normalizeIceServers(list)).toEqual(list);
    expect(normalizeIceServers(JSON.stringify(list))).toEqual(list);
    expect(normalizeIceServers({ iceServers: list })).toEqual(list);
  });

  it('drops entries that are not stun/turn and never throws', () => {
    expect(
      normalizeIceServers([
        { urls: 'http://evil.example.com' },
        { urls: ['javascript:alert(1)'] },
        null,
        'x',
        { urls: 'turn:ok.example.com', username: 5, credential: '' },
      ])
    ).toEqual([{ urls: 'turn:ok.example.com' }]);
    expect(normalizeIceServers('not json')).toEqual([]);
    expect(normalizeIceServers('')).toEqual([]);
    expect(normalizeIceServers(undefined)).toEqual([]);
    expect(normalizeIceServers(42)).toEqual([]);
  });
});

describe('parseCallTokenAttrs', () => {
  it('an old-server stanza (no mode, no group) is a plain LiveKit 1:1 call', () => {
    const parsed = parseCallTokenAttrs({
      token: ' jwt.a.b ',
      room: 'app_room',
      callId: 'c1',
    });
    expect(parsed).toEqual({
      token: 'jwt.a.b',
      room: 'app_room',
      callId: 'c1',
      kind: null,
      mode: 'livekit',
      group: false,
      iceServers: null,
    });
  });

  it('reads a p2p stanza: empty token, ice list as a JSON string', () => {
    const ice = [{ urls: 'turn:t.example.com', username: 'u', credential: 'p' }];
    const parsed = parseCallTokenAttrs({
      token: '',
      room: 'a-b',
      callId: 'c2',
      mode: 'p2p',
      kind: 'audio',
      group: 'false',
      ice: JSON.stringify(ice),
    });
    expect(parsed.mode).toBe('p2p');
    expect(parsed.kind).toBe('audio');
    expect(parsed.group).toBe(false);
    expect(parsed.iceServers).toEqual(ice);
  });

  it('reads group="true" for a livekit stanza, and never marks p2p as group', () => {
    expect(
      parseCallTokenAttrs({ token: 't', room: 'r', mode: 'livekit', group: 'true' })
        .group
    ).toBe(true);
    expect(parseCallTokenAttrs({ token: 't', room: 'r', group: '1' }).group).toBe(
      true
    );
    expect(
      parseCallTokenAttrs({ room: 'r', mode: 'p2p', group: 'true' }).group
    ).toBe(false);
  });

  it('tolerates garbage: unknown mode, bad kind, broken ice', () => {
    const parsed = parseCallTokenAttrs({
      token: 't',
      room: 'r',
      mode: 'quantum',
      kind: 'hologram',
      ice: '{{{',
    });
    expect(parsed.mode).toBe('livekit');
    expect(parsed.kind).toBeNull();
    expect(parsed.iceServers).toBeNull();
    expect(parseCallTokenAttrs(undefined).mode).toBe('livekit');
    expect(
      parseCallTokenAttrs({ room: 'r', mode: 'p2p', ice: '[]' }).iceServers
    ).toBeNull();
  });
});

describe('parseCallCreateResponse', () => {
  it('parses a p2p answer with ICE servers', () => {
    const result = parseCallCreateResponse(
      {
        ok: true,
        callId: 'abc',
        mode: 'p2p',
        kind: 'audio',
        iceServers: [{ urls: 'stun:s.example.com' }],
        ttlSeconds: 86400,
      },
      'video'
    );
    expect(result).toMatchObject({
      callId: 'abc',
      mode: 'p2p',
      kind: 'audio',
      group: null,
      livekitUrl: null,
      ttlSeconds: 86400,
    });
    expect(result.iceServers).toEqual([{ urls: 'stun:s.example.com' }]);
  });

  it('parses a livekit answer with group and livekitUrl', () => {
    const result = parseCallCreateResponse(
      {
        ok: true,
        callId: 'g1',
        mode: 'livekit',
        kind: 'video',
        group: true,
        livekitUrl: ' wss://lk.example.com ',
      },
      'video'
    );
    expect(result.mode).toBe('livekit');
    expect(result.group).toBe(true);
    expect(result.livekitUrl).toBe('wss://lk.example.com');
    expect(result.iceServers).toEqual([]);
  });

  it('an old server answer (no mode) falls back to livekit and the requested kind', () => {
    expect(parseCallCreateResponse({ ok: true }, 'audio')).toMatchObject({
      callId: null,
      mode: 'livekit',
      kind: 'audio',
      group: null,
    });
    expect(parseCallCreateResponse(undefined, 'video').mode).toBe('livekit');
  });

  it('refuses a p2p answer that has no callId', () => {
    expect(() => parseCallCreateResponse({ mode: 'p2p' }, 'video')).toThrow();
  });
});

describe('isCallRoomTypeAllowed (1:1 vs group branching)', () => {
  it('defaults to private and group, never public', () => {
    expect(isCallRoomTypeAllowed('private')).toBe(true);
    expect(isCallRoomTypeAllowed('group')).toBe(true);
    expect(isCallRoomTypeAllowed('public')).toBe(false);
    expect(isCallRoomTypeAllowed(undefined)).toBe(false);
  });

  it('respects an explicit list', () => {
    expect(isCallRoomTypeAllowed('group', ['private'])).toBe(false);
    expect(isCallRoomTypeAllowed('private', ['private'])).toBe(true);
    expect(isCallRoomTypeAllowed('private', ['group'])).toBe(false);
  });
});

describe('decideIncomingWhileBusy', () => {
  const idle = {
    phase: 'idle',
    direction: null,
    mode: 'livekit' as const,
    callId: null,
    roomBareName: null,
  };
  const incoming = { mode: 'p2p' as const, callId: 'b', roomBareName: 'a-b' };

  it('rings when nothing is active', () => {
    expect(decideIncomingWhileBusy(idle, incoming)).toBe('accept');
  });

  it('ignores a re-delivery of the active call', () => {
    expect(
      decideIncomingWhileBusy(
        { ...idle, phase: 'in-call', direction: 'incoming', mode: 'p2p', callId: 'b' },
        incoming
      )
    ).toBe('duplicate');
  });

  it('keeps the legacy overwrite for livekit over livekit', () => {
    expect(
      decideIncomingWhileBusy(
        { ...idle, phase: 'in-call', direction: 'incoming', callId: 'x', roomBareName: 'r' },
        { mode: 'livekit', callId: 'y', roomBareName: 'r2' }
      )
    ).toBe('replace');
  });

  it('declines a different call while a p2p call is active', () => {
    expect(
      decideIncomingWhileBusy(
        { ...idle, phase: 'in-call', direction: 'incoming', mode: 'p2p', callId: 'x', roomBareName: 'other' },
        incoming
      )
    ).toBe('busy');
    expect(
      decideIncomingWhileBusy(
        { ...idle, phase: 'in-call', direction: 'incoming', mode: 'p2p', callId: 'x', roomBareName: 'other' },
        { mode: 'livekit', callId: 'y', roomBareName: 'g' }
      )
    ).toBe('busy');
  });

  it('resolves two simultaneous dials the same way on both ends', () => {
    const mine = (callId: string) => ({
      ...idle,
      phase: 'requesting',
      direction: 'outgoing' as const,
      mode: 'p2p' as const,
      callId,
      roomBareName: 'a-b',
    });
    // The smaller callId wins: A holds 'a1', B holds 'b2'.
    expect(
      decideIncomingWhileBusy(mine('a1'), { mode: 'p2p', callId: 'b2', roomBareName: 'a-b' })
    ).toBe('glare-keep');
    expect(
      decideIncomingWhileBusy(mine('b2'), { mode: 'p2p', callId: 'a1', roomBareName: 'a-b' })
    ).toBe('glare-yield');
  });
});
