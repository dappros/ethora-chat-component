import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUsers = vi.hoisted(() => vi.fn());
vi.mock('./userResolver', () => ({ requestUsers }));

import { checkSingleUser, checkUniqueUsers } from './checkUniqueUsers';

describe('checkUniqueUsers / checkSingleUser route through the shared resolver', () => {
  beforeEach(() => requestUsers.mockClear());

  it('requests the "Deleted"-named senders of a history batch', () => {
    checkUniqueUsers([
      { user: { id: 'a_1', name: 'Deleted User' } },
      { user: { id: 'a_1', name: 'Deleted User' } },
      { user: { id: 'a_2', name: 'Bob' } },
    ] as any);
    expect(requestUsers).toHaveBeenCalledWith(['a_1']);
  });

  it('checkSingleUser requests an unknown sender and skips a known one', async () => {
    await checkSingleUser({}, 'a_3');
    expect(requestUsers).toHaveBeenCalledWith(['a_3']);
    requestUsers.mockClear();
    await checkSingleUser({ a_3: {} as any }, 'a_3');
    expect(requestUsers).not.toHaveBeenCalled();
  });
});
