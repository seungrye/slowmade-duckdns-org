import { Node, mergeAttributes } from "@tiptap/react";
import { attachmentIconDataUri } from "@/components/rich-web-editor/attachment-icon";

// 본문 인라인 첨부 칩 — <a class="attachment-chip"> 안에 MIME SVG 배지 + 파일명.
// 클릭 시 첨부 다운로드 프록시(/api/attachment/id/{attId})로 다운로드(비공개 글은 작성자만).
// 에디터·뷰어 확장 목록 양쪽에 등록해 동일하게 렌더한다. inline atom(내용 편집 불가·통짜 선택).

export const AttachmentChip = Node.create({
  name: "attachmentChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      href: { default: null },
      name: { default: "" },
      mime: { default: "" },
      size: { default: 0 },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a.attachment-chip",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            href: e.getAttribute("href"),
            name: e.getAttribute("data-name") ?? e.textContent ?? "",
            mime: e.getAttribute("data-mime") ?? "",
            size: Number(e.getAttribute("data-size") ?? 0),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { href, name, mime, size } = node.attrs as { href: string; name: string; mime: string; size: number };
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href,
        class: "attachment-chip",
        "data-mime": mime,
        "data-name": name,
        "data-size": String(size ?? 0),
        target: "_blank",
        rel: "noopener noreferrer",
        contenteditable: "false",
      }),
      ["img", { src: attachmentIconDataUri(mime), class: "att-ico", alt: "", width: 30, height: 16 }],
      ["span", { class: "att-name" }, name || "첨부파일"],
    ];
  },
});
