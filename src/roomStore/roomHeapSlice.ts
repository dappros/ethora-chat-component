import { createSlice } from '@reduxjs/toolkit';
import { IMessage } from '../types/types';

interface roomHeapSliceState {
  messageHeap: IMessage[];
}

const initialState: roomHeapSliceState = {
  messageHeap: [],
};

export const roomHeapSlice = createSlice({
  name: 'roomHeapSlice',
  initialState,
  reducers: {
    addMessageToHeap: (state, action) => {
      state.messageHeap = [...state.messageHeap, action.payload];
    },
    popMessageFromHeap: (state) => {
      state.messageHeap = state.messageHeap.slice(1);
    },
    clearHeap: (state) => {
      state.messageHeap.length = 0;
    },
  },
});

export const { addMessageToHeap, popMessageFromHeap, clearHeap } =
  roomHeapSlice.actions;

export default roomHeapSlice.reducer;
