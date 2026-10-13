import { MODAL_TYPES } from '../types'; // Corrected path to use re-export from types.ts

export type ModalType = (typeof MODAL_TYPES)[keyof typeof MODAL_TYPES];

export interface ModalFile {
  fileName: string;
  fileURL: string;
  mimetype: string;
  /** Optional low-resolution copy, used for viewer thumbnails. */
  previewURL?: string;
  /** Optional message timestamp (ISO) shown in the viewer header. */
  date?: string;
  /** Optional sender shown in the viewer header. */
  sender?: {
    id?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    photo?: string;
  };
  /**
   * Optional sibling files (e.g. a whole album) the viewer can page through
   * when the room's loaded messages do not already contain this file.
   * Single-file callers leave it out.
   */
  siblings?: ModalFile[];
}
