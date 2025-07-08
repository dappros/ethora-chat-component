import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

export const useMessageHeapState = () => {
  const heapArray = useSelector(
    (state: RootState) => state.roomHeapSlice.messageHeap
  );

  const heap = new Map(heapArray ?? []);

  return { heap };
};
