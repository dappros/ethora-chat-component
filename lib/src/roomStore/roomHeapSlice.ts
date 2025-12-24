import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IMessage } from '../types/types';

interface roomHeapSliceState {
  // FIFO queue of pending messages
  messageHeap: IMessage[];
}

const initialState: roomHeapSliceState = {
  messageHeap: [],
};

export const roomHeapSlice = createSlice({
  name: 'roomHeapStore',
  initialState,
  reducers: {
    // Enqueue a message to the end of the queue
    addMessageToHeap: (state, action: PayloadAction<IMessage>) => {
      state.messageHeap.push(action.payload);
    },
    // Remove a specific message by id (safer when sending from snapshots)
    removeMessageFromHeapById: (state, action: PayloadAction<string>) => {
      const index = state.messageHeap.findIndex((m) => m.id === action.payload);
      if (index !== -1) {
        state.messageHeap.splice(index, 1);
      }
    },
    clearHeap: (state) => {
      state.messageHeap = [];
    },
  },
});

export const { addMessageToHeap, removeMessageFromHeapById, clearHeap } =
  roomHeapSlice.actions;

export default roomHeapSlice.reducer;
