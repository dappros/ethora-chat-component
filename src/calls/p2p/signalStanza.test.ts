import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import {
  MAX_P2P_SIGNAL_AGE_MS,
  buildP2PSignalStanza,
  isP2PSignalFresh,
  parseP2PSignalStanza,
} from './signalStanza';

// Serialise and re-parse, the way the stanza travels over the wire.
const roundTrip = (stanza: any, from = 'alice@xmpp.example.com/res') => {
  const wire = stanza.toString().replace('<message', `<message from='${from}'`);
  return parse(wire);
};

describe('buildP2PSignalStanza', () => {
  it('builds the documented direct chat message', () => {
    const stanza: any = buildP2PSignalStanza({
      to: 'bob@xmpp.example.com',
      callId: 'call-1',
      signal: 'offer',
      payload: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\n' },
    });
    expect(stanza.name).toBe('message');
    expect(stanza.attrs.type).toBe('chat');
    expect(stanza.attrs.to).toBe('bob@xmpp.example.com');
    expect(stanza.getChildText('body')).toBe('system');
    const data = stanza.getChild('data');
    expect(data.attrs).toMatchObject({
      type: 'call-p2p',
      callId: 'call-1',
      signal: 'offer',
    });
    expect(typeof data.attrs.payload).toBe('string');
    // Kept out of the archive and the offline store.
    expect(stanza.getChild('no-store', 'urn:xmpp:hints')).toBeTruthy();
  });

  it('survives the wire: a multi-line SDP comes back byte for byte', () => {
    const sdp = 'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n';
    const parsed = parseP2PSignalStanza(
      roundTrip(
        buildP2PSignalStanza({
          to: 'bob@x',
          callId: 'c',
          signal: 'answer',
          payload: { type: 'answer', sdp },
        })
      )
    );
    expect(parsed?.signal).toBe('answer');
    expect(parsed?.payload).toEqual({ type: 'answer', sdp });
    expect(parsed?.fromBare).toBe('alice@xmpp.example.com');
    expect(parsed?.fromLocal).toBe('alice');
  });

  it('round-trips candidate and end payloads', () => {
    const cand = parseP2PSignalStanza(
      roundTrip(
        buildP2PSignalStanza({
          to: 'bob@x',
          callId: 'c',
          signal: 'candidate',
          payload: {
            candidate: 'candidate:1 1 udp 2122260223 10.0.0.2 5000 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        })
      )
    );
    expect(cand?.payload).toMatchObject({ sdpMid: '0', sdpMLineIndex: 0 });
    const end = parseP2PSignalStanza(
      roundTrip(
        buildP2PSignalStanza({
          to: 'bob@x',
          callId: 'c',
          signal: 'end',
          payload: { reason: 'hangup' },
        })
      )
    );
    expect(end?.payload).toEqual({ reason: 'hangup' });
  });
});

describe('parseP2PSignalStanza rejects what it should', () => {
  const stanza = (attrs: string) =>
    parse(
      `<message from='a@x/r' type='chat'><data type='call-p2p' ${attrs}/></message>`
    );

  it('wrong data type, missing callId, unknown signal, bad JSON, bad payload', () => {
    expect(
      parseP2PSignalStanza(
        parse(`<message><data type='call-state' callId='c' signal='offer' payload='{}'/></message>`)
      )
    ).toBeNull();
    expect(parseP2PSignalStanza(stanza(`signal='offer' payload='{}'`))).toBeNull();
    expect(
      parseP2PSignalStanza(stanza(`callId='c' signal='ping' payload='{}'`))
    ).toBeNull();
    expect(
      parseP2PSignalStanza(stanza(`callId='c' signal='offer' payload='nope'`))
    ).toBeNull();
    // An offer must carry an SDP, and a candidate a candidate string.
    expect(
      parseP2PSignalStanza(
        stanza(`callId='c' signal='offer' payload='{"type":"offer"}'`)
      )
    ).toBeNull();
    expect(
      parseP2PSignalStanza(
        stanza(`callId='c' signal='answer' payload='{"type":"offer","sdp":"x"}'`)
      )
    ).toBeNull();
    expect(
      parseP2PSignalStanza(stanza(`callId='c' signal='candidate' payload='{}'`))
    ).toBeNull();
  });
});

describe('isP2PSignalFresh', () => {
  const make = (extra = '', inner = '') =>
    parseP2PSignalStanza(
      parse(
        `<message from='a@x/r'>${inner}<data type='call-p2p' callId='c' signal='${
          extra || 'candidate'
        }' payload='${
          extra === 'end' ? '{}' : '{&quot;candidate&quot;:&quot;c&quot;}'
        }'/></message>`
      ),
      Date.now()
    )!;

  it('accepts a live stanza with no server timestamp', () => {
    expect(isP2PSignalFresh(make())).toBe(true);
  });

  it('rejects a replayed (delayed) stanza, even an offer', () => {
    expect(
      isP2PSignalFresh(make('', `<delay xmlns='urn:xmpp:delay' stamp='2020-01-01T00:00:00Z'/>`))
    ).toBe(false);
  });

  it('rejects an old stanza-id timestamp but keeps an end', () => {
    const old = String(Date.now() - MAX_P2P_SIGNAL_AGE_MS - 5000) + '000';
    const fresh = String(Date.now()) + '000';
    expect(
      isP2PSignalFresh(make('', `<stanza-id xmlns='urn:xmpp:sid:0' id='${old}'/>`))
    ).toBe(false);
    expect(
      isP2PSignalFresh(make('', `<stanza-id xmlns='urn:xmpp:sid:0' id='${fresh}'/>`))
    ).toBe(true);
    expect(
      isP2PSignalFresh(make('end', `<stanza-id xmlns='urn:xmpp:sid:0' id='${old}'/>`))
    ).toBe(true);
  });
});
