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
        d="M27 29C16 30 6 24 7 16C7 12 10 9 14 8L22 15C16 14 13 16 14 20C15 25 21 26 27 29Z"
        fill="currentColor"
      />
      <path d="M8 18L13 18M10 23L15 21M15 27L19 24" stroke="var(--surface)" strokeWidth="1.1" />
      <circle cx="18" cy="10" r="8" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="10" r="5.6" stroke="currentColor" strokeWidth="0.7" />
      <path
        d="M23.446 9.233L21.700 10.000L23.446 10.767ZM22.857 12.580L20.993 12.175L21.955 13.822ZM20.413 14.942L19.143 13.519L18.953 15.417ZM17.047 15.417L16.857 13.519L15.587 14.942ZM14.045 13.822L15.007 12.175L13.143 12.580ZM12.554 10.767L14.300 10.000L12.554 9.233ZM13.143 7.420L15.007 7.825L14.045 6.178ZM15.587 5.058L16.857 6.481L17.047 4.583ZM18.953 4.583L19.143 6.481L20.413 5.058ZM21.955 6.178L20.993 7.825L22.857 7.420Z"
        fill="currentColor"
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
