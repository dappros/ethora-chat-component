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
      <div style={{ height: '100%', width: '100%' }}>
        <ReduxWrapper
          // random 5f9a4603b2b5bbfa6b228b642127c56d03b778ad594c52b755e605c977303979@conference.xmpp.ethoradev.com
          // deppx 57834759e627abd4ee3d10b4df859d1665753c208206419e5ffaa0e384137ba3@conference.xmpp.ethoradev.com
          // test 8ef200ac9dffd7b7b6ba0ee5a9df4d8b33c38877eb771ca1f5a3e6966b9d39f0@conference.xmpp.ethoradev.com
          // three d673a602b47d524ba6a95102cc71fc3f308b31d64454498078a056cf54e5a2b4@conference.xmpp.ethoradev.com
          config={{
            // disableHeader: true,
            colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
            // disableRooms: true,
            defaultLogin: true,
            // jwtLogin: {
            //   enabled: true,
            //   token:
            //     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InR5cGUiOiJjbGllbnQiLCJ1c2VySWQiOiIwMTkzM2U3MS03MmVjLTdhZWUtODVjNS1hYWI5YzEwZTUzOWYiLCJhcHBJZCI6IjY3MDYzMzJkYjFiMWE0ZTk4NGQzYzdiYyJ9fQ.KPGe9ltYTgPZYYWYZEJNpP85QNdHAb3rlw82pIdIIeY',
            //   handleBadlogin: null,
            // },
            googleLogin: { enabled: true, firebaseConfig: config },
            // disableInteractions: true,
            chatRoomStyles: { borderRadius: '16px' },
            roomListStyles: { borderRadius: '16px' },
          }}
          MainComponentStyles={{
            width: '100%',
            height: '100%',
            borderRadius: '16px',
            border: '1px solid #E4E4E7',
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  );
}

export default App;
