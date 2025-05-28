import axios from "axios";

/**
 * Handles image upload with progress tracking and abort capability
 */
export const imageUploadHandler = async (
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post("/api/upload", formData, {
    signal: abortSignal,
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress({ progress });
      }
    },
  });

  return response.data.url;
};
