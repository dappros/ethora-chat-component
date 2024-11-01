import React from 'react';
import './App.css';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { config } from './firebase-config';

function App() {
  return (
    <div className="App" style={{ height: '100%' }}>
      <ReduxWrapper
        roomJID="8ef200ac9dffd7b7b6ba0ee5a9df4d8b33c38877eb771ca1f5a3e6966b9d39f0@conference.xmpp.ethoradev.com"
        config={{
          // disableHeader: true,
          // disableMedia: true,
          // disableRooms: true,
          colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
          defaultLogin: true,
          googleLogin: {
            firebaseConfig: config,
            enabled: false,
          },
        }}
      />
    </div>
  );
}

export default App;
