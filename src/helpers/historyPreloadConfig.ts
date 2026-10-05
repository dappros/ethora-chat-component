import type { IConfig } from '../types/types';

export type HistoryPreloadMode = 'staged' | 'all' | 'off';

export interface ResolvedHistoryPreload {
  /**
   * 'legacy' only when a host explicitly pinned
   * `historyQoS.stagedPreloadEnabled: false`: the old cache catch-up path
   * (updateMessagesTillLast). Everything else resolves to a public mode.
   */
  mode: HistoryPreloadMode | 'legacy';
  /** Rooms (by recent activity) the background sweep covers. 0 = no cap. */
  topRooms: number;
  concurrency: number;
  firstPassSize: number;
  secondPassSize: number;
}

export const DEFAULT_PRELOAD_TOP_ROOMS = 8;
export const DEFAULT_PRELOAD_CONCURRENCY = 3;
// The one-message preview pass covers this many times `topRooms` rooms that
// still have no preview (it is a tiny query next to a full page).
export const TEASER_ROOM_FACTOR = 4;

const positiveInt = (value: unknown): number | undefined => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * One place that turns `config.historyPreload` (and the older
 * `historyQoS.stagedPreload*` / `preloadTopKRooms` names, still honoured)
 * into the numbers the preload sweeps use. Staged preload is the default:
 * the sweep covers the top N rooms, every other room loads when it is opened.
 */
export const resolveHistoryPreloadConfig = (
  config?: Pick<IConfig, 'historyPreload' | 'historyQoS'> | null
): ResolvedHistoryPreload => {
  const hp = config?.historyPreload;
  const qos = config?.historyQoS;

  let mode: ResolvedHistoryPreload['mode'];
  if (hp?.mode === 'staged' || hp?.mode === 'all' || hp?.mode === 'off') {
    mode = hp.mode;
  } else if (qos?.stagedPreloadEnabled === false) {
    mode = 'legacy';
  } else {
    mode = 'staged';
  }

  const topRooms =
    mode === 'all'
      ? 0
      : (positiveInt(hp?.topRooms) ??
        positiveInt(qos?.preloadTopKRooms) ??
        DEFAULT_PRELOAD_TOP_ROOMS);

  return {
    mode,
    topRooms,
    concurrency:
      positiveInt(hp?.concurrency) ??
      positiveInt(qos?.stagedPreloadConcurrency) ??
      DEFAULT_PRELOAD_CONCURRENCY,
    firstPassSize: positiveInt(qos?.stagedPreloadFirstPassSize) ?? 1,
    secondPassSize: positiveInt(qos?.stagedPreloadSecondPassSize) ?? 15,
  };
};
