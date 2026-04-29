import { z } from 'zod';

export const SortOptionSchema = z.enum(['latest', 'popular', 'commented']);

export type SortOption = z.infer<typeof SortOptionSchema>; // => 'latest' | 'popular' | 'commented'

export const SORT_LABELS: Record<SortOption, string> = {
    latest: '최신순',
    popular: '인기순',
    commented: '댓글 많은 순',
};

// 유효성 검사용 (URL 파라미터에서 넘어온 값이 유효한지 판단)
export const isValidSortOption = (value: string | undefined): value is SortOption => {
    if (!value) return false;
    return ['latest', 'popular', 'commented'].includes(value);
};