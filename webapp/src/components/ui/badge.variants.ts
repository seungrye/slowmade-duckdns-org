export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-100 dark:border dark:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-500',
  primary: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900',
  success: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900',
  warning: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900',
  danger: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900',
}
