import axios from "axios";
import imageCompression from 'browser-image-compression';

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
export const onImageUploadHandler = async (
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
    url: response.data.url,
    thumbnailUrl: response.data.thumbnailUrl
  };
};
