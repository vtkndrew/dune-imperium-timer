import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';

import styles from './Controls.module.css';

const classes = (...items: (string | undefined | false)[]) => items.filter(Boolean).join(' ');

export function Button({
  variant = 'default',
  className,
  type = 'button',
  ...props
}: ComponentPropsWithRef<'button'> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  return (
    <button
      {...props}
      type={type}
      data-variant={variant}
      className={classes(styles.button, styles[variant], className)}
    />
  );
}

const FieldContext = createContext<{ describedBy?: string; invalid?: boolean }>({});

export function Field({
  children,
  label,
  hint,
  error,
  inline = false,
  className,
  ...props
}: ComponentPropsWithRef<'label'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  inline?: boolean;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ describedBy, invalid: Boolean(error) }}>
      <label {...props} className={classes(styles.field, inline && styles.inline, className)}>
        {label && <span>{label}</span>}
        {children}
        {hint && (
          <small id={`${id}-hint`} className={styles.hint}>
            {hint}
          </small>
        )}
        {error && (
          <small id={`${id}-error`} role="alert">
            {error}
          </small>
        )}
      </label>
    </FieldContext.Provider>
  );
}

function useFieldAttributes(
  describedBy?: string,
  invalid?: ComponentPropsWithRef<'input'>['aria-invalid'],
) {
  const field = useContext(FieldContext);

  return {
    'aria-describedby': [field.describedBy, describedBy].filter(Boolean).join(' ') || undefined,
    'aria-invalid': invalid ?? (field.invalid || undefined),
  };
}

export function Input({
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: ComponentPropsWithRef<'input'>) {
  const field = useFieldAttributes(describedBy, invalid);

  return <input {...props} {...field} className={classes(styles.input, className)} />;
}

export function Select({
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: ComponentPropsWithRef<'select'>) {
  const field = useFieldAttributes(describedBy, invalid);

  return (
    <select {...props} {...field} className={classes(styles.input, styles.select, className)} />
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  return <Input {...props} type="checkbox" className={classes(styles.checkbox, className)} />;
}
