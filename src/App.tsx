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
          roomJID="6706332db1b1a4e984d3c7bc-0192f640-674a-7aa2-890d-b029b684ec54@conference.xmpp.ethoradev.com"
          config={{
            // disableHeader: true,
            // disableMedia: true,
            // disableRooms: true,
            colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
            defaultLogin: true,
            jwtLogin: {
              enabled: true,
              token:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InR5cGUiOiJjbGllbnQiLCJ1c2VySWQiOiIwMTkyZTdlYy03MGUyLTc0NGEtYTMyNS00NGIyNzQ3YTU3Y2UiLCJhcHBJZCI6IjY3MDYzMzJkYjFiMWE0ZTk4NGQzYzdiYyJ9fQ.wgrZ1vHGlUPsF-3xct8RKaB1micp0xbj0IfCT2uAoDE',
            },
          }}
        />
      </div>
    </div>
  );
}

export default App;
