import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../apiClient', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

const state: any = {
  chatSettingStore: { config: { appId: 'app1' }, user: { token: 'jwt' } },
};
vi.mock('../../roomStore', () => ({ store: { getState: () => state } }));

import { searchMessages } from './messageSearch.api';

const hit = (over: Record<string, unknown>) => ({
  chatId: 'room1',
  chatType: 'groupchat',
  room: 'room1@conference.x',
  from: 'u1',
  fromUserId: 'id1',
  body: 'hello',
  messageId: 'm1',
  stanzaId: '100',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('searchMessages', () => {
  beforeEach(() => {
    get.mockReset();
    state.chatSettingStore.config = { appId: 'app1' };
  });

  it('queries the app archive with the session token and filters', async () => {
    get.mockResolvedValue({ data: { items: [hit({})], total: 1, limit: 20, offset: 0 } });
    await searchMessages({ q: 'hel', chatId: 'room1', offset: 40 });

    expect(get).toHaveBeenCalledWith(
      '/v2/apps/app1/messages/search',
      expect.objectContaining({
        params: { q: 'hel', limit: 20, offset: 40, chatId: 'room1' },
        headers: { Authorization: 'jwt' },
      })
    );
  });

  it('omits chatId for an all-chats search', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    await searchMessages({ q: 'hel' });
    expect(get.mock.calls[0][1].params).not.toHaveProperty('chatId');
  });

  it('drops deleted messages but still pages by server rows', async () => {
    get.mockResolvedValue({
      data: {
        items: [hit({ stanzaId: '1' }), hit({ stanzaId: '2', deletedAt: '2026-02-01' }), hit({ stanzaId: '3' })],
        total: 50,
        limit: 20,
        offset: 0,
      },
    });
    const page = await searchMessages({ q: 'hel' });

    expect(page.items.map((h) => h.stanzaId)).toEqual(['1', '3']);
    // 3 rows came back, one was hidden: the next page starts at 3, not 2.
    expect(page.nextOffset).toBe(3);
    expect(page.total).toBe(50);
  });

  it('refuses to run without an appId instead of calling a bogus URL', async () => {
    state.chatSettingStore.config = {};
    await expect(searchMessages({ q: 'hel' })).rejects.toThrow('message_search_no_app_id');
    expect(get).not.toHaveBeenCalled();
  });
});
