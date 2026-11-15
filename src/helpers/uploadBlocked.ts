/** The secure upload refused the file as explicit content (Trust & Safety). */
export const UPLOAD_BLOCKED_SENSITIVE = 'UPLOAD_BLOCKED_SENSITIVE';

/**
 * True for the `422 { code: 'UPLOAD_BLOCKED_SENSITIVE' }` answer of
 * POST /v2/files/secure: the file is not stored and must not be sent.
 */
export const isUploadBlockedSensitive = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: any } })?.response;
  if (response?.status !== 422) return false;
  const data = response.data;
  const code = data?.code ?? data?.error?.code ?? data?.errorCode;
  return code === UPLOAD_BLOCKED_SENSITIVE;
};
