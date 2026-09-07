import { z } from 'zod';

export const SortOptionSchema = z.enum(['latest', 'popular', 'commented']);

export type SortOption = z.infer<typeof SortOptionSchema>; // => 'latest' | 'popular' | 'commented'

export const SORT_LABELS: Record<SortOption, string> = {
    latest: '최신순',
    popular: '인기순',
    commented: '댓글 많은 순',
};

// for validation (deciding whether a value from a URL parameter is valid)
export const isValidSortOption = (value: string | undefined): value is SortOption => {
    if (!value) return false;
    return ['latest', 'popular', 'commented'].includes(value);
};