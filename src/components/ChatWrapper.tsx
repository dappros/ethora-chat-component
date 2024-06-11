import React, { FC, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatRoom from "./ChatRoom";
import xmppClient from "../networking/xmppClient";
import { RootState } from "../roomStore";
import { setUser } from "../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "./styled/ChatWrapperBox";
import CustomMessage from "./CustomMessage";

interface ChatWrapperProps {}

const defaultUser = {
  _id: "65495bdae5b326bb1b2d33e7",
  walletAddress: "0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3",
  xmppPassword: "Q9MIMMhZVe",

  firstName: "Roman",
  lastName: "Leshchukh",
};

const defRoom = {
  name: "Random talks 💬☕",
  users_cnt: "732",
  room_background: "none",
  room_thumbnail:
    "https://etofs.com/ipfs/QmSr19Da4u8vmeE86DaDHfRTJ8gjwN1UccXn8He8Ugc6yx",
  jid: "5dc237d5792e95ba96240223e14ee00b13d2548c5cdfcf2e27ca67a0b11f5b9d@conference.dev.dxmpp.com",
  id: "",
  title: "Random talks 💬☕",
  usersCnt: 732,
  messages: [],
};

const ChatWrapper: FC<ChatWrapperProps> = ({}) => {
  const { user } = useSelector((state: RootState) => state.chatSettingStore);
  const client = xmppClient;
  const dispatch = useDispatch();

  useEffect(() => {
    console.log("Initting user");
    if (!user) {
      const defaultUser = {
        _id: "65495bdae5b326bb1b2d33e7",
        walletAddress: "0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3",
        xmppPassword: "Q9MIMMhZVe",

        firstName: "Roman",
        lastName: "Leshchukh",
      };
      dispatch(setUser(defaultUser));
    }
    console.log("Initting client");

    try {
      client.init(user.walletAddress, user.xmppPassword);

      console.log("Client succesfully initialized");
    } catch (error) {
      console.log(error, "Unsuccessfull init");
    }
  }, []);

  return (
    <ChatWrapperBox>
      <ChatRoom
        defaultUser={defaultUser}
        defaultRoom={defRoom}
        CustomMessageComponent={CustomMessage}
      />
    </ChatWrapperBox>
  );
};

export { ChatWrapper };
