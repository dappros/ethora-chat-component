import { afterEach, describe, expect, it } from 'vitest';
import { store } from '../roomStore';
import { setConfig } from '../roomStore/chatSettingsSlice';
import { clearOpenRequest } from '../roomStore/scheduledCallSlice';
import { openScheduledCall, parseScheduledCallLink } from './openScheduledCall';

const SLUG = 'abcdefghijklmnopqrstuv';

describe('openScheduledCall', () => {
  afterEach(() => {
    store.dispatch(clearOpenRequest());
    store.dispatch(setConfig({} as never));
  });

  it('holds a request for the mounted chat to pick up', () => {
    expect(openScheduledCall(SLUG)).toBe(true);
    expect(store.getState().scheduledCall.openRequest?.slug).toBe(SLUG);
  });

  it('ignores an implausible slug', () => {
    expect(openScheduledCall('nope')).toBe(false);
    expect(store.getState().scheduledCall.openRequest).toBeNull();
  });

  it('parseScheduledCallLink accepts the hosted app and the page host by default', () => {
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`https://${window.location.host}/call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`https://anywhere.example/call/${SLUG}`)).toBeNull();
  });

  it('parseScheduledCallLink follows config.scheduledCalls hosts and schemes', () => {
    store.dispatch(
      setConfig({ scheduledCalls: { hosts: ['chat.acme.test'], schemes: ['ethora'] } } as never)
    );
    expect(parseScheduledCallLink(`https://chat.acme.test/call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`https://anywhere.example/call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`ethora://call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`nope://call/${SLUG}`)).toBeNull();
    // An explicit option wins over the config.
    expect(
      parseScheduledCallLink(`https://anywhere.example/call/${SLUG}`, { hosts: ['anywhere.example'] })
    ).toBe(SLUG);
  });
});
