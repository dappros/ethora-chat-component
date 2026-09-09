import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchInput } from './Search';

// The wrapper is `width: 100%` with 16px of horizontal padding and a 1px
// border. Without border-box that resolves to 34px WIDER than whatever slot
// it was given, so it overflowed every container it was dropped into - the
// visible symptom was the member search being clipped at the right edge of
// the room profile's members card.
describe('SearchInput sizing', () => {
  it('sizes its padding and border inside the width it is given', () => {
    render(<SearchInput placeholder="Search members" />);
    const wrapper = screen.getByPlaceholderText('Search members')
      .parentElement as HTMLElement;
    expect(getComputedStyle(wrapper).boxSizing).toBe('border-box');
  });
});
