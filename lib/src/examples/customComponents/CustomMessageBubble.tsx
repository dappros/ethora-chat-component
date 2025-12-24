import React from 'react';
import { MessageProps } from '../../types/types';

const CustomMessageBubble: React.FC<MessageProps> = ({
  message,
  isUser,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      width: '100%',
    }}
  >
    <div
      style={{
        maxWidth: '70%',
        borderRadius: 20,
        padding: '12px 16px',
        background: isUser ? '#4C1D95' : '#F3F4F6',
        color: isUser ? '#fff' : '#111827',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4,
          opacity: 0.8,
        }}
      >
        {message.user.name}
      </div>
      <div>{message.body}</div>
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          marginTop: 6,
          textAlign: 'right',
        }}
      >
        {new Date(message.date).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  </div>
);

export default CustomMessageBubble;

