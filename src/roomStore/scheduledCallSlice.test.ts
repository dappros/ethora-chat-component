import { describe, expect, it } from 'vitest';
import reducer, {
  clearOpenRequest,
  closePreJoin,
  closeScheduleModal,
  detailsFailed,
  detailsLoaded,
  detailsLoading,
  forgetDetails,
  openPreJoin,
  openScheduleModal,
  requestOpenScheduledCall,
  setOpenError,
} from './scheduledCallSlice';
import type { ScheduledCallDetails } from '../types/models/scheduledCall.model';

const details = (title = 'Sync'): ScheduledCallDetails => ({
  scheduledCall: {
    chatName: 'app_room',
    title,
    startAt: '2026-10-22T15:00:00.000Z',
    durationMinutes: 30,
    kind: 'video',
    slug: 'abcdefghijklmnopqrstuv',
    status: 'scheduled',
  },
  links: { join: 'j', ics: 'i', google: 'g', outlook: 'o' },
  chat: { name: 'app_room', jid: 'app_room@conference.x' },
});

describe('scheduledCallSlice', () => {
  const init = reducer(undefined, { type: '@@init' });

  it('holds an open request until it is cleared, and clears a previous error', () => {
    let s = reducer(init, setOpenError({ slug: 'a', reason: 'not-found' }));
    s = reducer(s, requestOpenScheduledCall('abcdefghijklmnopqrstuv'));
    expect(s.openRequest?.slug).toBe('abcdefghijklmnopqrstuv');
    expect(s.openError).toBeNull();
    expect(reducer(s, clearOpenRequest()).openRequest).toBeNull();
  });

  it('opens the pre-join panel and caches the call', () => {
    const d = details();
    let s = reducer(init, openPreJoin(d));
    expect(s.preJoin).toEqual(d);
    expect(s.details[d.scheduledCall.slug].status).toBe('ready');
    s = reducer(s, closePreJoin());
    expect(s.preJoin).toBeNull();
  });

  it('refreshes the open pre-join panel when its call is reloaded', () => {
    let s = reducer(init, openPreJoin(details('Old')));
    s = reducer(s, detailsLoaded(details('New')));
    expect(s.preJoin?.scheduledCall.title).toBe('New');
  });

  it('tracks loading, failure and forgetting of details', () => {
    const slug = 'abcdefghijklmnopqrstuv';
    let s = reducer(init, detailsLoading(slug));
    expect(s.details[slug].status).toBe('loading');
    s = reducer(s, detailsFailed({ slug, reason: 'not-found' }));
    expect(s.details[slug]).toMatchObject({ status: 'error', error: 'not-found' });
    s = reducer(s, forgetDetails(slug));
    expect(s.details[slug]).toBeUndefined();
  });

  it('opens and closes the schedule form, for create and edit', () => {
    let s = reducer(init, openScheduleModal({ roomJid: 'r@c' }));
    expect(s.scheduleModal).toEqual({ roomJid: 'r@c', editing: null });
    s = reducer(s, openScheduleModal({ roomJid: 'r@c', editing: details() }));
    expect(s.scheduleModal?.editing?.scheduledCall.title).toBe('Sync');
    expect(reducer(s, closeScheduleModal()).scheduleModal).toBeNull();
  });

  it('resets on logout', () => {
    let s = reducer(init, openPreJoin(details()));
    s = reducer(s, { type: 'chatSettingStore/logout' });
    expect(s.preJoin).toBeNull();
    expect(s.details).toEqual({});
  });
});
