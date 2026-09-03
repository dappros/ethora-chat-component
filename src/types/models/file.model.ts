// File document returned by GET /v2/files (see
// ethora-backend services/api/src/models/file.ts). Fields the backend
// marks optional stay optional here too - not every uploaded file has a
// mimetype, duration, or encryption metadata.
export type ApiFile = {
  _id: string;
  userId: string;
  ownerKey?: string;
  roomName?: string;
  location: string;
  locationPreview?: string;
  originalname: string;
  filename?: string;
  mimetype?: string;
  size?: number;
  expiresAt?: number;
  isPrivate?: boolean;
  duration?: string;
  encrypted?: boolean;
  key?: string;
  iv?: string;
  createdAt?: string;
  updatedAt?: string;
};
