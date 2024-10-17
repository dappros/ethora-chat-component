import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";
import { defRoom } from "./api.config";
import { config } from "./firebase-config";

function App() {
  return (
    <div className="App" style={{ height: "100%" }}>
      <ReduxWrapper
        config={{
          // disableHeader: true,
          // disableMedia: true,
          colors: { primary: "#5E3FDE", secondary: "#E1E4FE" },
          defaultLogin: true,
          // googleLogin: {
          //   firebaseConfig: config,
          //   enabled: false,
          // },
        }}
        // roomJID={
        //   "ffc4cc9e79a882684cc051c9a363c0b227f5a2e07c8dfe9274cb2afa70d2130d@conference.xmpp.ethoradev.com"
        // }
      />
    </div>
  );
}

export default App;

//to="5f9a4603b2b5bbfa6b228b642127c56d03b778ad594c52b755e605c977303979@conference.xmpp.ethoradev.com/0x6816810a7_fe04_f_c9b800f9_d11564_c0e4a_e_c25_d78"
