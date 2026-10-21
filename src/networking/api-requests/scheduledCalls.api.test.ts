import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpMock } = vi.hoisted(() => ({
  httpMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../apiClient', () => ({ default: httpMock }));
vi.mock('../../roomStore', () => ({
  store: {
    getState: () => ({ chatSettingStore: { user: { token: 'tok' } } }),
  },
}));

import {
  ScheduledCallApiError,
  cancelScheduledCall,
  createScheduledCall,
  getScheduledCall,
  listScheduledCalls,
  updateScheduledCall,
} from './scheduledCalls.api';

const auth = { headers: { Authorization: 'tok' } };
const call = { slug: 'abcdefghijklmnopqrstuv', title: 'Sync', status: 'scheduled' };
const links = { join: 'j', ics: 'i', google: 'g', outlook: 'o' };

describe('scheduled calls api', () => {
  beforeEach(() => {
    Object.values(httpMock).forEach((fn) => fn.mockReset());
  });

  it('creates a call', async () => {
    httpMock.post.mockResolvedValue({ data: { scheduledCall: call, links } });
    const input = { chatName: 'app_room', startAt: '2026-10-22T15:00:00.000Z' };
    const out = await createScheduledCall(input);
    expect(httpMock.post).toHaveBeenCalledWith('/v1/chats/calls/scheduled', input, auth);
    expect(out.scheduledCall.slug).toBe(call.slug);
    expect(out.links).toEqual(links);
  });

  it('lists calls with the filters as query params', async () => {
    httpMock.get.mockResolvedValue({
      data: { items: [{ scheduledCall: call, links }] },
    });
    const out = await listScheduledCalls({ chatName: 'app_room', from: 'a', to: 'b' });
    expect(httpMock.get).toHaveBeenCalledWith('/v1/chats/calls/scheduled', {
      ...auth,
      params: { chatName: 'app_room', from: 'a', to: 'b' },
    });
    expect(out).toHaveLength(1);
  });

  it('gets one call with its chat', async () => {
    httpMock.get.mockResolvedValue({
      data: {
        scheduledCall: call,
        links,
        chat: { name: 'app_room', title: 'Room', type: 'group', jid: 'app_room@conference.x' },
      },
    });
    const out = await getScheduledCall(call.slug);
    expect(httpMock.get).toHaveBeenCalledWith(`/v1/chats/calls/scheduled/${call.slug}`, auth);
    expect(out.chat.jid).toBe('app_room@conference.x');
  });

  it('maps 404 and 403 to open errors', async () => {
    httpMock.get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(getScheduledCall('x')).rejects.toMatchObject({ reason: 'not-found', status: 404 });
    httpMock.get.mockRejectedValueOnce({
      response: { status: 403, data: { error: 'not-a-member' } },
    });
    await expect(getScheduledCall('x')).rejects.toMatchObject({
      reason: 'not-a-member',
      code: 'not-a-member',
    });
    httpMock.get.mockRejectedValueOnce(new Error('offline'));
    const err = await getScheduledCall('x').catch((e) => e);
    expect(err).toBeInstanceOf(ScheduledCallApiError);
    expect(err.reason).toBe('network');
  });

  it('keeps the backend code for the form to react to', async () => {
    httpMock.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: 'Start is in the past', code: 'START_IN_PAST' } },
    });
    await expect(createScheduledCall({ chatName: 'c', startAt: 'x' })).rejects.toMatchObject({
      status: 422,
      code: 'START_IN_PAST',
    });
    httpMock.patch.mockRejectedValueOnce({
      response: { status: 403, data: { error: 'forbidden', code: 'FORBIDDEN' } },
    });
    await expect(updateScheduledCall('s', { title: 'x' })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('rejects an answer without a chat', async () => {
    httpMock.get.mockResolvedValue({ data: { scheduledCall: call, links } });
    await expect(getScheduledCall(call.slug)).rejects.toBeInstanceOf(ScheduledCallApiError);
  });

  it('patches only what it is given and encodes the slug', async () => {
    httpMock.patch.mockResolvedValue({ data: { scheduledCall: call, links } });
    await updateScheduledCall('a/b', { title: 'New' });
    expect(httpMock.patch).toHaveBeenCalledWith(
      '/v1/chats/calls/scheduled/a%2Fb',
      { title: 'New' },
      auth
    );
  });

  it('cancels with DELETE and returns the cancelled call', async () => {
    httpMock.delete.mockResolvedValue({
      data: { scheduledCall: { ...call, status: 'cancelled' } },
    });
    const out = await cancelScheduledCall(call.slug);
    expect(httpMock.delete).toHaveBeenCalledWith(`/v1/chats/calls/scheduled/${call.slug}`, auth);
    expect(out.status).toBe('cancelled');
  });
});
