import { describe, expect, it, vi } from 'vitest';
import { collectMessageIds, openRoomAtMessage } from './openRoomAtMessage';
import type { AppDispatch } from '../roomStore';

describe('collectMessageIds', () => {
  it('drops blanks and duplicates and stringifies numbers', () => {
    expect(collectMessageIds('a', undefined, null, '', ' a ', 12, '12', 'b')).toEqual([
      'a',
      '12',
      'b',
    ]);
  });
});

describe('openRoomAtMessage', () => {
  const run = (...ids: Array<string | number | undefined>) => {
    const dispatch = vi.fn();
    openRoomAtMessage(dispatch as unknown as AppDispatch, 'r@conf', ...ids);
    return dispatch;
  };

  it('opens the room, then requests a jump with every id it has', () => {
    const dispatch = run('xmpp-1', 1729, undefined, 'xmpp-1');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'roomMessages/setCurrentRoom',
      payload: { roomJID: 'r@conf' },
    });
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: 'roomMessages/requestJumpToMessage',
      payload: { roomJID: 'r@conf', ids: ['xmpp-1', '1729'] },
    });
  });

  it('only opens the room when there is no message id', () => {
    const dispatch = run(undefined, '');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].type).toBe('roomMessages/setCurrentRoom');
  });

  it('does nothing without a room', () => {
    const dispatch = vi.fn();
    openRoomAtMessage(dispatch as unknown as AppDispatch, '', 'x');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
