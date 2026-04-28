'use client';

import { X } from 'lucide-react';
import { useState, KeyboardEvent, useEffect } from 'react';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ tags, onTagsChange, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizeTag = (value: string) => value.trim().replace(/^#+/, '');

  useEffect(() => {
    const loadAllTags = async () => {
      try {
        const response = await fetch('/api/tags');
        if (response.ok) {
          const { data } = await response.json();
          setAllTags(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Failed to load tag list:', error);
      }
    };

    loadAllTags();
  }, []);

  useEffect(() => {
    const query = normalizeTag(inputValue);

    if (query.length === 0) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const filteredSuggestions = allTags
      .filter((tag) => tag.toLowerCase().includes(query.toLowerCase()))
      .filter((tag) => !tags.some((selectedTag) => selectedTag.toLowerCase() === tag.toLowerCase()))
      .slice(0, 10);

    setSuggestions(filteredSuggestions);
    setActiveIndex((prevIndex) => (filteredSuggestions.length === 0 ? -1 : Math.min(prevIndex, filteredSuggestions.length - 1)));
  }, [inputValue, allTags, tags]);

  const removeTag = (indexToRemove: number) => {
    onTagsChange(tags.filter((_, index) => index !== indexToRemove));
  };

  const addTag = (tag: string) => {
    const newTag = normalizeTag(tag);
    if (!newTag) {
      return;
    }

    const alreadySelected = tags.some(
      (existingTag) => existingTag.toLowerCase() === newTag.toLowerCase()
    );

    if (!alreadySelected) {
      onTagsChange([...tags, newTag]);
    }

    setInputValue('');
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addTag(suggestions[activeIndex]);
      } else {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && inputValue === '') {
      e.preventDefault();
      removeTag(tags.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prevIndex) => (prevIndex + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prevIndex) => (prevIndex - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg has-focus:shadow-sm w-full">
        {tags.map((tag, index) => (
          <div key={index} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-sm font-medium px-2 py-1 rounded-full">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              aria-label={`Remove tag ${tag}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || '태그를 입력하세요...'}
          className="flex-grow p-1 bg-transparent focus:outline-none min-w-[120px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`px-3 py-2 cursor-pointer text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 ${index === activeIndex ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}