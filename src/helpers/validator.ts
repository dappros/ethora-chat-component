import { IMessage } from '../types/types';

export const validateMessages = (messages: IMessage[]): boolean => {
  const requiredAttributes: (keyof IMessage)[] = ['id', 'user', 'date', 'body'];
  let isValid = true;
  messages.forEach((message, index) => {
    const missingAttributes = requiredAttributes.filter(
      (attr) => !(attr in message)
    );
    if (missingAttributes.length > 0) {
      console.error(
        `Message at index ${index} is missing attributes: ${missingAttributes.join(
          ', '
        )}`
      );
      isValid = false;
    }
  });
  return isValid;
};
