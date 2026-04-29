import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { buttonVariantClasses, buttonSizeClasses } from './button.variants'

export type { ButtonVariant, ButtonSize } from './button.variants'
export { buttonVariantClasses, buttonSizeClasses }

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariantClasses
  size?: keyof typeof buttonSizeClasses
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'font-medium transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed',
          buttonVariantClasses[variant],
          buttonSizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { Button }
