import React, { FC } from 'react';
import { NewMessageLabelProps } from '../../types/models/customComponents.model';

/**
 * Тестовий кастомний компонент для лейбла "New messages"
 * Демонструє можливість кастомізації відображення індикатора нових повідомлень
 */
const CustomNewMessageLabel: FC<NewMessageLabelProps> = ({ color }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        margin: '16px 0',
        padding: '8px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '20px',
          background: `linear-gradient(135deg, ${color || '#5E3FDE'} 0%, ${color || '#7C5DF8'} 100%)`,
          boxShadow: `0 2px 8px ${color ? `${color}40` : 'rgba(94, 63, 222, 0.25)'}`,
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          position: 'relative',
        }}
      >
        {/* Анімована іконка */}
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            animation: 'pulse 2s infinite',
          }}
        />
        <span>Нові повідомлення</span>
        {/* Декоративна стрілка */}
        <span
          style={{
            fontSize: '10px',
            marginLeft: '4px',
          }}
        >
          ↓
        </span>
      </div>
      
      {/* CSS для анімації */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.5;
              transform: scale(1.2);
            }
          }
        `}
      </style>
    </div>
  );
};

export default CustomNewMessageLabel;

