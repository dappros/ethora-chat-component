import React, { FC, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatRoom from "./ChatRoom";
import xmppClient from "../../networking/xmppClient";
import { RootState } from "../../roomStore";
import { setUser } from "../../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "../styled/ChatWrapperBox";
import CustomMessage from "../Message";

interface ChatWrapperProps {}

// const defaultUser = {
//   _id: "65495bdae5b326bb1b2d33e7",
//   walletAddress: "0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3",
//   xmppPassword: "Q9MIMMhZVe",

//   firstName: "Roman",
//   lastName: "Leshchukh",
// };

const defaultUser = {
  _id: "65831a646edcd3cee0545757",
  firstName: "Raze",
  lastName: "Yuki",
  xmppPassword: "HDC7qnWI16",
  walletAddress: "0x6816810a7Fe04FC9b800f9D11564C0e4aEC25D78",
  token:
    "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODI1OTMzNCwiZXhwIjoxNzE4MjYwMjM0fQ.-eG07yKkNL6sAFw_-xwBxjios6XtWF6n1MExphyg4W4",
  refreshToken:
    "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODI1OTMzNCwiZXhwIjoxNzE4ODY0MTM0fQ.Zs7_eLdefD3i6nEO1b_XbFZA_q9SWFKDghj8HqJ2fC0",
  profileImage:
    "https://lh3.googleusercontent.com/a/ACg8ocLPzhjmRoDe9ZXawhnZN3nd0eEhrqoKwRicJyM6q2z_=s96-c",
  isProfileOpen: true,
  isAssetsOpen: true,
  referrerId: "",
  isAllowedNewAppCreate: true,
  isAgreeWithTerms: false,
  company: [],
  appId: "646cc8dc96d4a4dc8f7b2f2d",
  homeScreen: "",
};

// const defRoom = {
//   name: "Random talks 💬☕",
//   users_cnt: "732",
//   room_background: "none",
//   room_thumbnail:
//     "https://etofs.com/ipfs/QmSr19Da4u8vmeE86DaDHfRTJ8gjwN1UccXn8He8Ugc6yx",
//   jid: "5dc237d5792e95ba96240223e14ee00b13d2548c5cdfcf2e27ca67a0b11f5b9d@conference.dev.dxmpp.com",
//   id: "",
//   title: "Random talks 💬☕",
//   usersCnt: 732,
//   messages: [],
// };

const defRoom = {
  jid: "e8b1e5297ac89ceb78341dd870ab12150d9903f4e6e799a8176b13f47ff22553@conference.dev.dxmpp.com",
  name: "Yfg",
  room_background:
    "https://etofs.com/ipfs/QmVZRCSBPrKRuKtESQWAXseP6EWkqPEiUFXMZKxAPjraay",
  room_thumbnail:
    "https://files.ethoradev.com/files/88a0356591b139efad4770b4838b05de.jpg",
  users_cnt: "1",
  unreadMessages: 0,
  composing: "",
  toUpdate: false,
  description: "",
  group: "groups",
  id: "",
  title: "Yfg",
  usersCnt: 1,
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
        token:
          "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4MzU0MDEzfQ.v_EhiyzprEbNtt6m0fP2BToMjiCbZgARuvFhsNuiFqA",
        refreshToken:
          "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4OTU3OTEzfQ.Pyguj5O8UI8phkpjy56iXhQJF-iOIVpW04ujU8olUwE",
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
