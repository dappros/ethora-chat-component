import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";
import { defRoom } from "./api.config";

function App() {
  console.log(defRoom);
  return (
    <div className="App">
      <ReduxWrapper
        config={{
          disableHeader: true,
          disableMedia: true,
          colors: { primary: "#5E3FDE", secondary: "#E1E4FE" },
        }}
        room={{
          jid: "5f9a4603b2b5bbfa6b228b642127c56d03b778ad594c52b755e605c977303979@conference.xmpp.ethoradev.com",
          name: "General",
          users_cnt: "1",
          unreadMessages: 0,
          composing: "",
          toUpdate: false,
          description: "",
          group: "groups",
          id: "",
          title: "tESTcHAT",
          usersCnt: 1,
          messages: [],
        }}
      />
    </div>
  );
}

export default App;
