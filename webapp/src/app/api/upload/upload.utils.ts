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

export function validateUploadFormData(formData: FormData): ValidationResult {
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");

  if (!file || !(file instanceof File)) {
    return { ok: false, error: "No file uploaded" };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: "Invalid file type" };
  }
  if (!thumbnail || !(thumbnail instanceof File)) {
    return { ok: false, error: "No thumbnail uploaded" };
  }
  if (!ALLOWED_MIME_TYPES.includes(thumbnail.type)) {
    return { ok: false, error: "Invalid thumbnail type" };
  }

  return { ok: true, file, thumbnail };
}
