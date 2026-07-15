import { Client, xml } from '@xmpp/client';
import { Iso639_1Codes } from '../../types/types';

export const sendTextMessageWithTranslateTag = (
  client: Client,
  stanzaMessage: {
    roomJID: string;
    firstName: string;
    lastName: string;
    photo: string;
    walletAddress: string;
    userMessage: string;
    notDisplayedValue?: string;
    isReply?: boolean;
    showInChannel?: boolean;
    mainMessage?: string;
    devServer?: string;
  },
  source: Iso639_1Codes,
  customId?: string,
  /**
   * Pre-computed translations, already JSON-stringified as
   * `{"translates":[{language, languageName, translatedText}, ...]}`.
   *
   * When present we ship them WITH the message as `<translations value='...'/>`,
   * so every recipient gets the translated copies inline and renders them with
   * the existing parser. ejabberd relays custom children untouched (same as our
   * `<data>` element), so this needs no server-side rewrite.
   *
   * When absent the message goes out with just the `<translate source>` tag,
   * which is exactly the old behaviour.
   */
  translations?: string
): boolean => {
  const id = customId || `get-translate-messsage:${Date.now().toString()}`;

  try {
    const children = [
      xml('data', {
        ...stanzaMessage,
        push: 'true',
      }),
      xml('body', {}, stanzaMessage.userMessage),
      xml('translate', { source: source }),
    ];

    if (translations) {
      children.push(xml('translations', { value: translations }));
    }

    const message = xml(
      'message',
      {
        to: stanzaMessage.roomJID,
        type: 'groupchat',
        id: id,
      },
      ...children
    );

    client.send(message);
    return true;
  } catch (error) {
    console.error('An error occurred while sending message:', error);
    return false;
  }
};
