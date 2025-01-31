import { Element } from 'ltx';
import { IUser } from '../types/types';
import { transformArrayToObject } from './transformTranslatations';

const extractTimestamp = (str: string, stanza?: any): string | null => {
  typeof str !== 'string' && console.log(str, stanza.toString());
  const timestamp = str.slice(-13);
  return timestamp;
};

interface DataXml {
  id: string;
  body: string;
  roomJid: string;
  date: string;
  user: IUser;
  deleted?: boolean;
  translations?: any;
  langSource?: string;
  data: { [x: string]: any };
}
export const getDataFromXml = async (stanza: Element): Promise<DataXml> => {
  const fullData =
    stanza.getChild('result')?.getChild('forwarded')?.getChild('message') ||
    stanza;

  const data = fullData?.getChild('data') || stanza?.getChild('data');
  const id =
    stanza.getChild('result')?.attrs.id ||
    extractTimestamp(stanza.attrs.id, stanza);

  const body = fullData?.getChild('body')?.getText() || undefined;
  const deleted = !!fullData?.getChild('deleted');
  const translations = fullData?.getChild('translations')?.attrs?.value
    ? transformArrayToObject(
        JSON.parse(fullData.getChild('translations').attrs.value).translates
      )
    : undefined;
  const langSource = fullData?.getChild('translate')?.attrs?.source;
  const roomJid = data?.attrs?.['roomJID'];
  const senderFirstName =
    data?.attrs?.['firstName'] || data?.attrs?.senderFirstName;
  const senderLastName =
    data?.attrs?.['lastName'] || data?.attrs?.senderLastName;
  const photoURL = data?.attrs?.['photo'];
  const senderWalletAddress =
    data?.attrs?.['walletAddress'] || data?.attrs?.senderWalletAddress;
  const date = new Date(+id?.slice(0, 13)).toISOString();
  const user = {
    id: senderWalletAddress,
    name: `${senderFirstName} ${senderLastName}`,
    profileImage: photoURL,
  };

  if (id === 7916022727914) {
    console.log({
      data: { ...data?.attrs },
      id,
      body,
      roomJid,
      date,
      user,
      deleted,
      translations,
      langSource,
    });
    console.log(stanza.toString());
  }

  return {
    data: { ...data?.attrs },
    id,
    body,
    roomJid,
    date,
    user,
    deleted,
    translations,
    langSource,
  };
};
