import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../types/types";

interface ChatState {
  user: User;
  defaultChatRooms: any[];
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
  },
});

export const { setUser, setDefaultChatRooms } = chatSlice.actions;

export default chatSlice.reducer;
