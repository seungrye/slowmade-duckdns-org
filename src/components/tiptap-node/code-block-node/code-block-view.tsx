'use client';

import { useMemo } from 'react';
import { NodeViewContent, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { lowlight } from '@/lib/lowlight';

export function CodeBlockView({ node }: NodeViewProps) {
  const language = (node.attrs.language as string | null) || null;

  const detectedLanguage = useMemo(() => {
    if (language) return language;
    const text = node.textContent;
    if (!text.trim()) return null;
    const result = lowlight.highlightAuto(text);
    return result.data?.language ?? null;
  }, [language, node.textContent]);

  return (
    <NodeViewWrapper className="code-block-wrapper">
      {detectedLanguage && (
        <span className="code-block-language-label" contentEditable={false}>
          {detectedLanguage}
        </span>
      )}
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
