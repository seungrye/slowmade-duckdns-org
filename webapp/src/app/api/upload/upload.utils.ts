export function buildFileName(timestamp: number, originalName: string): string {
  return `${timestamp}-${originalName}`;
}

export function buildPublicUrl(endpoint: string, bucket: string, fileName: string): string {
  const encodedFileName = fileName.split('/').map(encodeURIComponent).join('/');
  return `https://${endpoint}/${bucket}/${encodedFileName}`;
}

export type ValidationSuccess = { ok: true; file: File; thumbnail: File };
export type ValidationFailure = { ok: false; error: string };
export type ValidationResult = ValidationSuccess | ValidationFailure;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// 업로드 크기 상한(스토리지/대역폭 DoS 방지). nginx client_max_body_size(16M) 이내.
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 원본 8MB
export const MAX_THUMB_BYTES = 4 * 1024 * 1024; // 썸네일 4MB

export function validateUploadFormData(formData: FormData): ValidationResult {
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");

  if (!file || !(file instanceof File)) {
    return { ok: false, error: "No file uploaded" };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: "Invalid file type" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB)` };
  }
  if (!thumbnail || !(thumbnail instanceof File)) {
    return { ok: false, error: "No thumbnail uploaded" };
  }
  if (!ALLOWED_MIME_TYPES.includes(thumbnail.type)) {
    return { ok: false, error: "Invalid thumbnail type" };
  }
  if (thumbnail.size > MAX_THUMB_BYTES) {
    return { ok: false, error: `Thumbnail too large (max ${MAX_THUMB_BYTES / (1024 * 1024)}MB)` };
  }

  return { ok: true, file, thumbnail };
}
