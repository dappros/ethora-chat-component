import type { PostReportRoom } from '../types/models/room.model';

// Report categories as the reader sees them (`labelKey`) and as the backend
// accepts them (`apiCategory`). POST /v1/chats/reports/:chatName validates
// `category` against a fixed lowercase list ("spam", "violance" [sic, that is
// the server's spelling], "pornography", "personal details", "illegal drugs",
// "other") and requires a non-empty `text`, so the UI ids must never go on
// the wire as they are. A category the server has no value for is sent as
// "other" with its English name at the start of the text, so a moderator
// reading the report e-mail still sees what was picked.
export interface ReportCategory {
  id: string;
  labelKey: string;
  apiCategory: string;
  /** English name, used in `text` (the report e-mail is not localized). */
  name: string;
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: 'spam',
    labelKey: 'report.category.spam',
    apiCategory: 'spam',
    name: 'Spam',
  },
  {
    id: 'violence',
    labelKey: 'report.category.violence',
    apiCategory: 'violance',
    name: 'Violence',
  },
  {
    id: 'childAbuse',
    labelKey: 'report.category.childAbuse',
    apiCategory: 'other',
    name: 'Child Abuse',
  },
  {
    id: 'pornography',
    labelKey: 'report.category.pornography',
    apiCategory: 'pornography',
    name: 'Pornography',
  },
  {
    id: 'personalDetails',
    labelKey: 'report.category.personalDetails',
    apiCategory: 'personal details',
    name: 'Personal Details',
  },
  {
    id: 'illegalDrugs',
    labelKey: 'report.category.illegalDrugs',
    apiCategory: 'illegal drugs',
    name: 'Illegal Drugs',
  },
];

export const OTHER_REPORT_CATEGORY: ReportCategory = {
  id: 'other',
  labelKey: 'report.category.other',
  apiCategory: 'other',
  name: 'Other',
};

export const findReportCategory = (id: string): ReportCategory | undefined =>
  [...REPORT_CATEGORIES, OTHER_REPORT_CATEGORY].find((c) => c.id === id);

/**
 * The request body for a room report. `roomJid` may be the full room JID or
 * the bare room name: the route takes the bare name (JID localpart), like
 * every other /v1/chats/... route. Returns null for an unknown category or
 * an empty room.
 */
export const buildReportRoomPayload = (
  roomJid: string,
  categoryId: string,
  details?: string
): PostReportRoom | null => {
  const chatName = String(roomJid || '')
    .trim()
    .split('@')[0];
  const category = findReportCategory(categoryId);
  if (!chatName || !category) return null;

  const note = String(details || '').trim();
  const prefix =
    category.apiCategory === 'other' && category !== OTHER_REPORT_CATEGORY
      ? category.name
      : '';
  const text = [prefix, note].filter(Boolean).join(': ') || category.name;

  return { chatName, category: category.apiCategory, text };
};
