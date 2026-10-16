import { describe, expect, it, vi } from 'vitest';
import XmppClient from './xmppClient';

const makeClient = () => new XmppClient('alice', 'pw');

describe('XmppClient.sendHistoryReceivedReceiptStanza', () => {
  it('sends a receipt for a message not yet acked', () => {
    const client = makeClient();
    const spy = vi
      .spyOn(client, 'sendReceivedReceiptStanza')
      .mockImplementation(() => {});

    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');

    expect(spy).toHaveBeenCalledWith('m1', 'room1@conference.example.com');
  });

  it('does not re-send for the same room+message on a second call', () => {
    const client = makeClient();
    const spy = vi
      .spyOn(client, 'sendReceivedReceiptStanza')
      .mockImplementation(() => {});

    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');
    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');
    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst in one room into the leading and newest receipt', () => {
    vi.useFakeTimers();
    try {
      const client = makeClient();
      const spy = vi
        .spyOn(client, 'sendReceivedReceiptStanza')
        .mockImplementation(() => {});

      client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1', 1000, 1500);
      client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm2', 2000, 1500);

      // m1 goes out at once; m2 is held until the window closes.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith('m1', 'room1@conference.example.com');

      vi.advanceTimersByTime(1500);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith('m2', 'room1@conference.example.com');
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('sends independently for different rooms', () => {
    vi.useFakeTimers();
    try {
      const client = makeClient();
      const spy = vi
        .spyOn(client, 'sendReceivedReceiptStanza')
        .mockImplementation(() => {});

      client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');
      client.sendHistoryReceivedReceiptStanza('room2@conference.example.com', 'm1');

      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
