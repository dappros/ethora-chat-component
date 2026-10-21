import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  LIVE_CONFIG_KEYS,
  applyRemoteConfigRecord,
  classifyConfigChange,
  flattenConfig,
  isLiveConfigPath,
  parseRemoteConfigRecord,
} from './liveConfig';

describe('parseRemoteConfigRecord', () => {
  it('keeps valid values of live keys, normalised', () => {
    expect(
      parseRemoteConfigRecord({
        'colors.primary': ' #0052cd ',
        'colors.ownMessageBackground': 'rgb(1, 2, 3)',
        colorScheme: 'dark',
        disableMedia: 'true',
        disableRooms: false,
        'customTypingIndicator.position': 'top',
        'customTypingIndicator.text': 'Thinking',
        'typography.fontFamily': "Inter, 'Open Sans'",
        'typography.googleFontsFamily': 'Open Sans',
      })
    ).toEqual({
      'colors.primary': '#0052cd',
      'colors.ownMessageBackground': 'rgb(1, 2, 3)',
      colorScheme: 'dark',
      disableMedia: true,
      disableRooms: false,
      'customTypingIndicator.position': 'top',
      'customTypingIndicator.text': 'Thinking',
      'typography.fontFamily': "Inter, 'Open Sans'",
      'typography.googleFontsFamily': 'Open Sans',
    });
  });

  it('turns a size into px, rem and em at 16px', () => {
    expect(parseRemoteConfigRecord({ 'typography.fontSize': '14px' })).toEqual({ 'typography.fontSize': 14 });
    expect(parseRemoteConfigRecord({ 'typography.fontSize': '15' })).toEqual({ 'typography.fontSize': 15 });
    expect(parseRemoteConfigRecord({ 'typography.fontSize': '1.25rem' })).toEqual({ 'typography.fontSize': 20 });
    expect(parseRemoteConfigRecord({ 'typography.fontSize': '999px' })).toEqual({});
    expect(parseRemoteConfigRecord({ 'typography.fontSize': '0' })).toEqual({});
  });

  it('drops keys outside the allowlist, whatever they carry', () => {
    expect(
      parseRemoteConfigRecord({
        baseUrl: 'https://evil.example',
        appId: 'x',
        'xmppSettings.host': 'evil.example',
        customLogin: true,
        'eventHandlers.onError': 'alert(1)',
        'colors.unknown': '#fff',
        disableLastRead: true,
        __proto__: { polluted: true },
        'headerLogo': 'https://evil.example/x.png',
        'backgroundChat.image': 'https://evil.example/x.png',
      })
    ).toEqual({});
  });

  it('drops hostile or malformed values', () => {
    expect(
      parseRemoteConfigRecord({
        'colors.primary': 'red; background:url(https://evil)',
        'colors.icons': '} body { display:none',
        'colors.iconsBg': 'javascript:alert(1)',
        colorScheme: 'sepia',
        'typography.fontFamily': 'x;}*{display:none',
        'typography.googleFontsFamily': 'a/b?x',
        'customTypingIndicator.text': 'bad\nline',
        'customTypingIndicator.position': 'left',
        disableHeader: 'maybe',
        disableMedia: { toString: () => 'true' },
        disableRoomMenu: ['true'],
      })
    ).toEqual({});
    expect(parseRemoteConfigRecord({ 'customTypingIndicator.text': 'x'.repeat(81) })).toEqual({});
  });

  it('copes with a non-object answer', () => {
    for (const v of [null, undefined, 'x', 3, [], [['colors.primary', '#fff']]]) {
      expect(parseRemoteConfigRecord(v)).toEqual({});
    }
  });

  it('does not accept clearStoreBeforeInit or botMessageAutoScroll (the chat has no such options)', () => {
    expect(
      parseRemoteConfigRecord({ clearStoreBeforeInit: true, botMessageAutoScroll: true })
    ).toEqual({});
  });
});

describe('applyRemoteConfigRecord', () => {
  it('lays the record over the config without losing siblings or mutating the input', () => {
    const fn = () => {};
    const base = Object.freeze({
      appId: 'a1',
      colors: Object.freeze({ primary: '#111111', secondary: '#222222' }),
      customTypingIndicator: Object.freeze({ enabled: false, styles: { color: 'red' } }),
      eventHandlers: Object.freeze({ onError: fn }),
    });
    const out = applyRemoteConfigRecord(base as any, {
      'colors.primary': '#0052cd',
      'customTypingIndicator.enabled': true,
      'customTypingIndicator.text': 'Typing',
      disableMedia: true,
    }) as any;
    expect(out.colors).toEqual({ primary: '#0052cd', secondary: '#222222' });
    expect(out.customTypingIndicator).toEqual({ enabled: true, styles: { color: 'red' }, text: 'Typing' });
    expect(out.disableMedia).toBe(true);
    expect(out.appId).toBe('a1');
    expect(out.eventHandlers.onError).toBe(fn);
    expect(out.eventHandlers).toBe(base.eventHandlers);
    expect(base.colors.primary).toBe('#111111');
  });

  it('returns the same object for an empty or missing record', () => {
    const base = { appId: 'a1' };
    expect(applyRemoteConfigRecord(base, null)).toBe(base);
    expect(applyRemoteConfigRecord(base, {})).toBe(base);
    expect(applyRemoteConfigRecord(undefined, { disableMedia: true })).toEqual({ disableMedia: true });
  });

  it('builds missing parents and never touches Object.prototype', () => {
    const out = applyRemoteConfigRecord({} as any, { 'typography.fontSize': 14 }) as any;
    expect(out.typography).toEqual({ fontSize: 14 });
    applyRemoteConfigRecord({} as any, { '__proto__.polluted': true, 'constructor.prototype.x': true } as any);
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).x).toBeUndefined();
  });
});

describe('isLiveConfigPath', () => {
  it.each([
    'colors.primary',
    'colors.anythingNew',
    'typography.fontFaces.0.src',
    'backgroundChat.image',
    'colorScheme',
    'disableMedia',
    'chatHeaderSettings.hideSearch',
    'customTypingIndicator.text',
  ])('%s is live', (path) => expect(isLiveConfigPath(path)).toBe(true));

  it.each([
    'appId',
    'baseUrl',
    'xmppSettings.host',
    'userLogin.user.xmppUsername',
    'customLogin.enabled',
    'initBeforeLoad',
    'disableLastRead',
    'e2ee.enabled',
    'receipts.mode',
    'refreshTokens.enabled',
    'chatHeaderSettings.disableCreate',
    'toString',
    '__proto__',
  ])('%s is read at start', (path) => expect(isLiveConfigPath(path)).toBe(false));

  it('every remote key is live', () => {
    for (const key of Object.keys(LIVE_CONFIG_KEYS)) expect(isLiveConfigPath(key)).toBe(true);
  });
});

describe('classifyConfigChange', () => {
  const fn = () => {};
  const base = {
    appId: 'a1',
    baseUrl: 'https://api.example.com',
    xmppSettings: { host: 'x.example.com' },
    colors: { primary: '#111111' },
    eventHandlers: { onError: fn },
  };

  it('reports a visual-only change as live', () => {
    const next = { ...base, colors: { primary: '#0052cd', secondary: '#fff' }, colorScheme: 'dark', disableMedia: true };
    expect(classifyConfigChange(base, next)).toEqual({
      live: ['colorScheme', 'colors.primary', 'colors.secondary', 'disableMedia'],
      restart: [],
    });
  });

  it('reports a connection or identity change as read at the next mount', () => {
    const next = { ...base, baseUrl: 'https://other.example.com', xmppSettings: { host: 'y.example.com' } };
    expect(classifyConfigChange(base, next)).toEqual({
      live: [],
      restart: ['baseUrl', 'xmppSettings.host'],
    });
  });

  it('splits a mixed change', () => {
    const next = { ...base, colors: { primary: '#0052cd' }, appId: 'a2' };
    expect(classifyConfigChange(base, next)).toEqual({ live: ['colors.primary'], restart: ['appId'] });
  });

  it('sees nothing in an equal config, even a rebuilt one', () => {
    expect(classifyConfigChange(base, { ...base, colors: { ...base.colors } })).toEqual({ live: [], restart: [] });
  });

  it('removing a key counts as a change of that key', () => {
    expect(classifyConfigChange(base, { ...base, colors: {} })).toEqual({ live: ['colors.primary'], restart: [] });
  });

  it('compares a function by identity', () => {
    const next = { ...base, eventHandlers: { onError: () => {} } };
    expect(classifyConfigChange(base, next)).toEqual({ live: [], restart: ['eventHandlers.onError'] });
  });

  it('does not walk into a React element', () => {
    const logo = React.createElement('b', null, 'x');
    const a = { headerLogo: logo };
    expect(() => classifyConfigChange(a, { headerLogo: React.createElement('b', null, 'x') })).not.toThrow();
    expect(flattenConfig(a).get('headerLogo')).toBe(logo);
  });

  it('copes with undefined on either side', () => {
    expect(classifyConfigChange(undefined, { colorScheme: 'dark' })).toEqual({ live: ['colorScheme'], restart: [] });
    expect(classifyConfigChange(base, undefined).restart).toContain('appId');
  });
});
