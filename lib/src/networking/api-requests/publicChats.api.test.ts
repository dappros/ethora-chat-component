import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../apiClient', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('../../roomStore', () => ({
  store: { getState: () => ({ chatSettingStore: { user: { token: 'jwt' } } }) },
}));

import { getPublicChats, PUBLIC_CHATS_PAGE_SIZE } from './publicChats.api';

describe('getPublicChats', () => {
  beforeEach(() => get.mockReset());

  it('never asks for more than the 50 the endpoint accepts', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    await getPublicChats({ limit: 500, offset: 100 });
    expect(get.mock.calls[0][1].params).toEqual({ limit: PUBLIC_CHATS_PAGE_SIZE, offset: 100 });
    expect(get.mock.calls[0][1].headers).toEqual({ Authorization: 'jwt' });
  });

  it('hides reported chats and entries without a name, but pages by server rows', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          { name: 'a', title: ' Alpha ', description: 'first', type: 'public' },
          { name: 'b', title: 'Bad', reported: true },
          { title: 'Nameless' },
          { name: 'd', picture: 'https://x/p.png', e2ee: true },
        ],
        total: 250,
        limit: 50,
        offset: 0,
      },
    });
    const page = await getPublicChats();

    expect(page.items.map((c) => c.name)).toEqual(['a', 'd']);
    expect(page.items[0]).toMatchObject({ title: 'Alpha', description: 'first' });
    expect(page.items[1]).toMatchObject({ picture: 'https://x/p.png', e2ee: true });
    // four rows came back, two were hidden: the next page still starts at 4.
    expect(page.nextOffset).toBe(4);
    expect(page.total).toBe(250);
  });
});
