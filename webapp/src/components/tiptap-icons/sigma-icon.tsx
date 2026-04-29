import * as React from "react"

export const SigmaIcon = React.memo(({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M18 7V4H6l6 8-6 8h12v-3" />
  </svg>
))

SigmaIcon.displayName = "SigmaIcon"
