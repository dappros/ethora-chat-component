import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

export const useMessageHeapState = () => {
  const queueRaw = useSelector(
    (state: RootState) => state.roomHeapSlice.messageHeap
  );
  const queue = Array.isArray(queueRaw) ? queueRaw : [];
  const idSet = new Set(queue.map((m) => m.id));

  return { queue, idSet };
};
