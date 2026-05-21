import * as React from "react"

export const EyeIcon = React.memo(
  ({ className, ...props }: React.SVGProps<SVGSVGElement>) => {
    return (
      <svg
        width="24"
        height="24"
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 4C7.45 4 3.57 6.82 2.05 10.8C1.98 11 1.98 11.22 2.05 11.42C3.57 15.38 7.45 18 12 18C16.55 18 20.43 15.18 21.95 11.2C22.02 11 22.02 10.78 21.95 10.58C20.43 6.62 16.55 4 12 4ZM12 16C8.87 16 6.22 14.21 5.05 11.6C6.22 9.08 8.87 7.2 12 7.2C15.13 7.2 17.78 8.99 18.95 11.6C17.78 14.12 15.13 16 12 16ZM12 9.2C10.45 9.2 9.2 10.45 9.2 12C9.2 13.55 10.45 14.8 12 14.8C13.55 14.8 14.8 13.55 14.8 12C14.8 10.45 13.55 9.2 12 9.2Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

EyeIcon.displayName = "EyeIcon"
