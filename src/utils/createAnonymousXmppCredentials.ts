import { v4 as uuidv4 } from 'uuid';

type XmppCredentials = {
  xmppUsername: string;
  xmppPassword: string;
};

export function createAnonymousXmppCredentials(): any {
  const xmppUsername = `anon-${uuidv4()}`;
  const xmppPassword = uuidv4();
  return {
    id: xmppUsername,
    name: xmppUsername,
    xmppUsername,
    xmppPassword,
  };
}
