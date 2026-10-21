import { describe, expect, it } from 'vitest';
import {
  buildReportRoomPayload,
  OTHER_REPORT_CATEGORY,
  REPORT_CATEGORIES,
} from './reportRoom';

// The values POST /v1/chats/reports/:chatName accepts (Joi .valid list in
// services/api/src/controllers/chat.controller/chat.report.js). Anything else
// is a 422, so every category the modal offers must map into this list.
const SERVER_CATEGORIES = [
  'spam',
  'violance',
  'pornography',
  'personal details',
  'illegal drugs',
  'other',
];

const ROOM = 'app1_9b2f6c1e@conference.xmpp.chat.ethora.com';

describe('buildReportRoomPayload', () => {
  it.each(
    [...REPORT_CATEGORIES, OTHER_REPORT_CATEGORY].map((c) => [c.id] as const)
  )(
    '%s maps onto a category the server accepts, with a non-empty text',
    (id) => {
      const payload = buildReportRoomPayload(ROOM, id);
      expect(payload).not.toBeNull();
      expect(SERVER_CATEGORIES).toContain(payload!.category);
      expect(payload!.text?.trim()).toBeTruthy();
    }
  );

  it('sends the bare room name, not the full JID', () => {
    expect(buildReportRoomPayload(ROOM, 'spam')?.chatName).toBe(
      'app1_9b2f6c1e'
    );
    expect(buildReportRoomPayload('app1_9b2f6c1e', 'spam')?.chatName).toBe(
      'app1_9b2f6c1e'
    );
  });

  it("uses the server's spelling for violence", () => {
    expect(buildReportRoomPayload(ROOM, 'violence')).toEqual({
      chatName: 'app1_9b2f6c1e',
      category: 'violance',
      text: 'Violence',
    });
  });

  it('sends a category the server does not know as "other", named in the text', () => {
    expect(buildReportRoomPayload(ROOM, 'childAbuse')).toEqual({
      chatName: 'app1_9b2f6c1e',
      category: 'other',
      text: 'Child Abuse',
    });
    expect(buildReportRoomPayload(ROOM, 'childAbuse', '  details ')?.text).toBe(
      'Child Abuse: details'
    );
  });

  it('keeps the typed details for "Other" and falls back to its name', () => {
    expect(buildReportRoomPayload(ROOM, 'other', ' rude bot ')?.text).toBe(
      'rude bot'
    );
    expect(buildReportRoomPayload(ROOM, 'other', '   ')?.text).toBe('Other');
  });

  it('refuses an unknown category or an empty room', () => {
    expect(buildReportRoomPayload(ROOM, 'Spam')).toBeNull();
    expect(buildReportRoomPayload('', 'spam')).toBeNull();
  });
});
