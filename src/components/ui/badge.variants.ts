export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  primary: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  success: 'bg-green-100 text-green-800 hover:bg-green-200',
  warning: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  danger: 'bg-red-100 text-red-700 hover:bg-red-200',
}
