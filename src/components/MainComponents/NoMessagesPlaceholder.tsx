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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 16,
            justifyContent: 'center',
            textAlign: 'center',
            color: '#000',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 600 }}>
            Write a question
          </div>
          <div style={{ fontSize: '14px', fontWeight: 400 }}>
            And Ai Helper will answer it for you
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoMessagesPlaceholder;
