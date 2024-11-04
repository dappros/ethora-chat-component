import React from 'react';
import './App.css';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { config } from './firebase-config';

function App() {
  return (
    <div
      className="App"
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div style={{ height: '500px', width: '800px' }}>
        <ReduxWrapper
          // roomJID="----9a35-@conference.xmpp.ethoradev.com"
          config={{
            // disableHeader: true,
            // disableMedia: true,
            // disableRooms: true,
            colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
            defaultLogin: true,
            jwtLogin: {
              enabled: true,
              token: '..-',
            },
          }}
        />
      </div>
    </div>
  );
}

export default App;
