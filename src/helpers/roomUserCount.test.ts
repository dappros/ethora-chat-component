import { describe, expect, it } from 'vitest';
import {
  adjustUsersCnt,
  getRoomUserCount,
  isRoomMembersTruncated,
} from './roomUserCount';
import { createRoomFromApi } from './createRoomFromApi';

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `id${i}`,
    firstName: 'F',
    lastName: String(i),
    xmppUsername: `u${i}`,
  }));

describe('getRoomUserCount', () => {
  it('prefers usersCnt over a truncated members array', () => {
    expect(getRoomUserCount({ members: members(30), usersCnt: 435 } as any)).toBe(435);
  });
  it('falls back to members.length when usersCnt is missing or smaller', () => {
    expect(getRoomUserCount({ members: members(3) } as any)).toBe(3);
    expect(getRoomUserCount({ members: members(3), usersCnt: 1 } as any)).toBe(3);
    expect(getRoomUserCount(undefined)).toBe(0);
  });
  it('detects truncation', () => {
    expect(isRoomMembersTruncated({ members: members(30), usersCnt: 435 } as any)).toBe(true);
    expect(isRoomMembersTruncated({ members: members(3), usersCnt: 3 } as any)).toBe(false);
  });
});

describe('adjustUsersCnt', () => {
  it('adjusts the current count, not the truncated array length', () => {
    const room = { members: members(30), usersCnt: 435 } as any;
    expect(adjustUsersCnt(room, 1, 31)).toBe(436);
    expect(adjustUsersCnt(room, -1, 29)).toBe(434);
  });
});

describe('createRoomFromApi usersCnt', () => {
  it('uses the API usersCnt when members is truncated', () => {
    const room = createRoomFromApi(
      { name: 'a_b', type: 'public', title: 'T', members: members(30), usersCnt: 435 },
      'conference.example.com'
    );
    expect(room?.usersCnt).toBe(435);
    expect(room?.members.length).toBe(30);
  });
  it('falls back to members.length without an API usersCnt', () => {
    const room = createRoomFromApi(
      { name: 'a_b', type: 'public', title: 'T', members: members(4) },
      'conference.example.com'
    );
    expect(room?.usersCnt).toBe(4);
  });
});
