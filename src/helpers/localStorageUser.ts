import { User } from "../types/types";
import { localStorageConstants } from "./constants/LOCAL_STORAGE";

export const getLocalStorageUser = () => {
  const user: User = JSON.parse(
    localStorage.getItem(localStorageConstants.ETHORA_USER)
  );
  return user;
};
