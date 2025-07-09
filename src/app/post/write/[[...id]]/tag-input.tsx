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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Debounce fetching suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (inputValue.trim().length > 0) {
        try {
          const response = await fetch(`/api/tags?q=${inputValue}`);
          if (response.ok) {
            const data = await response.json();
            // Filter out tags that are already selected
            const filteredSuggestions = data.filter((tag: string) => !tags.includes(tag));
            setSuggestions(filteredSuggestions);
          }
        } catch (error) {
          console.error('Failed to fetch tag suggestions:', error);
        }
      } else {
        setSuggestions([]);
      }
    };

    const debounceTimeout = setTimeout(fetchSuggestions, 300); // 300ms debounce

    return () => clearTimeout(debounceTimeout);
  }, [inputValue, tags]);

  const removeTag = (indexToRemove: number) => {
    onTagsChange(tags.filter((_, index) => index !== indexToRemove));
  };

  const addTag = (tag: string) => {
    const newTag = tag.trim();
    if (newTag && !tags.includes(newTag)) {
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
      <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 rounded-lg has-focus:shadow-sm w-full">
        {tags.map((tag, index) => (
          <div key={index} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded-full">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="text-blue-500 hover:text-blue-700"
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
          className="flex-grow p-1 bg-transparent focus:outline-none min-w-[120px]"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${index === activeIndex ? 'bg-gray-100' : ''}`}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}