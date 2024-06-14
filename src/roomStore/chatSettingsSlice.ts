import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../types/types";

interface ChatState {
  user: User;
  defaultChatRooms: any[];
}

const initialState: ChatState = {
  user: {
    description: "",
    token:
      "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4MzU0MDEzfQ.v_EhiyzprEbNtt6m0fP2BToMjiCbZgARuvFhsNuiFqA",
    profileImage: "",
    _id: "65495bdae5b326bb1b2d33e7",
    walletAddress: "0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3",
    xmppPassword: "Q9MIMMhZVe",
    refreshToken:
      "JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY1ODMxYTY0NmVkY2QzY2VlMDU0NTc1NyIsImFwcElkIjoiNjQ2Y2M4ZGM5NmQ0YTRkYzhmN2IyZjJkIn0sImlhdCI6MTcxODM1MzExMywiZXhwIjoxNzE4OTU3OTEzfQ.Pyguj5O8UI8phkpjy56iXhQJF-iOIVpW04ujU8olUwE",

    firstName: "Roman",
    lastName: "Leshchukh",
  },
  defaultChatRooms: [],
};

export const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    setDefaultChatRooms: (state, action: PayloadAction<any[]>) => {
      state.defaultChatRooms = action.payload;
    },
  },
});

export const { setUser, setDefaultChatRooms } = chatSlice.actions;

export default chatSlice.reducer;
