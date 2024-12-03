import { useSelector } from "react-redux";
import { RootState } from "../roomStore";

export const useChatSettingState = () => {
  const user = useSelector((state: RootState) => state.chatSettingStore.user);
  const activeFile = useSelector((state: RootState) => state.chatSettingStore.activeFile);
  const activeModal = useSelector((state: RootState) => state.chatSettingStore.activeModal);
  const client = useSelector((state: RootState) => state.chatSettingStore.client);
  const config = useSelector((state: RootState) => state.chatSettingStore.config);
  const deleteModal = useSelector((state: RootState) => state.chatSettingStore.deleteModal);
  const selectedUser = useSelector((state: RootState) => state.chatSettingStore.selectedUser);

  return {
    user,
    activeFile,
    activeModal,
    client,
    config,
    deleteModal,
    selectedUser,
  }
};
