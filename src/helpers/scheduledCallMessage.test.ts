import { describe, expect, it } from 'vitest';
import type { IMessage } from '../types/types';
import {
  attachScheduledCallMeta,
  collapseScheduledCallMessages,
  parseScheduledCallMeta,
} from './scheduledCallMessage';
import { createMessageFromXml } from './createMessageFromXml';

const SLUG = 'abcdefghijklmnopqrstuv';
const API = 'https://api.chat.ethora.com';

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  body: 'Scheduled call: Sync, 2026-10-22T15:00:00.000Z',
  type: 'scheduledCall',
  scheduledCallSlug: SLUG,
  scheduledCallTitle: 'Sync',
  scheduledCallStartAt: '2026-10-22T15:00:00.000Z',
  scheduledCallDurationMinutes: '45',
  scheduledCallKind: 'audio',
  scheduledCallStatus: 'scheduled',
  scheduledCallCreatedBy: 'user-1',
  scheduledCallJoinUrl: `https://app.chat.ethora.com/call/${SLUG}`,
  scheduledCallIcsUrl: `${API}/v1/calls/scheduled/${SLUG}.ics`,
  scheduledCallGoogleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
  scheduledCallOutlookUrl: 'https://outlook.live.com/calendar/0/deeplink/compose',
  ...over,
});

describe('parseScheduledCallMeta', () => {
  it('reads the card facts off the data attributes', () => {
    const meta = parseScheduledCallMeta(raw(), API)!;
    expect(meta).toMatchObject({
      slug: SLUG,
      title: 'Sync',
      startAt: '2026-10-22T15:00:00.000Z',
      durationMinutes: 45,
      kind: 'audio',
      status: 'scheduled',
      createdBy: 'user-1',
    });
    expect(meta.icsUrl).toContain(`${SLUG}.ics`);
    expect(meta.googleUrl).toContain('calendar.google.com');
    expect(meta.outlookUrl).toContain('outlook.live.com');
  });

  it('is null for anything that is not a scheduled-call message', () => {
    expect(parseScheduledCallMeta({ body: 'hi' })).toBeNull();
    expect(parseScheduledCallMeta(raw({ type: 'call-state' }))).toBeNull();
    expect(parseScheduledCallMeta(null)).toBeNull();
  });

  it('is null without a valid slug or a parseable start, so the body shows', () => {
    expect(parseScheduledCallMeta(raw({ scheduledCallSlug: 'x' }))).toBeNull();
    expect(parseScheduledCallMeta(raw({ scheduledCallStartAt: 'soon' }))).toBeNull();
  });

  it('defaults status, kind and duration', () => {
    const meta = parseScheduledCallMeta(
      raw({
        scheduledCallStatus: 'weird',
        scheduledCallKind: '',
        scheduledCallDurationMinutes: '',
      })
    )!;
    expect(meta.status).toBe('scheduled');
    expect(meta.kind).toBe('video');
    expect(meta.durationMinutes).toBe(30);
  });

  it('leaves createdBy unset on an older backend', () => {
    expect(parseScheduledCallMeta(raw({ scheduledCallCreatedBy: undefined }))!.createdBy).toBeUndefined();
  });

  it('knows updated and cancelled', () => {
    expect(parseScheduledCallMeta(raw({ scheduledCallStatus: 'updated' }))!.status).toBe('updated');
    expect(parseScheduledCallMeta(raw({ scheduledCallStatus: 'cancelled' }))!.status).toBe('cancelled');
  });

  it('drops forged links instead of rendering them', () => {
    const meta = parseScheduledCallMeta(
      raw({
        scheduledCallGoogleUrl: 'javascript:alert(1)',
        scheduledCallOutlookUrl: 'https://evil.example/x',
        scheduledCallIcsUrl: `https://evil.example/v1/calls/scheduled/${SLUG}.ics`,
      }),
      API
    )!;
    expect(meta.googleUrl).toBeUndefined();
    expect(meta.outlookUrl).toBeUndefined();
    expect(meta.icsUrl).toBeUndefined();
  });
});

describe('createMessageFromXml', () => {
  it('attaches scheduledCall meta to an invite and leaves other messages alone', async () => {
    const invite = await createMessageFromXml({
      id: 'm1',
      body: 'Scheduled call: Sync',
      roomJid: 'r@conference.x',
      data: {
        type: 'scheduledCall',
        scheduledCallSlug: SLUG,
        scheduledCallStartAt: '2026-10-22T15:00:00.000Z',
        scheduledCallDurationMinutes: '30',
        scheduledCallStatus: 'scheduled',
        scheduledCallTitle: 'Sync',
      },
    } as never);
    expect(invite.scheduledCall?.slug).toBe(SLUG);
    expect(invite.body).toBe('Scheduled call: Sync');

    const plain = await createMessageFromXml({
      id: 'm2',
      body: 'hello',
      roomJid: 'r@conference.x',
      data: {},
    } as never);
    expect(plain.scheduledCall).toBeUndefined();
  });

  it('attachScheduledCallMeta returns the same object when there is nothing to attach', () => {
    const message = { id: 'a', body: 'x' } as IMessage;
    expect(attachScheduledCallMeta(message)).toBe(message);
  });
});

describe('collapseScheduledCallMessages', () => {
  const msg = (id: string, time: number, slug?: string, status = 'scheduled'): IMessage =>
    ({
      id,
      body: id,
      date: new Date(time).toISOString(),
      messageTimestampMs: time,
      user: { id: 'u' },
      roomJid: 'r@c',
      ...(slug
        ? {
            scheduledCall: {
              slug,
              title: id,
              startAt: '2026-10-22T15:00:00.000Z',
              durationMinutes: 30,
              kind: 'video',
              status,
            },
          }
        : {}),
    }) as unknown as IMessage;

  it('keeps one card per slug: the newest', () => {
    const list = [
      msg('invite', 1, SLUG),
      msg('chat', 2),
      msg('edit', 3, SLUG, 'updated'),
      msg('cancel', 4, SLUG, 'cancelled'),
      msg('tail', 5),
    ];
    expect(collapseScheduledCallMessages(list).map((m) => m.id)).toEqual([
      'chat',
      'cancel',
      'tail',
    ]);
  });

  it('keeps separate calls separate', () => {
    const other = 'zyxwvutsrqponmlkjihgfe';
    const list = [msg('a', 1, SLUG), msg('b', 2, other), msg('a2', 3, SLUG)];
    expect(collapseScheduledCallMessages(list).map((m) => m.id)).toEqual(['b', 'a2']);
  });

  it('does not depend on array order for which one is newest', () => {
    const list = [msg('late', 9, SLUG, 'cancelled'), msg('early', 1, SLUG)];
    expect(collapseScheduledCallMessages(list).map((m) => m.id)).toEqual(['late']);
  });

  it('returns the input untouched when nothing repeats', () => {
    const list = [msg('a', 1), msg('b', 2, SLUG)];
    expect(collapseScheduledCallMessages(list)).toBe(list);
  });
});
