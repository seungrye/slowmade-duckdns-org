export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-300',
  secondary: 'border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:text-gray-300 disabled:border-gray-200',
  ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:text-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
}
