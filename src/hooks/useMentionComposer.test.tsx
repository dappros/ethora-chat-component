import { act, renderHook } from '@testing-library/react';
import { useMentionComposer } from './useMentionComposer';
import { RoomMember } from '../types/types';

const members: RoomMember[] = [
  { _id: '1', firstName: 'Roman', lastName: 'Leshchuh', xmppUsername: 'roman@x' },
  { _id: '2', firstName: 'Robert', lastName: 'Anders', xmppUsername: 'robert@x' },
];

describe('useMentionComposer', () => {
  it('opens the dropdown when @ starts a word and filters as you type', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members, selfId: 'me@x' })
    );

    act(() => result.current.handleTextChange('', '@', 1));
    expect(result.current.isDropdownOpen).toBe(true);
    expect(result.current.candidates.map((c) => c.name)).toEqual([
      'Robert Anders',
      'Roman Leshchuh',
    ]);

    act(() => result.current.handleTextChange('@', '@rom', 4));
    expect(result.current.candidates.map((c) => c.name)).toEqual(['Roman Leshchuh']);
  });

  it('closes the dropdown once a space follows the query', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members })
    );
    act(() => result.current.handleTextChange('', '@rom', 4));
    expect(result.current.isDropdownOpen).toBe(true);

    act(() => result.current.handleTextChange('@rom', '@rom ', 5));
    expect(result.current.isDropdownOpen).toBe(false);
  });

  it('selecting a candidate inserts "@FullName " and records a mention span', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members })
    );
    act(() => result.current.handleTextChange('', '@rom', 4));

    let selection: { text: string; caret: number } | null = null;
    act(() => {
      selection = result.current.selectCandidate(
        { jid: 'roman@x', name: 'Roman Leshchuh' },
        '@rom',
        4
      );
    });

    expect(selection).toEqual({ text: '@Roman Leshchuh ', caret: 16 });
    expect(result.current.mentionSpans).toEqual([
      { jid: 'roman@x', name: 'Roman Leshchuh', offset: 0, length: 15 },
    ]);
    expect(result.current.isDropdownOpen).toBe(false);
  });

  it('shifts a later mention span when text is inserted entirely before it', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members })
    );
    act(() => result.current.handleTextChange('', '@rob', 4));
    act(() => {
      result.current.selectCandidate({ jid: 'robert@x', name: 'Robert Anders' }, '@rob', 4);
    });
    expect(result.current.mentionSpans[0].offset).toBe(0);

    // Now insert "hi " before the whole mention: "@Robert Anders " -> "hi @Robert Anders "
    act(() =>
      result.current.handleTextChange(
        '@Robert Anders ',
        'hi @Robert Anders ',
        3
      )
    );
    expect(result.current.mentionSpans).toEqual([
      { jid: 'robert@x', name: 'Robert Anders', offset: 3, length: 14 },
    ]);
  });

  it('atomically deletes a whole mention token on Backspace at its end', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members })
    );
    act(() => result.current.handleTextChange('', '@rom', 4));
    act(() => {
      result.current.selectCandidate({ jid: 'roman@x', name: 'Roman' }, '@rom', 4);
    });
    // text is now "@Roman " (7 chars), mention span offset 0 length 6
    const text = '@Roman ';

    let edit: { text: string; caret: number } | null = null;
    act(() => {
      edit = result.current.handleBackspace(text, 6, 6);
    });

    expect(edit).toEqual({ text: ' ', caret: 0 });
    expect(result.current.mentionSpans).toEqual([]);
  });

  it('does not intercept Backspace when there is a selection (range delete)', () => {
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: members })
    );
    act(() => result.current.handleTextChange('', '@rom', 4));
    act(() => {
      result.current.selectCandidate({ jid: 'roman@x', name: 'Roman' }, '@rom', 4);
    });

    const edit = result.current.handleBackspace('@Roman ', 3, 6);
    expect(edit).toBeNull();
  });

  it('caps the inline dropdown at 5 and flags overflow for a larger room', () => {
    const manyMembers: RoomMember[] = Array.from({ length: 8 }, (_, i) => ({
      _id: String(i),
      firstName: `User${i}`,
      lastName: 'Test',
      xmppUsername: `user${i}@x`,
    }));
    const { result } = renderHook(() =>
      useMentionComposer({ roomMembers: manyMembers })
    );
    act(() => result.current.handleTextChange('', '@', 1));

    expect(result.current.candidates).toHaveLength(8);
    expect(result.current.visibleCandidates).toHaveLength(5);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('excludes the current user from candidates', () => {
    const selfMember: RoomMember = {
      _id: '3',
      firstName: 'Me',
      lastName: 'Self',
      xmppUsername: 'me@x',
    };
    const { result } = renderHook(() =>
      useMentionComposer({
        roomMembers: [...members, selfMember],
        selfId: 'me@x',
      })
    );
    act(() => result.current.handleTextChange('', '@', 1));
    expect(result.current.candidates.some((c) => c.name === 'Me Self')).toBe(false);
  });
});
