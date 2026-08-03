import axios from "axios";
import imageCompression from 'browser-image-compression';
import { type AttachmentMeta } from "./attachment-icon";

const resizeImage = async (file: File) => {
  const options = {
    maxWidthOrHeight: 512, // 가장 긴 쪽 기준
    useWebWorker: true,
    maxSizeMB: 1, // 선택: 압축 용량 제한
  };

  const blob = await imageCompression(file, options);
  return  new File([blob], file.name, { type: blob.type });
};

/**
 * Handles image upload with progress tracking and abort capability
 */
export const uploadImage = async (
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
): Promise<{ url: string; thumbnailUrl: string; }> => {
  const thumbnail = await resizeImage(file);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("thumbnail", thumbnail);

  const response = await axios.post("/api/upload", formData, {
    signal: abortSignal,
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress({ progress });
      }
    },
  });

  return {
    url: response.data.data.url,
    thumbnailUrl: response.data.data.thumbnailUrl
  };
};

/**
 * 첨부 파일 업로드 — /api/attachment/upload 로 POST, 진행률 콜백 지원.
 * uploadImage 와 같은 axios onUploadProgress 패턴. 실패는 **친절한 Error** 로 변환한다
 * (구 fetch 구현은 413 HTML 응답에 res.json() 하다 SyntaxError 로 터졌음).
 */
export const uploadAttachment = async (
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
): Promise<AttachmentMeta> => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axios.post("/api/attachment/upload", formData, {
      signal: abortSignal,
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress({ progress: Math.round((event.loaded / event.total) * 100) });
        }
      },
    });
    return response.data.data as AttachmentMeta;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: unknown } };
    const status = e.response?.status;
    // 앱 JSON 에러는 message 를 담아 보냄(400 MIME 은 한글). nginx 413 은 HTML 이라 message 없음.
    const dataMsg =
      e.response && typeof e.response.data === "object" && e.response.data !== null
        ? (e.response.data as { message?: string }).message
        : undefined;
    if (status === 413) throw new Error("파일이 너무 큽니다. (업로드 용량 제한 초과)");
    if (dataMsg) throw new Error(dataMsg);
    throw new Error("업로드에 실패했습니다.");
  }
};
