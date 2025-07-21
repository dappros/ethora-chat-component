import { v4 as uuidv4 } from 'uuid';

type XmppCredentials = {
  xmppUsername: string;
  xmppPassword: string;
};

export function createAnonymousXmppCredentials(): XmppCredentials {
  const xmppUsername = `anon-${uuidv4()}`;
  const xmppPassword = uuidv4();
  return { xmppUsername, xmppPassword };
}
