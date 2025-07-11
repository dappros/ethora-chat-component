import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IMessage } from '../types/types';

interface roomHeapSliceState {
  messageHeap: [string, IMessage][];
}

const initialState: roomHeapSliceState = {
  messageHeap: [],
};

export const roomHeapSlice = createSlice({
  name: 'roomHeapStore',
  initialState,
  reducers: {
    addMessageToHeap: (
      state,
      action: PayloadAction<{ jid: string; message: IMessage }>
    ) => {
      const heapMap = new Map(state.messageHeap ?? []);
      heapMap.set(action.payload.jid, action.payload.message);
      state.messageHeap = Array.from(heapMap.entries());
    },
    popMessageFromHeap: (state) => {
      const heapMap = new Map(state.messageHeap ?? []);
      const firstKey = heapMap.keys().next().value;
      if (firstKey) {
        heapMap.delete(firstKey);
        state.messageHeap = Array.from(heapMap.entries());
      }
    },
    clearHeap: (state) => {
      state.messageHeap = [];
    },
  },
});

export const { addMessageToHeap, popMessageFromHeap, clearHeap } =
  roomHeapSlice.actions;

export default roomHeapSlice.reducer;
