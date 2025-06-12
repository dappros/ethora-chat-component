import { MODAL_TYPES } from '../types'; // Corrected path to use re-export from types.ts

export type ModalType = (typeof MODAL_TYPES)[keyof typeof MODAL_TYPES];

export interface ModalFile {
  fileName: string;
  fileURL: string;
  mimetype: string;
}
