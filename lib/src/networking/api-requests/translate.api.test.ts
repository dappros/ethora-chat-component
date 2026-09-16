import { describe, expect, it, vi, beforeEach } from 'vitest';

// The translation service lives on its own host and is called with plain
// axios (no apiClient baseURL/interceptors, no Authorization header).
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import axios from 'axios';
import {
  fetchTranslation,
  resetTranslateEndpointAvailabilityForTests,
} from './translate.api';

const getMock = axios.get as ReturnType<typeof vi.fn>;
const postMock = axios.post as ReturnType<typeof vi.fn>;

const ENDPOINT = 'https://translate.api.chat-qa.ethora.com/translate';

const notFound = (status: number) => ({ response: { status } });

// The newer deployment's single-translation response shape (ethora-
// translate-server's `translateOne`): `{ translatedText, engine, cached }`,
// no locale field.
const singleTranslateResponse = {
  data: { translatedText: 'Bonjour tout le monde', engine: 'nllb', cached: false },
};

// Mirrors the live QA response byte for byte (verified via curl against
// https://translate.api.chat-qa.ethora.com/translate?source=fr&text=...).
const serviceResponse = {
  data: {
    translates: [
      {
        translatedText: "Undefined behavior is like a box of chocolates: you never know what you're going to get!",
        language: 'en-CA',
        languageName: 'Canadian English',
      },
      {
        translatedText: "Le comportement indéfini, c'est comme une boîte de chocolats : on ne sait jamais ce qu'on va obtenir !",
        language: 'fr-CA',
        languageName: 'Canadian French',
      },
      {
        translatedText: 'El comportamiento indefinido es como una caja de chocolates: ¡nunca sabes lo que vas a obtener!',
        language: 'es-US',
        languageName: 'Spanish',
      },
    ],
  },
};

describe('fetchTranslation', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    resetTranslateEndpointAvailabilityForTests();
  });

  it('calls the service as GET ?source=&text= against the given endpoint', async () => {
    getMock.mockResolvedValue(serviceResponse);

    await fetchTranslation('bonjour', 'fr', 'fr-CA', ENDPOINT);

    expect(getMock).toHaveBeenCalledTimes(1);
    const [url, config] = getMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(config.params).toEqual({ source: 'fr', text: 'bonjour' });
  });

  it('normalizes a full source locale to its base language for the service', async () => {
    getMock.mockResolvedValue(serviceResponse);

    await fetchTranslation('bonjour', 'fr-CA', 'en', ENDPOINT);

    expect(getMock.mock.calls[0][1].params.source).toBe('fr');
  });

  it('sends the request with a hard timeout so a slow translator cannot hang the click', async () => {
    getMock.mockResolvedValue(serviceResponse);

    await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

    expect(getMock.mock.calls[0][1].timeout).toBeGreaterThan(0);
  });

  it('resolves an exact reader-locale match first', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchTranslation('bonjour', 'fr', 'fr-CA', ENDPOINT);

    expect(result?.language).toBe('fr-CA');
  });

  it('resolves a bare base reader locale ("en") against a regional entry ("en-CA")', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

    expect(result?.language).toBe('en-CA');
    expect(result?.translatedText).toContain('Undefined behavior');
  });

  it('resolves a differently-regioned reader locale ("en-US") against "en-CA" via base language', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchTranslation('bonjour', 'fr', 'en-US', ENDPOINT);

    expect(result?.language).toBe('en-CA');
  });

  it('returns undefined when the service has nothing for that locale', async () => {
    getMock.mockResolvedValue(serviceResponse);

    const result = await fetchTranslation('bonjour', 'fr', 'de', ENDPOINT);

    expect(result).toBeUndefined();
  });

  it('returns undefined on a request failure rather than throwing', async () => {
    getMock.mockRejectedValue(new Error('network down'));

    const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

    expect(result).toBeUndefined();
  });

  it('tolerates a response with no `translates` array instead of throwing', async () => {
    getMock.mockResolvedValue({ data: { translatedText: 'hello' } });

    const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

    expect(result).toBeUndefined();
  });

  it('after a GET 404 AND a POST 404 (the endpoint has neither route), never hits it again this session', async () => {
    getMock.mockRejectedValue(notFound(404));
    postMock.mockRejectedValue(notFound(404));

    expect(await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT)).toBeUndefined();
    expect(await fetchTranslation('salut', 'fr', 'en', ENDPOINT)).toBeUndefined();
    expect(await fetchTranslation('coucou', 'fr', 'en', ENDPOINT)).toBeUndefined();

    // First call: 1 GET + 1 POST (learns both routes are missing).
    // The next two calls skip straight to the cached "endpoint is dead".
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('a transient (non-404) failure does NOT disable the endpoint - the next click retries', async () => {
    getMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(serviceResponse);

    expect(await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT)).toBeUndefined();
    expect((await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT))?.language).toBe(
      'en-CA'
    );

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('a 404+404 miss against one endpoint does not block requests to a different endpoint', async () => {
    getMock.mockRejectedValueOnce(notFound(404));
    postMock.mockRejectedValueOnce(notFound(404));
    await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

    getMock.mockResolvedValueOnce(serviceResponse);
    const other = 'https://translate.api.other.ethora.com/translate';
    const result = await fetchTranslation('bonjour', 'fr', 'en', other);

    expect(result?.language).toBe('en-CA');
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('skips the request entirely for missing input (no throw, no call)', async () => {
    expect(await fetchTranslation('', 'fr', 'en', ENDPOINT)).toBeUndefined();
    expect(await fetchTranslation('bonjour', '', 'en', ENDPOINT)).toBeUndefined();
    expect(await fetchTranslation('bonjour', 'fr', '', ENDPOINT)).toBeUndefined();
    expect(await fetchTranslation('bonjour', 'fr', 'en', undefined)).toBeUndefined();
    expect(getMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });

  describe('the POST fallback (newer deployment with no GET route)', () => {
    it('GET 404 then POST success: falls back to POST and maps its single-translation shape', async () => {
      getMock.mockRejectedValueOnce(notFound(404));
      postMock.mockResolvedValueOnce(singleTranslateResponse);

      const result = await fetchTranslation('hello everyone', 'en', 'fr-CA', ENDPOINT);

      expect(getMock).toHaveBeenCalledTimes(1);
      expect(postMock).toHaveBeenCalledTimes(1);
      const [url, body, config] = postMock.mock.calls[0];
      expect(url).toBe(ENDPOINT);
      expect(body).toEqual({
        text: 'hello everyone',
        source: 'en',
        target: 'fr',
        targetLocale: 'fr-CA',
      });
      expect(config.timeout).toBeGreaterThan(0);

      // No locale field in the response - synthesised from the reader's locale.
      expect(result).toEqual({
        translatedText: 'Bonjour tout le monde',
        language: 'fr-CA',
        languageName: 'fr-CA',
      });
    });

    it('GET 405 then POST success: 405 is also treated as "route not there"', async () => {
      getMock.mockRejectedValueOnce(notFound(405));
      postMock.mockResolvedValueOnce(singleTranslateResponse);

      const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

      expect(result?.translatedText).toBe('Bonjour tout le monde');
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    it('after learning GET is missing, later clicks go straight to POST (no repeated GET 404s)', async () => {
      getMock.mockRejectedValueOnce(notFound(404));
      postMock.mockResolvedValue(singleTranslateResponse);

      await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);
      await fetchTranslation('salut', 'fr', 'en', ENDPOINT);

      expect(getMock).toHaveBeenCalledTimes(1);
      expect(postMock).toHaveBeenCalledTimes(2);
    });

    it('a POST network/5xx failure (not 404/405) does not cache the endpoint as missing', async () => {
      getMock.mockRejectedValue(notFound(404));
      postMock
        .mockRejectedValueOnce(new Error('502'))
        .mockResolvedValueOnce(singleTranslateResponse);

      expect(await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT)).toBeUndefined();
      const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);

      expect(result?.translatedText).toBe('Bonjour tout le monde');
      // GET stayed cached-missing (2 attempts skipped it), POST retried both times.
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(postMock).toHaveBeenCalledTimes(2);
    });

    it('an empty POST translatedText resolves to undefined without caching the endpoint as missing', async () => {
      getMock.mockRejectedValue(notFound(404));
      postMock.mockResolvedValueOnce({ data: { translatedText: '' } });

      expect(await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT)).toBeUndefined();

      postMock.mockResolvedValueOnce(singleTranslateResponse);
      const result = await fetchTranslation('bonjour', 'fr', 'en', ENDPOINT);
      expect(result?.translatedText).toBe('Bonjour tout le monde');
    });
  });
});
