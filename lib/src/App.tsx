import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";
import { defRoom } from "./api.config";
import { config } from "./firebase-config";
import CustomMessage from "./components/ExampleComponents/CustomMessage";
import CustomMessageExample from "./components/ExampleComponents/CustomMessage";

function App() {
  return (
    <div className="App" style={{ height: "100%" }}>
      <ReduxWrapper
        config={{
          // disableHeader: true,
          disableMedia: true,
          colors: { primary: "#5E3FDE", secondary: "#E1E4FE" },
          defaultLogin: true,
          googleLogin: {
            firebaseConfig: config,
            enabled: true,
          },
        }}
        // CustomMessageComponent={CustomMessageExample}r
        // roomJID="49772cca02961a0d11a61bd4e150bdd60098102d55bacb0680598738c5869663@conference.xmpp.ethoradev.com"
        // user={{ email: "colod20205@exweme.com", password: "12345678" }}
      />
    </div>
  );
}

export default App;
