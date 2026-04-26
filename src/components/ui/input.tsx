import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full border rounded-lg px-4 py-2 text-sm bg-white transition-colors duration-200',
          'placeholder:text-gray-400',
          'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          error
            ? 'border-red-400 focus:ring-red-400'
            : 'border-gray-300',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
    )
  },
)

Input.displayName = 'Input'

export { Input }
