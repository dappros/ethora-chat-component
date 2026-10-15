// Date-based version rules. Pure functions, no I/O, so they are unit tested.
//
// A release version is the UTC date written as yy.m.d with no leading zeros,
// because npm rejects "26.10.01" as invalid semver. Use "26.10.1".
//
// The default version is the day after the current version: 26.10.1 becomes
// 26.10.2. Explicit versions are checked against npm. Future dates are allowed.

const DAY = 24 * 60 * 60 * 1000;

export function parseVersion(text) {
  const match = /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/.exec(text);
  if (!match) return { error: `"${text}" is not in yy.m.d form` };

  const parts = match.slice(1);
  if (parts.some((part) => String(Number(part)) !== part)) {
    return {
      error: `"${text}" has a leading zero, npm rejects it. Write "${parts.map(Number).join('.')}"`,
    };
  }

  const [yy, mm, dd] = parts.map(Number);
  const check = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  if (mm < 1 || mm > 12 || check.getUTCMonth() !== mm - 1 || check.getUTCDate() !== dd) {
    return { error: `"${text}" is not a real calendar date` };
  }
  return { text, triple: [yy, mm, dd] };
}

export function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear() % 100}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

export function compareTriples(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// Highest x.y.z version in a list of published versions, as [x, y, z].
// Entries that are not plain x.y.z are ignored.
export function latestOf(versions) {
  const triples = versions
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .map((v) => v.split('.').map(Number));
  if (triples.length === 0) return null;
  return triples.sort(compareTriples).at(-1);
}

// UTC midnight of a yy.m.d triple.
function tripleToMs([yy, mm, dd]) {
  return Date.UTC(2000 + yy, mm - 1, dd);
}

// The default version: the day after `base`, the current version as a triple.
// 26.10.1 is followed by 26.10.2 whatever today's date is. Only when nothing has
// been published yet is today's date used.
export function nextVersion(base, now = new Date()) {
  if (base) return formatDate(tripleToMs(base) + DAY);
  return formatDate(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Validates an explicitly requested version against what is already on npm.
export function checkExplicit(text, publishedVersions) {
  const parsed = parseVersion(text);
  if (parsed.error) return parsed;
  if (publishedVersions.includes(text)) {
    return { error: `${text} is already published` };
  }
  const latest = latestOf(publishedVersions);
  if (latest && compareTriples(parsed.triple, latest) <= 0) {
    return { error: `${text} is not newer than the latest published version ${latest.join('.')}` };
  }
  return parsed;
}
