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

  it('sends independently for different messages or different rooms', () => {
    const client = makeClient();
    const spy = vi
      .spyOn(client, 'sendReceivedReceiptStanza')
      .mockImplementation(() => {});

    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm1');
    client.sendHistoryReceivedReceiptStanza('room1@conference.example.com', 'm2');
    client.sendHistoryReceivedReceiptStanza('room2@conference.example.com', 'm1');

    expect(spy).toHaveBeenCalledTimes(3);
  });
});
