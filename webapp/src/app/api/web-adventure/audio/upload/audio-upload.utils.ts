// Validating a web-adventure audio (BGM/SFX) upload and building its key - pure functions.
// Separate from /api/upload (which requires an image and a thumbnail): a single audio file, returning a public URL.
// Assembling the public URL reuses /api/upload's buildPublicUrl (imported by the route).

export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg', // mp3
  'audio/ogg', 'audio/vorbis',
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mp4', 'audio/aac', 'audio/x-m4a',
  'audio/webm',
];
// Within nginx's client_max_body_size (16M).
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export type AudioValidationResult = { ok: true; file: File } | { ok: false; error: string };

export function validateAudioFormData(formData: FormData): AudioValidationResult {
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'No file uploaded' };
  }
  if (!ALLOWED_AUDIO_MIME.includes(file.type)) {
    return { ok: false, error: '허용되지 않는 오디오 형식입니다.' };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: `File too large (max ${MAX_AUDIO_BYTES / (1024 * 1024)}MB)` };
  }
  return { ok: true, file };
}

/** The MinIO object key - `web-adventure/audio/<ts>-<safe filename>`. Path separators are stripped. */
export function buildAudioKey(timestamp: number, originalName: string): string {
  const safe = originalName.replace(/[/\\]/g, '_').slice(0, 200) || 'audio';
  return `web-adventure/audio/${timestamp}-${safe}`;
}
