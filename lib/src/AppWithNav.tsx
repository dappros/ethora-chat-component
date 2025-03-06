import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';

const Apps = () => <div>Apps</div>;
const Chat = () => (
  <div>
    <ReduxWrapper
      // roomJID="0x6816810a7_fe04_f_c9b800f9_d11564_c0e4a_e_c25_d78.0x912_b587_d8c931256_d35898829690_d1_d956bf_f8c9@conference.xmpp.ethoradev.com"
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
        userLogin: { enabled: true, user: null },
        // disableInteractions: true,
        chatRoomStyles: { borderRadius: '16px' },
        roomListStyles: { borderRadius: '16px' },
        refreshTokens: { enabled: true },
        // defaultRooms: [
        //   {
        //     jid: '5f9a4603b2b5bbfa6b228b642127c56d03b778ad594c52b755e605c977303979@conference.xmpp.ethoradev.com',
        //     pinned: true,
        //     _id: '6672807fef55364c13703235',
        //   },
        //   {
        //     jid: '6c00199ef7fb86d09b10f70c353411c70fe7f75847cacdb322c813416bcc33ab@conference.xmpp.ethoradev.com',
        //     pinned: false,
        //     _id: '6672807fef55364c13703236',
        //   },
        //   {
        //     jid: 'd673a602b47d524ba6a95102cc71fc3f308b31d64454498078a056cf54e5a2b4@conference.xmpp.ethoradev.com',
        //     pinned: false,
        //     _id: '6672807fef55364c13703237',
        //   },
        // ],
        setRoomJidInPath: true,
        // enableTranslates: true,
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
);

export default function App() {
  return (
    <Router>
      <div className="flex">
        <nav className="flex flex-col space-y-2 p-4 bg-gray-100 h-screen">
          <Link to="/apps">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Apps
            </button>
          </Link>
          <Link to="/chat">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Chat
            </button>
          </Link>
        </nav>
        <div className="flex-1 p-4">
          <Routes>
            <Route path="/apps" element={<Apps />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
