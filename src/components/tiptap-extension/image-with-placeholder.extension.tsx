import { Image as TiptapImage } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageWithPlaceholderComponent } from './image-with-placeholder.component';

// Tiptap의 공식 Image 확장을 확장합니다.
// 이름을 'image'로 유지함으로써, 문서에 있는 기존의 모든 이미지 노드에 대해
// 기본 렌더링을 오버라이드할 수 있습니다.
export const ImageWithPlaceholder = TiptapImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageWithPlaceholderComponent);
  },
});