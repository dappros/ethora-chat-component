import { Element } from 'ltx';
import { IUser } from '../types/types';
import { transformArrayToObject } from './transformTranslatations';
import { Iso639_1Codes } from '../types/types';
import { ethoraLogger } from './ethoraLogger';
import { safeJsonParse } from './safeJson';

const getLocalpartFromJid = (jid?: string): string | undefined => {
  const value = String(jid || '').trim();
  if (!value) return undefined;
  return value.split('@')[0] || undefined;
};

const extractTimestamp = (str: string, stanza?: any): string | null => {
  if (!str) return;
  if (typeof str !== 'string') {
    ethoraLogger.log(str, stanza.toString());
    return undefined;
  }
  const timestamp = str.slice(-16);
  return timestamp;
};

const normalizeTranslations = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (
          item
        ): item is {
          translatedText: string;
          language: string;
          languageName: string;
        } =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as any).translatedText === 'string' &&
          typeof (item as any).language === 'string' &&
          typeof (item as any).languageName === 'string'
      )
    : [];

interface DataXml {
  id: string;
  body: string;
  roomJid: string;
  date: string;
  user: IUser;
  deleted?: boolean;
  translations?: any;
  langSource?: Iso639_1Codes;
  xmppId?: string;
  xmppFrom?: string;
  isHistory?: boolean;
  data: { [x: string]: any };
}
export const getDataFromXml = async (stanza: Element): Promise<DataXml> => {
  const fullData =
    stanza.getChild('result')?.getChild('forwarded')?.getChild('message') ||
    stanza;

  const xmppId = fullData?.attrs.id;
  const xmppFrom = String(fullData?.attrs?.from || '');
  const [roomJid = '', userWalletFromResource] = xmppFrom.split('/');
  let id =
    stanza.getChild('result')?.attrs.id ||
    extractTimestamp(stanza?.getChild('stanza-id')?.attrs?.id, stanza);

  if (!id) {
    id = xmppId || Date.now().toString();
  }

  const translationPayload = safeJsonParse<{ translates?: unknown[] }>(
    fullData?.getChild('translations')?.attrs?.value,
    {}
  );
  const body = fullData?.getChild('body')?.getText() || undefined;
  const deleted = !!fullData?.getChild('deleted');
  const translations = fullData?.getChild('translations')?.attrs?.value
      ? transformArrayToObject(
          normalizeTranslations(translationPayload.translates)
      )
    : undefined;
  const langSource = fullData?.getChild('translate')?.attrs?.source as
    | Iso639_1Codes
    | undefined;
  const numericPart = /\d{13,}/.exec(id || '')?.[0];
  const date = numericPart
    ? new Date(+numericPart.slice(0, 13)).toISOString()
    : new Date().toISOString();

  const data = fullData?.getChild('data') || stanza?.getChild('data');
  const photoURL = data?.attrs?.['photo'];
  const userWallet =
    userWalletFromResource ||
    getLocalpartFromJid(data?.attrs?.senderJID) ||
    undefined;

  const user = {
    id: userWallet,
    photoURL,
  };

  const dataAttrs = data?.attrs || {};
  const delay =
    fullData?.getChild('delay', 'urn:xmpp:delay') ||
    fullData?.getChild('x', 'jabber:x:delay');
  const isHistory = !!delay;

  return {
    data: dataAttrs,
    id,
    body,
    roomJid,
    date,
    user,
    deleted,
    translations,
    langSource,
    xmppId,
    xmppFrom,
    isHistory,
  };
};
