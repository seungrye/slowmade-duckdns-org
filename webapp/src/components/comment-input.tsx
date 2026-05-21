'use client';

import { useRef, useState, useCallback, useEffect } from "react";

interface CommentInputProps {
  onSubmit: (content: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  inputId?: string;
  mentions?: string[];
}

export default function CommentInput({
  onSubmit,
  disabled = false,
  placeholder = "Write your comment here...",
  inputId = "comment",
  mentions = [],
}: CommentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setActiveIndex(0);
    setMentionStart(null);
  }, []);

  const insertMention = useCallback((name: string) => {
    const ta = textareaRef.current;
    if (!ta || mentionStart === null) return;
    const before = ta.value.slice(0, mentionStart);
    const after = ta.value.slice(ta.selectionStart);
    ta.value = `${before}@${name} ${after}`;
    const pos = mentionStart + name.length + 2;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    closeSuggestions();
  }, [mentionStart, closeSuggestions]);

  const handleChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const text = ta.value.slice(0, cursor);
    const match = text.match(/@(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = ['enji', ...mentions.filter(m => m !== 'enji')]
        .filter(m => m.toLowerCase().startsWith(query));
      setSuggestions(filtered);
      setActiveIndex(0);
      setMentionStart(cursor - match[0].length);
    } else {
      closeSuggestions();
    }
  }, [mentions, closeSuggestions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      insertMention(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  }, [suggestions, activeIndex, insertMention, closeSuggestions]);

  useEffect(() => {
    const handleClickOutside = () => closeSuggestions();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [closeSuggestions]);

  const handleClick = async () => {
    const content = textareaRef.current?.value ?? '';
    const success = await onSubmit(content);
    if (success && textareaRef.current) {
      textareaRef.current.value = '';
      closeSuggestions();
    }
  };

  return (
    <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
      <div className="relative w-full">
        <label htmlFor={inputId} className="sr-only">Add a comment</label>
        <textarea
          id={inputId}
          ref={textareaRef}
          rows={4}
          className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleChange}
        />
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-50 bottom-full mb-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
          >
            {suggestions.map((name, i) => (
              <li
                key={name}
                role="option"
                aria-selected={i === activeIndex}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                  i === activeIndex
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(name); }}
              >
                {name === 'enji' && <span>✨</span>}
                <span>@{name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
