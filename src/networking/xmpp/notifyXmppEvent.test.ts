import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';
import { store } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import { notifyXmppEvent } from './notifyXmppEvent';

describe('notifyXmppEvent', () => {
  const onXmppEvent = vi.fn();

  beforeEach(() => {
    onXmppEvent.mockReset();
    store.dispatch(
      setConfig({ eventHandlers: { onXmppEvent } } as any)
    );
  });

  it('reports every message stanza with XML and addressing metadata', () => {
    const stanza = parse(
      `<message type='groupchat' from='room@conference.example.com/alice' to='me@example.com' id='m-1'><body>hello</body></message>`
    );

    notifyXmppEvent(stanza);

    expect(onXmppEvent).toHaveBeenCalledOnce();
    expect(onXmppEvent).toHaveBeenCalledWith({
      stanza: stanza.toString(),
      from: 'room@conference.example.com/alice',
      to: 'me@example.com',
      id: 'm-1',
      type: 'groupchat',
    });
  });

  it('ignores non-message stanzas', () => {
    notifyXmppEvent(parse(`<presence from='alice@example.com'/>`));
    expect(onXmppEvent).not.toHaveBeenCalled();
  });

  it('does not let a throwing host callback interrupt stanza handling', () => {
    onXmppEvent.mockImplementationOnce(() => {
      throw new Error('host callback failed');
    });

    expect(() => notifyXmppEvent(parse(`<message><body>hello</body></message>`))).not.toThrow();
  });

  it('catches a rejected async host callback', async () => {
    onXmppEvent.mockRejectedValueOnce(new Error('host callback failed'));

    expect(() => notifyXmppEvent(parse(`<message><body>hello</body></message>`))).not.toThrow();
    await Promise.resolve();
  });
});
