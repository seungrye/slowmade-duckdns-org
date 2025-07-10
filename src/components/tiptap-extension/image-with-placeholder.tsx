import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { Image } from '@tiptap/extension-image';
import "./image-with-placeholder.scss";

// 이미지 로딩 상태를 처리하는 React 컴포넌트
const ImageNodeView = (props: NodeViewProps) => {
  const { node } = props;
  const { src, alt, title } = node.attrs;
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // 컴포넌트가 마운트될 때 이미지가 캐시에서 로드되어 'complete' 상태일 수 있습니다.
  // 이 경우 'load' 이벤트가 발생하지 않으므로, 직접 확인해줍니다.
  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoaded(true);
    }
  }, []);

  return (
    <NodeViewWrapper className="image-container">
      {/* 이미지가 로드되지 않았을 때 플레이스홀더를 표시합니다. */}
      <div
        className="image-placeholder"
        style={{ display: isLoaded ? 'none' : 'block' }}
      />
      {/* 실제 이미지는 로드 완료 시 표시됩니다. */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        onLoad={() => setIsLoaded(true)}
        // 로드 전에는 숨기고, 로드 후에는 표시합니다.
        style={{ display: isLoaded ? 'block' : 'none' }}
      />
    </NodeViewWrapper>
  );
};

// Tiptap의 기본 Image 확장을 상속받아 NodeView만 교체합니다.
// 이름을 그대로 'image'로 유지하여 기본 이미지 노드의 렌더링 방식을 덮어씁니다.
export const ImageWithPlaceholder = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});