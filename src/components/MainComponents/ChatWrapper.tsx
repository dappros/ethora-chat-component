// import React, { FC, useEffect } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import ChatRoom from "./ChatRoom";
// import xmppClient from "../../networking/xmppClient";
// import { RootState } from "../../roomStore";
// import { setUser } from "../../roomStore/chatSettingsSlice";
// import { ChatWrapperBox } from "../styled/ChatWrapperBox";
// import CustomMessage from "../Message";
import { defRoom, defaultUser, appToken } from "../../api.config";

// interface ChatWrapperProps {}

// const ChatWrapper: FC<ChatWrapperProps> = ({}) => {
//   const { user } = useSelector((state: RootState) => state.chatSettingStore);
//   const client = xmppClient;
//   const dispatch = useDispatch();

//   useEffect(() => {
//     console.log("Initting user");
//     if (!user) {
//       const defaultUser = {
//         _id: "65495bdae5b326bb1b2d33e7",
//         walletAddress: "0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3",
//         xmppPassword: "Q9MIMMhZVe",

//         firstName: "Roman",
//         lastName: "Leshchukh",
//         token:
//           "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4MzU0MDEzfQ.v_EhiyzprEbNtt6m0fP2BToMjiCbZgARuvFhsNuiFqA",
//         refreshToken:
//           "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4OTU3OTEzfQ.Pyguj5O8UI8phkpjy56iXhQJF-iOIVpW04ujU8olUwE",
//       };
//       dispatch(setUser(defaultUser));
//     }
//     console.log("Initting client");

//     try {
//       client.init(user.walletAddress, user.xmppPassword);

//       console.log("Client succesfully initialized");
//     } catch (error) {
//       console.log(error, "Unsuccessfull init");
//     }
//   }, []);

//   return (
//     <ChatWrapperBox>
//       <ChatRoom
//         defaultUser={defaultUser}
//         defaultRoom={defRoom}
//         CustomMessageComponent={CustomMessage}
//       />
//     </ChatWrapperBox>
//   );
// };

// export { ChatWrapper };

import React, { FC, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatRoom from "./ChatRoom";
import xmppClient from "../../networking/xmppClient";
import { RootState } from "../../roomStore";
import { setUser } from "../../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "../styled/ChatWrapperBox";
import CustomMessage from "../Message";
import { loginEmail } from "../../networking/apiClient";

interface ChatWrapperProps {}

const ChatWrapper: FC<ChatWrapperProps> = ({}) => {
  const { user } = useSelector((state: RootState) => state.chatSettingStore);
  const client = xmppClient;
  const dispatch = useDispatch();

  const loginUserFunction = async () => {
    try {
      const loginData = await loginEmail(
        "yukiraze9@gmail.com",
        "Qwerty123",
        appToken
      );
      console.log(loginData.data);
      return loginData.data;
    } catch (error) {
      console.error("Login failed:", error);
      return null;
    }
  };

  useEffect(() => {
    const initUserAndClient = async () => {
      console.log("Initting user");
      const loginData = await loginUserFunction();

      if (loginData) {
        console.log(loginData);
        dispatch(setUser(loginData));
        console.log("Initting client");

        try {
          if (user?.defaultWallet?.walletAddress) {
            console.log(user?.defaultWallet?.walletAddress, user.xmppPassword);

            client.init(user?.defaultWallet?.walletAddress, user.xmppPassword);
            console.log("Client successfully initialized");
          }
        } catch (error) {
          console.log(error, "Unsuccessful init");
        }
      } else {
        console.log("Login unsuccessful");
      }
    };

    initUserAndClient();
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
