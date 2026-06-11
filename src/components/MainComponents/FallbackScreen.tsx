import React from 'react';

interface FallbackScreenProps {
  /** A plain string is rendered as centered text; any other node as-is. */
  content: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Host-provided replacement for the built-in "cannot show chat" states
 * (no user session, lost connection, no rooms). See IConfig.fallbackScreens.
 */
const FallbackScreen: React.FC<FallbackScreenProps> = ({ content, style }) => {
  if (typeof content === 'string' || typeof content === 'number') {
    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          color: '#141414',
          fontSize: '16px',
          ...style,
        }}
      >
        {content}
      </div>
    );
  }

  return <>{content}</>;
};

export default FallbackScreen;
