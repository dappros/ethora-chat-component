import { useEffect, useRef, useState } from 'react';
import type { IConfig } from '../types/types';
import type { RemoteConfigRecord } from '../helpers/liveConfig';
import {
  fetchRemoteAppearance,
  isValidRemoteAppId,
} from '../networking/api-requests/remoteAppearance.api';
import { subscribeChatComponentConfigUpdated } from '../helpers/chatComponentConfigEvents';
import { ethoraLogger } from '../helpers/ethoraLogger';

export const DEFAULT_REMOTE_APPEARANCE_WAIT_MS = 2500;

export interface RemoteAppearanceState {
  /** The record to lay over the host config; null until the first read settles. */
  record: RemoteConfigRecord | null;
  /** True while the chat should hold its first paint for the first read. */
  waiting: boolean;
}

/**
 * `config.remoteAppearance`: reads the App's chat component config from the
 * server and keeps it current. Reads once on mount (the chat waits for it, at
 * most `initialWaitMs`, so it starts once with its final look), then again
 * every time the server announces a new version with a
 * `chat-component-config-updated` event. The newest read wins, a failed read
 * keeps what is shown, and a version that is already shown is not fetched
 * again.
 *
 * Does nothing (and never waits) when the host did not opt in.
 */
export function useRemoteAppearance(config?: IConfig): RemoteAppearanceState {
  const options = config?.remoteAppearance;
  const appId = isValidRemoteAppId(options?.appId) ? options!.appId : '';
  const baseUrl = options?.baseUrl || config?.baseUrl;
  const waitMs = Math.max(0, options?.initialWaitMs ?? DEFAULT_REMOTE_APPEARANCE_WAIT_MS);

  const [record, setRecord] = useState<RemoteConfigRecord | null>(null);
  const [waiting, setWaiting] = useState<boolean>(Boolean(appId));
  const shownVersion = useRef<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    shownVersion.current = null;
    seq.current += 1;
    if (!appId) {
      setRecord(null);
      setWaiting(false);
      return;
    }
    setRecord(null);
    setWaiting(true);

    let inflight: AbortController | null = null;
    let disposed = false;
    const timeout = setTimeout(() => setWaiting(false), waitMs);

    const load = (version?: string) => {
      inflight?.abort();
      const controller = new AbortController();
      inflight = controller;
      const mine = ++seq.current;
      fetchRemoteAppearance({ baseUrl, appId, version }, controller.signal)
        .then((snap) => {
          if (disposed || mine !== seq.current) return;
          shownVersion.current = snap.version;
          setRecord(snap.record);
        })
        .catch((error) => {
          if (disposed || controller.signal.aborted) return;
          ethoraLogger.log('[RemoteAppearance] read failed, keeping the current look', error);
        })
        .finally(() => {
          if (!disposed && mine === seq.current) setWaiting(false);
        });
    };

    load();
    const unsubscribe = subscribeChatComponentConfigUpdated((event) => {
      if (event.appId !== appId) return;
      if (event.version && event.version === shownVersion.current) return;
      load(event.version);
    });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      unsubscribe();
      inflight?.abort();
    };
  }, [appId, baseUrl, waitMs]);

  return { record, waiting: Boolean(appId) && waiting };
}
