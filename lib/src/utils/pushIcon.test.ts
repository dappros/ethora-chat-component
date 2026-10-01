import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { pickPushIcon, sanitizeIconUrl } from './notificationUtils';

// The service worker is a classic script under public/, so it cannot be
// imported. Load the REAL file into a sandbox with just enough of the worker
// globals and call its own pickIcon, instead of testing a copy of it.
const loadWorker = (search = '') => {
  const source = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8');
  const noop = () => {};
  const sandbox: Record<string, unknown> = {
    console: { log: noop, warn: noop, error: noop },
    clients: {},
    importScripts: noop,
    addEventListener: noop,
    registration: {},
    URL,
  };
  sandbox.self = {
    location: { href: `https://app.test/firebase-messaging-sw.js${search}`, origin: 'https://app.test' },
    addEventListener: noop,
    registration: {},
    clients: {},
    skipWaiting: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox as unknown as {
    pickIcon: (raw?: object, data?: object, notification?: object) => string;
  };
};

describe('service worker pickIcon', () => {
  it('uses the icon the push carries, wherever it is put', () => {
    const sw = loadWorker('?iconPath=/app-wide.png');
    expect(sw.pickIcon({}, { icon: 'https://cdn.test/a.png' }, {})).toBe('https://cdn.test/a.png');
    expect(sw.pickIcon({}, {}, { icon: 'https://cdn.test/b.png' })).toBe('https://cdn.test/b.png');
    expect(sw.pickIcon({ icon: 'https://cdn.test/c.png' }, {}, {})).toBe('https://cdn.test/c.png');
  });

  it('prefers the push icon over the app-wide one, and that over the default', () => {
    const configured = loadWorker('?iconPath=/app-wide.png');
    expect(configured.pickIcon({}, {}, {})).toBe('/app-wide.png');
    expect(loadWorker().pickIcon({}, {}, {})).toBe('https://app.test/favicon-192.png');
  });

  it('ignores an icon it cannot safely use', () => {
    const sw = loadWorker('?iconPath=/app-wide.png');
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'icon.png', '//evil.test/x.png', '   ', 42]) {
      expect(sw.pickIcon({}, { icon: bad }, {})).toBe('/app-wide.png');
    }
  });
});

describe('foreground pickPushIcon', () => {
  it('prefers icon, then image, then the favicon', () => {
    expect(pickPushIcon({ data: { icon: 'https://cdn.test/i.png' }, notification: { image: 'https://cdn.test/big.png' } } as any)).toBe('https://cdn.test/i.png');
    expect(pickPushIcon({ notification: { icon: '/n.png', image: 'https://cdn.test/big.png' } } as any)).toBe('/n.png');
    // what this always returned before: the picture stays the fallback
    expect(pickPushIcon({ notification: { image: 'https://cdn.test/big.png' } } as any)).toBe('https://cdn.test/big.png');
    expect(pickPushIcon({} as any)).toBe('/favicon.ico');
  });

  it('rejects unsafe values', () => {
    expect(sanitizeIconUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeIconUrl('//evil.test/x')).toBe('');
    expect(sanitizeIconUrl(' https://ok.test/a.png ')).toBe('https://ok.test/a.png');
    expect(sanitizeIconUrl('/local.png')).toBe('/local.png');
  });
});
