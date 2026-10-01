import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchInput } from './Search';

const Harness = ({ initial = '' }: { initial?: string }) => {
  const [v, setV] = useState(initial);
  return (
    <SearchInput
      placeholder="Find"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClear={() => setV('')}
    />
  );
};

describe('SearchInput clear button', () => {
  it('is hidden when empty and appears with text', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Find'), {
      target: { value: 'abc' },
    });
    const btn = screen.getByRole('button', { name: 'Clear search' });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('clears and refocuses on click', () => {
    render(<Harness initial="abc" />);
    const input = screen.getByPlaceholderText('Find') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('clears on Escape when non-empty', () => {
    render(<Harness initial="abc" />);
    const input = screen.getByPlaceholderText('Find') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('shows no button without onClear', () => {
    render(<SearchInput placeholder="Find" value="abc" onChange={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
