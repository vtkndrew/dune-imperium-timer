import type { ComponentPropsWithoutRef } from 'react';

import styles from './Icons.module.css';

type IconProps = ComponentPropsWithoutRef<'svg'>;

export function SandwormIcon({ className = '', ...props }: IconProps) {
  return (
    <svg
      {...props}
      className={`${styles.icon} ${className}`}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icon="sandworm"
    >
      <path
        d="M27 28C20 29 10 26 8 18C6 12 9 8 14 7L20 12C14 12 13 16 15 20C17 24 23 25 27 28Z"
        fill="currentColor"
      />
      <path
        d="M9 17L14 16M10 21L16 20M13 24L19 23M18 27L23 25"
        stroke="var(--surface)"
        strokeWidth="1.2"
      />
      <ellipse
        cx="17"
        cy="8"
        rx="6.5"
        ry="4.5"
        transform="rotate(32 17 8)"
        fill="var(--surface)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M13 5L16 8L16 4M20 6L18 9L22 9M18 12L17 9L14 10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrophyIcon({ className = '', ...props }: IconProps) {
  return (
    <svg
      {...props}
      className={`${styles.icon} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon="trophy"
    >
      <path d="M7 3H17V8C17 12 15 14 12 14S7 12 7 8V3ZM7 5H4V7C4 10 6 11 8 11M17 5H20V7C20 10 18 11 16 11M12 14V18M8 21V18H16V21M6 21H18" />
    </svg>
  );
}
