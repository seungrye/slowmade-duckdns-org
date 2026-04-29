import { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { badgeVariantClasses } from './badge.variants'

export type { BadgeVariant } from './badge.variants'
export { badgeVariantClasses }

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariantClasses
}

function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors duration-200',
        badgeVariantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { Badge }
