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
 * The attachment upload - a POST to /api/attachment/upload, with progress callbacks.
 * The same axios onUploadProgress pattern as uploadImage. A failure is turned into **a friendly Error**
 * (the old fetch implementation blew up with a SyntaxError calling res.json() on a 413 HTML response).
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
    // The app's JSON errors carry a message (a 400 MIME error is in Korean). nginx's 413 is HTML and has none.
    const dataMsg =
      e.response && typeof e.response.data === "object" && e.response.data !== null
        ? (e.response.data as { message?: string }).message
        : undefined;
    if (status === 413) throw new Error("파일이 너무 큽니다. (업로드 용량 제한 초과)");
    if (dataMsg) throw new Error(dataMsg);
    throw new Error("업로드에 실패했습니다.");
  }
};
