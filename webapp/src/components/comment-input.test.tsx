// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommentInput from './comment-input';

describe('CommentInput', () => {
  it('textarea와 제출 버튼을 렌더링한다', () => {
    render(<CommentInput onSubmit={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post comment/i })).toBeInTheDocument();
  });

  it('placeholder가 기본값으로 표시된다', () => {
    render(<CommentInput onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('Write your comment here...')).toBeInTheDocument();
  });

  it('placeholder prop으로 커스텀할 수 있다', () => {
    render(<CommentInput onSubmit={vi.fn()} placeholder="Write your reply here..." />);
    expect(screen.getByPlaceholderText('Write your reply here...')).toBeInTheDocument();
  });

  it('버튼 클릭 시 onSubmit을 textarea 내용과 함께 호출한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<CommentInput onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '테스트 댓글' } });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('테스트 댓글');
    });
  });

  it('onSubmit이 true를 반환하면 textarea를 비운다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<CommentInput onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '내용' } });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('onSubmit이 false를 반환하면 textarea를 비우지 않는다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<CommentInput onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '내용' } });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('내용');
    });
  });

  it('disabled=true이면 버튼이 비활성화된다', () => {
    render(<CommentInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /post comment/i })).toBeDisabled();
  });
});
