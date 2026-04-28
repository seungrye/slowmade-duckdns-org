// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/font/google', () => ({
  Manrope: () => ({ className: 'manrope' }),
}));

import CommentItem from './comment-item';
import type { Comment } from '@/types/comment.d';

const baseComment: Comment = {
  _id: 'c1',
  content: '테스트 댓글',
  author: 'tester',
  authorId: { email: 'tester@test.com', name: 'tester' },
  parent: null,
  postId: 'post1',
  createdAt: new Date('2024-01-01'),
  isDeleted: false,
} as never;

const defaultProps = {
  comment: baseComment,
  isNested: false,
  session: null,
  openReplyFor: null,
  onReplyToggle: vi.fn(),
  onDelete: vi.fn(),
  onParentClick: vi.fn(),
  onRef: vi.fn(),
  onReplySubmit: vi.fn().mockResolvedValue(true),
  submitting: false,
};

describe('CommentItem', () => {
  it('댓글 내용과 작성자를 렌더링한다', () => {
    render(<CommentItem {...defaultProps} />);
    expect(screen.getByText('테스트 댓글')).toBeInTheDocument();
    expect(screen.getByText('tester')).toBeInTheDocument();
  });

  it('삭제된 댓글은 content만 이탤릭체로 표시한다', () => {
    const deletedComment = { ...baseComment, isDeleted: true, content: '삭제된 댓글입니다.' };
    render(<CommentItem {...defaultProps} comment={deletedComment as never} />);
    const el = screen.getByText('삭제된 댓글입니다.');
    expect(el).toHaveClass('italic');
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });

  it('Reply 버튼 클릭 시 onReplyToggle을 호출한다', () => {
    render(<CommentItem {...defaultProps} />);
    fireEvent.click(screen.getByText('Reply'));
    expect(defaultProps.onReplyToggle).toHaveBeenCalledWith('c1');
  });

  it('로그인 사용자가 작성자일 때 Delete 버튼을 표시한다', () => {
    const session = { user: { email: 'tester@test.com' }, expires: '' } as never;
    render(<CommentItem {...defaultProps} session={session} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('로그인 사용자가 작성자가 아닐 때 Delete 버튼을 숨긴다', () => {
    const session = { user: { email: 'other@test.com' }, expires: '' } as never;
    render(<CommentItem {...defaultProps} session={session} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('Delete 클릭 시 onDelete를 호출한다', () => {
    const session = { user: { email: 'tester@test.com' }, expires: '' } as never;
    render(<CommentItem {...defaultProps} session={session} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(defaultProps.onDelete).toHaveBeenCalledWith('c1');
  });

  it('openReplyFor가 해당 댓글 id이면 답글 폼을 표시한다', () => {
    render(<CommentItem {...defaultProps} openReplyFor="c1" />);
    expect(screen.getByPlaceholderText('Write your reply here...')).toBeInTheDocument();
  });

  it('openReplyFor가 다른 id이면 답글 폼을 숨긴다', () => {
    render(<CommentItem {...defaultProps} openReplyFor="other" />);
    expect(screen.queryByPlaceholderText('Write your reply here...')).not.toBeInTheDocument();
  });

  it('isNested가 true이면 들여쓰기 클래스를 적용한다', () => {
    const { container } = render(<CommentItem {...defaultProps} isNested />);
    expect(container.firstChild).toHaveClass('ml-6');
  });

  it('children을 렌더링한다', () => {
    render(
      <CommentItem {...defaultProps}>
        <div data-testid="child">대댓글</div>
      </CommentItem>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
