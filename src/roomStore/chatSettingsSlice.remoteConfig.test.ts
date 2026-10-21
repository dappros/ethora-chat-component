import { describe, expect, it } from 'vitest';
import reducer, { setConfig, setRemoteConfig } from './chatSettingsSlice';

const initial = () => reducer(undefined, { type: '@@init' });

describe('chatSettings remoteConfig', () => {
  it('setConfig is unchanged while no record is held', () => {
    const cfg = { appId: 'a1', colors: { primary: '#111111' } } as any;
    expect(reducer(initial(), setConfig(cfg)).config).toBe(cfg);
  });

  it('lays the record over every config written after it, whoever writes', () => {
    let s = reducer(initial(), setRemoteConfig({ 'colors.primary': '#0052cd', disableMedia: true }));
    s = reducer(s, setConfig({ appId: 'a1', colors: { primary: '#111111', secondary: '#222222' } } as any));
    expect(s.config?.colors).toEqual({ primary: '#0052cd', secondary: '#222222' });
    expect(s.config?.disableMedia).toBe(true);
    s = reducer(s, setConfig({ appId: 'a1', colors: { primary: '#333333' } } as any));
    expect(s.config?.colors?.primary).toBe('#0052cd');
  });

  it('a cleared record stops applying from the next write', () => {
    let s = reducer(initial(), setRemoteConfig({ disableMedia: true }));
    s = reducer(s, setRemoteConfig(null));
    s = reducer(s, setConfig({ appId: 'a1' } as any));
    expect(s.config?.disableMedia).toBeUndefined();
  });

  it('does not touch the host input object', () => {
    const cfg = Object.freeze({ appId: 'a1', colors: Object.freeze({ primary: '#111111' }) }) as any;
    const s = reducer(reducer(initial(), setRemoteConfig({ 'colors.primary': '#0052cd' })), setConfig(cfg));
    expect(cfg.colors.primary).toBe('#111111');
    expect(s.config?.colors?.primary).toBe('#0052cd');
  });

  it('keeps recording the appId from the written config', () => {
    const s = reducer(reducer(initial(), setRemoteConfig({ disableMedia: true })), setConfig({ appId: 'zz' } as any));
    expect(s.appId).toBe('zz');
  });
});
