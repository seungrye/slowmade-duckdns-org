import { cn } from '@/lib/cn'
import { buttonVariantClasses, buttonSizeClasses } from '../button.variants'
import { badgeVariantClasses } from '../badge.variants'

/**
 * cn: Tailwind 클래스를 충돌 없이 병합하는 유틸리티 함수.
 * clsx로 조건부 클래스를 처리하고, tailwind-merge로 중복 클래스를 제거한다.
 */
describe('cn', () => {
  it('여러 클래스 문자열을 하나로 합친다', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('falsy 값을 무시한다', () => {
    expect(cn('px-4', false && 'py-2', null, undefined)).toBe('px-4')
  })

  it('조건부 클래스를 처리한다', () => {
    expect(cn('px-4', { 'py-2': true, 'py-4': false })).toBe('px-4 py-2')
  })

  it('같은 속성의 Tailwind 클래스 충돌 시 뒤의 클래스를 우선한다', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6')
  })

  it('다른 속성의 클래스는 모두 유지한다', () => {
    expect(cn('px-4', 'py-2', 'text-sm')).toBe('px-4 py-2 text-sm')
  })
})

/**
 * buttonVariantClasses: 버튼 variant별 클래스 정의 맵.
 * 각 variant가 필요한 색상·상태 클래스를 포함하는지 검증한다.
 */
describe('buttonVariantClasses', () => {
  it('primary variant는 파란 배경 클래스를 포함한다', () => {
    expect(buttonVariantClasses.primary).toContain('bg-blue-500')
    expect(buttonVariantClasses.primary).toContain('text-white')
  })

  it('secondary variant는 테두리와 텍스트 색상 클래스를 포함한다', () => {
    expect(buttonVariantClasses.secondary).toContain('border')
    expect(buttonVariantClasses.secondary).toContain('text-gray-600')
  })

  it('danger variant는 빨간 배경 클래스를 포함한다', () => {
    expect(buttonVariantClasses.danger).toContain('bg-red-600')
    expect(buttonVariantClasses.danger).toContain('text-white')
  })

  it('ghost variant는 배경색 없이 텍스트 색상만 가진다', () => {
    expect(buttonVariantClasses.ghost).not.toMatch(/^bg-/)
    expect(buttonVariantClasses.ghost).toContain('text-gray-500')
  })

  it('모든 variant에 disabled 클래스가 정의되어 있다', () => {
    const variants = Object.values(buttonVariantClasses)
    variants.forEach((cls) => {
      expect(cls).toContain('disabled:')
    })
  })
})

/**
 * buttonSizeClasses: 버튼 size별 패딩·텍스트 크기 클래스 정의 맵.
 */
describe('buttonSizeClasses', () => {
  it('sm은 작은 패딩을 가진다', () => {
    expect(buttonSizeClasses.sm).toContain('px-3')
    expect(buttonSizeClasses.sm).toContain('py-1.5')
  })

  it('md는 기본 패딩을 가진다', () => {
    expect(buttonSizeClasses.md).toContain('px-4')
    expect(buttonSizeClasses.md).toContain('py-2')
  })

  it('lg는 넓은 패딩을 가진다', () => {
    expect(buttonSizeClasses.lg).toContain('px-6')
    expect(buttonSizeClasses.lg).toContain('py-3')
  })
})

/**
 * badgeVariantClasses: 배지 variant별 색상 클래스 정의 맵.
 */
describe('badgeVariantClasses', () => {
  it('default variant는 회색 배경을 가진다', () => {
    expect(badgeVariantClasses.default).toContain('bg-gray-100')
    expect(badgeVariantClasses.default).toContain('text-gray-700')
  })

  it('primary variant는 파란 배경을 가진다', () => {
    expect(badgeVariantClasses.primary).toContain('bg-blue-100')
    expect(badgeVariantClasses.primary).toContain('text-blue-800')
  })

  it('success variant는 초록 배경을 가진다', () => {
    expect(badgeVariantClasses.success).toContain('bg-green-100')
  })

  it('danger variant는 빨간 배경을 가진다', () => {
    expect(badgeVariantClasses.danger).toContain('bg-red-100')
  })

  it('모든 variant에 hover 클래스가 정의되어 있다', () => {
    const variants = Object.values(badgeVariantClasses)
    variants.forEach((cls) => {
      expect(cls).toContain('hover:')
    })
  })
})
