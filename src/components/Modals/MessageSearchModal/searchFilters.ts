export interface SearchFilters {
  /** Sender's user id (a room member's `_id`). */
  fromUserId?: string;
  /** ISO 8601 instant: start of the chosen day, in the reader's time zone. */
  since?: string;
  /** ISO 8601 instant: end of the chosen day, in the reader's time zone. */
  until?: string;
}

/** `2026-07-14` -> that day's first instant in the reader's time zone. */
export function dayStartISO(day: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0
  );
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * The day's LAST instant, not just the date. The server reads a bare date in
 * `until` as midnight at the START of that day, so passing "2026-07-14"
 * silently excluded the whole day the reader picked (measured on QA: 329
 * hits with the bare date against 340 with the end of the day).
 */
export function dayEndISO(day: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    999
  );
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** True when both days are set and the range runs backwards. */
export const isBackwardsRange = (from: string, to: string): boolean =>
  Boolean(from && to && from > to);

export interface Person {
  _id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

const displayName = (person: Person): string =>
  `${person.firstName || ''} ${person.lastName || ''}`.trim() ||
  person.name ||
  '';

/**
 * Up to `limit` people whose name contains `needle`, best matches first
 * (a name that STARTS with it ranks above one that merely contains it).
 * Rooms here have thousands of members, so this never renders them all.
 */
export function matchPeople(
  people: Iterable<Person>,
  needle: string,
  limit = 8
): { id: string; name: string }[] {
  const wanted = needle.trim().toLowerCase();
  if (!wanted) return [];

  const starts: { id: string; name: string }[] = [];
  const contains: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const person of people) {
    const id = person._id;
    const name = displayName(person);
    if (!id || !name || seen.has(id)) continue;
    const at = name.toLowerCase().indexOf(wanted);
    if (at === -1) continue;
    seen.add(id);
    (at === 0 ? starts : contains).push({ id, name });
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
