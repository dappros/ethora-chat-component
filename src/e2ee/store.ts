/** Key-value storage for OMEMO keys, sessions and decrypted messages. */
export interface OmemoStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const STORE = 'kv';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * IndexedDB database per account. Private keys are stored unencrypted, like
 * in other web clients: anyone with access to this browser profile can read them.
 */
export async function openIndexedDbStore(jid: string): Promise<OmemoStore> {
  const open = indexedDB.open(`omemo:${jid}`, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await promisify(open);

  const tx = (mode: IDBTransactionMode) =>
    db.transaction(STORE, mode).objectStore(STORE);
  return {
    get: <T>(key: string) =>
      promisify(tx('readonly').get(key)) as Promise<T | undefined>,
    set: async (key, value) =>
      void (await promisify(tx('readwrite').put(value, key))),
    delete: async (key) => void (await promisify(tx('readwrite').delete(key))),
  };
}

export function createMemoryStore(): OmemoStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) =>
      structuredClone(data.get(key)) as T | undefined,
    set: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => void data.delete(key),
  };
}
