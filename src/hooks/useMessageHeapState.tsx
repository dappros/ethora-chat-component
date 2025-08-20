import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

export const useMessageHeapState = () => {
  const queue = useSelector(
    (state: RootState) => state.roomHeapSlice.messageHeap
  );
  const idSet = new Set(queue?.map((m) => m.id) ?? []);

  return { queue, idSet };
};
