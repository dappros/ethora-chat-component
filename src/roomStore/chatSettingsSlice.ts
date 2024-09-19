import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { IConfig, User } from "../types/types";

interface ChatState {
  user: User;
  defaultChatRooms: any[];
  config?: IConfig;
}

const unpackAndTransform = (input: any): User => {
  return {
    description: "",
    token: input?.token || "",
    profileImage: input?.user?.profileImage || "",
    _id: input?.user?._id || "",
    walletAddress: input?.user?.defaultWallet?.walletAddress || "",
    xmppPassword: input?.user?.xmppPassword || "",
    refreshToken: input?.refreshToken || "",
    firstName: input?.user?.firstName || "",
    lastName: input?.user?.lastName || "",
  };
};

const initialState: ChatState = {
  user: {
    description: "",
    token: "",
    profileImage: "",
    _id: "",
    walletAddress: "",
    xmppPassword: "",
    refreshToken: "",
    firstName: "",
    lastName: "",
  },
  defaultChatRooms: [],
  config: undefined,
};

export const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<any>) => {
      state.user = unpackAndTransform(action.payload);
      console.log(state.user);
    },
    setDefaultChatRooms: (state, action: PayloadAction<any[]>) => {
      state.defaultChatRooms = action.payload;
    },
    setConfig: (state, action: PayloadAction<IConfig | undefined>) => {
      state.config = action.payload;
    },
  },
});

export const { setUser, setDefaultChatRooms, setConfig } = chatSlice.actions;

export default chatSlice.reducer;
