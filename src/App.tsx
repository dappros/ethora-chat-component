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
          // roomJID="6706332db1b1a4e984d3c7bc-0192e786-12a8-75ef-9a3d-91d4229531190@conference.xmpp.ethoradev.com"
          config={{
            // disableHeader: true,
            // disableMedia: true,
            // disableRooms: true,
            colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
            defaultLogin: true,
            // jwtLogin: {
            //   enabled: true,
            //   token:
            //     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InR5cGUiOiJjbGllbnQiLCJ1c2VySWQiOiIwMTkyZGFhZC1jNmIxLTdhNzEtODQ1Yy00N2ZkOWM2ZTIzNzIiLCJhcHBJZCI6IjY3MDYzMzJkYjFiMWE0ZTk4NGQzYzdiYyJ9fQ.bwa63C9kaaSE8iUsTP9MeUzQtZHCiVVKtqYrzweNOy0',
            // },
          }}
        />
      </div>
    </div>
  );
}

export default App;
