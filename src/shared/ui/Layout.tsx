import type { ComponentPropsWithRef, HTMLAttributes } from 'react';

import styles from './Layout.module.css';

type StackProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'fieldset';
  disabled?: boolean;
  gap?: 8 | 12 | 16 | 24;
};

export function Stack({
  as: Element = 'div',
  gap = 16,
  className = '',
  style,
  ...props
}: StackProps) {
  return (
    <Element {...props} className={`${styles.stack} ${className}`} style={{ ...style, gap }} />
  );
}

export function ActionGroup({ className = '', ...props }: ComponentPropsWithRef<'div'>) {
  return <div {...props} data-ui="actions" className={`${styles.actions} ${className}`} />;
}
