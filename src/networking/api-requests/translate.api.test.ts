import { describe, expect, it, vi, beforeEach } from 'vitest';

// The translation service lives on its own host and is called with plain
// axios (no apiClient baseURL/interceptors, no Authorization header).
vi.mock('axios', () => ({ default: { get: vi.fn() } }));

import axios from 'axios';
import {
  fetchMessageTranslations,
  resetTranslateEndpointAvailabilityForTests,
} from './translate.api';

const getMock = axios.get as ReturnType<typeof vi.fn>;

const serviceResponse = {
  data: {
    translates: [
      { language: 'en', languageName: 'English', translatedText: 'hello' },
      { language: 'pt', languageName: 'Portuguese', translatedText: 'olá' },
      { language: 'fr', languageName: 'French', translatedText: 'bonjour' },
      { language: 'zh', languageName: 'Chinese', translatedText: '你好' },
    ],
  },
};

// The pre-translate request is awaited on the SEND path (see
// sendTextMessageWithTranslateTagStanza) - every wasted round trip here is
// latency the user feels on every message they send.
describe('fetchMessageTranslations', () => {
  beforeEach(() => {
    getMock.mockReset();
    resetTranslateEndpointAvailabilityForTests();
  });

  it('calls the service as GET ?source=&text= and returns the entries', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchMessageTranslations('hola', 'es', ['en', 'pt', 'fr', 'zh']);

    const [url, config] = getMock.mock.calls[0];
    expect(url).toContain('/translate');
    expect(config.params).toEqual({ source: 'es', text: 'hola' });
    expect(result).toHaveLength(4);
  });

  it('normalizes a full source locale to its base language for the service', async () => {
    getMock.mockResolvedValue(serviceResponse);

    await fetchMessageTranslations('hola', 'es-MX', ['en']);

    expect(getMock.mock.calls[0][1].params.source).toBe('es');
  });

  it('only ships the languages the room actually needs (targets filter)', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchMessageTranslations('hola', 'es', ['pt-BR', 'FR']);

    expect(result.map((entry) => entry.language).sort()).toEqual(['fr', 'pt']);
  });

  it('sends the request with a hard timeout so a slow translator cannot stall sends', async () => {
    getMock.mockResolvedValue(serviceResponse);

    await fetchMessageTranslations('hola', 'es', ['en']);

    expect(getMock.mock.calls[0][1].timeout).toBeGreaterThan(0);
  });

  it('after a 404, never hits the endpoint again this session', async () => {
    getMock.mockRejectedValue({ response: { status: 404 } });

    expect(await fetchMessageTranslations('hola', 'es', ['en'])).toEqual([]);
    expect(await fetchMessageTranslations('otra', 'es', ['en'])).toEqual([]);
    expect(await fetchMessageTranslations('más', 'es', ['en'])).toEqual([]);

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('a transient (non-404) failure does NOT disable the endpoint - the next send retries', async () => {
    getMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(serviceResponse);

    expect(await fetchMessageTranslations('hola', 'es', ['en'])).toEqual([]);
    expect(await fetchMessageTranslations('hola', 'es', ['en'])).toHaveLength(1);

    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('skips the request entirely for empty input', async () => {
    expect(await fetchMessageTranslations('', 'es', ['en'])).toEqual([]);
    expect(await fetchMessageTranslations('hola', '', ['en'])).toEqual([]);
    expect(await fetchMessageTranslations('hola', 'es', [])).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });
});
