import React from 'react';
import { NoMessages } from '../../assets/icons';

const NoMessagesPlaceholder = () => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* <NoMessages /> */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 16,
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 600 }}>
            This chat is empty
          </div>
          <div style={{ fontSize: '14px', fontWeight: 400 }}>
            Be the first one to start it.
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoMessagesPlaceholder;
