// web-adventure 오디오(BGM/SFX) 업로드 검증·키 생성 — 순수 함수.
// /api/upload(이미지·썸네일 필수)와 분리: 단일 오디오 파일 + public URL 반환.
// public URL 조립은 /api/upload 의 buildPublicUrl 을 재사용(라우트에서 import).

export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg', // mp3
  'audio/ogg', 'audio/vorbis',
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mp4', 'audio/aac', 'audio/x-m4a',
  'audio/webm',
];
// nginx client_max_body_size(16M) 이내.
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

/** MinIO 오브젝트 키 — `web-adventure/audio/<ts>-<안전한 파일명>`. 경로 구분자는 제거. */
export function buildAudioKey(timestamp: number, originalName: string): string {
  const safe = originalName.replace(/[/\\]/g, '_').slice(0, 200) || 'audio';
  return `web-adventure/audio/${timestamp}-${safe}`;
}
