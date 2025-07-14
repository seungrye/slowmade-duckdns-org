import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import './image-with-placeholder.component.scss';

export const ImageWithPlaceholderComponent: React.FC<NodeViewProps> = ({ node, selected }) => {
  const { src, alt, title } = node.attrs;
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // 브라우저에 이미지가 캐시되어 바로 로드될 수 있는 경우를 확인합니다.
    if (imgRef.current?.complete) {
      setIsLoaded(true);
      return;
    }

    const handleLoad = () => {
      setIsLoaded(true);
    };

    const imgElement = imgRef.current;
    imgElement?.addEventListener('load', handleLoad);

    // 컴포넌트가 언마운트될 때 이벤트 리스너를 정리합니다.
    return () => {
      imgElement?.removeEventListener('load', handleLoad);
    };
  }, []);

  return (
    <NodeViewWrapper className={`image-view-wrapper ${selected ? 'ProseMirror-selectednode' : ''}`}>
      <div className={`image-placeholder-container ${isLoaded ? 'loaded' : ''}`}>
        <img ref={imgRef} src={src} alt={alt} title={title} className={`image-content ${isLoaded ? 'visible' : ''}`} />
      </div>
    </NodeViewWrapper>
  );
};