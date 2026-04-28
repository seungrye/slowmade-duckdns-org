'use client';

import { useRef } from "react";

interface CommentInputProps {
  onSubmit: (content: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  inputId?: string;
}

export default function CommentInput({
  onSubmit,
  disabled = false,
  placeholder = "Write your comment here...",
  inputId = "comment",
}: CommentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleClick = async () => {
    const content = textareaRef.current?.value ?? '';
    const success = await onSubmit(content);
    if (success && textareaRef.current) {
      textareaRef.current.value = '';
    }
  };

  return (
    <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
      <label htmlFor={inputId} className="sr-only">Add a comment</label>
      <textarea
        id={inputId}
        ref={textareaRef}
        rows={4}
        className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        placeholder={placeholder}
      />
      <button
        type="submit"
        className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
        onClick={(e) => { e.preventDefault(); handleClick(); }}
        disabled={disabled}
        aria-label="Post comment"
      >
        Post comment
      </button>
    </form>
  );
}
