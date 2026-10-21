import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTypography } from './useTypography';
import { clearTypography } from '../helpers/applyTypography';

const fontVar = () => document.documentElement.style.getPropertyValue('--ethora-font-family');
const sizeVar = () => document.documentElement.style.getPropertyValue('--ethora-font-size');

afterEach(() => clearTypography());

describe('useTypography', () => {
  it('applies the font and the size', () => {
    renderHook(() => useTypography({ fontFamily: 'Inter', fontSize: 15, googleFontsFamily: 'Inter' }));
    expect(fontVar()).toContain('Inter');
    expect(sizeVar()).toBe('15px');
    expect(document.getElementById('ethora-typography-google')).not.toBeNull();
  });

  it('takes a changed font live', () => {
    const { rerender } = renderHook(({ t }) => useTypography(t), {
      initialProps: { t: { fontFamily: 'Inter', fontSize: 15 } as any },
    });
    rerender({ t: { fontFamily: 'Lora', fontSize: 18 } });
    expect(fontVar()).toContain('Lora');
    expect(sizeVar()).toBe('18px');
  });

  it('puts the default font back when the typography goes away on a mounted chat', () => {
    const { rerender } = renderHook(({ t }) => useTypography(t), {
      initialProps: { t: { fontFamily: 'Inter', fontSize: 15, googleFontsFamily: 'Inter' } as any },
    });
    expect(fontVar()).toContain('Inter');
    rerender({ t: undefined });
    expect(fontVar()).toBe('');
    expect(sizeVar()).toBe('');
    expect(document.getElementById('ethora-typography-google')).toBeNull();
  });

  it('leaves a font somebody else set alone when it never applied one', () => {
    document.documentElement.style.setProperty('--ethora-font-family', 'Hosts Own');
    const { rerender } = renderHook(({ t }) => useTypography(t), { initialProps: { t: undefined as any } });
    rerender({ t: undefined });
    expect(fontVar()).toBe('Hosts Own');
  });
});
