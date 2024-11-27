import { isDateAfter, isDateBefore } from './dateComparison';

export function insertMessageWithDelimiter(
  roomMessages: any[],
  message: { id: any; date: any },
  lastViewedTimestamp: { toString: () => string }
) {
  const existingMessage = roomMessages.find((msg) => msg.id === message.id);

  if (existingMessage) return;

  const newMessageDate = message.date;
  const lastMessage = roomMessages[roomMessages.length - 1];
  const firstMessage = roomMessages[0];

  if (isDateAfter(newMessageDate.toString(), lastMessage.date.toString())) {
    roomMessages.push(message);

    if (
      lastViewedTimestamp &&
      !roomMessages.some((msg) => msg.id === 'delimiter-new') &&
      isDateAfter(newMessageDate.toString(), lastViewedTimestamp.toString())
    ) {
      const delimiterIndex = roomMessages.findIndex((msg) =>
        isDateAfter(msg.date.toString(), lastViewedTimestamp.toString())
      );

      if (delimiterIndex !== -1) {
        roomMessages.splice(delimiterIndex, 0, {
          id: 'delimiter-new',
          user: {
            id: 'system',
            name: null,
            token: '',
            refreshToken: '',
          },
          date: new Date().toString(),
          body: 'New Messages',
          roomJID: '',
        });

        if (lastViewedTimestamp.toString() === '0') {
          roomMessages.splice(delimiterIndex, 1);
        }
      }
    }
  } else if (
    isDateBefore(newMessageDate.toString(), firstMessage.date.toString())
  ) {
    roomMessages.unshift(message);
  } else {
    for (let i = 0; i < roomMessages.length; i++) {
      if (
        isDateBefore(newMessageDate.toString(), roomMessages[i].date.toString())
      ) {
        roomMessages.splice(i, 0, message);
        break;
      }
    }
  }
}
