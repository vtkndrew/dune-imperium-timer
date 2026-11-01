import { useCallback, useEffect, useId, useState, type ComponentPropsWithRef } from 'react';

import { Input, useFieldError } from './Controls';
import { parseNumberText, type NumberRules } from './numberValue';

type ValidityChange = (id: string, valid: boolean) => void;
type Props = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'inputMode'
> &
  NumberRules & {
    value: number | null | undefined;
    onValueChange: (value: number | undefined) => void;
    onValidityChange: ValidityChange;
    resetKey?: number;
    normalizeValue?: (value: number) => number;
  };

export function NumberInput({
  value,
  onValueChange,
  onValidityChange,
  min = 0,
  max,
  decimal = false,
  required = false,
  resetKey = 0,
  normalizeValue,
  ...props
}: Props) {
  const id = useId();
  const fieldError = useFieldError();
  const [edit, setEdit] = useState({
    text: String(value ?? ''),
    observed: value,
    resetKey,
    touched: false,
  });

  if (!Object.is(value, edit.observed) || resetKey !== edit.resetKey) {
    setEdit({ text: String(value ?? ''), observed: value, resetKey, touched: false });
  }

  const parsed = parseNumberText(edit.text, { min, max, decimal, required });
  const error = edit.touched ? parsed.error : '';

  useEffect(() => {
    fieldError?.(error);
  }, [error, fieldError]);
  useEffect(
    () => () => {
      fieldError?.('');
    },
    [fieldError],
  );
  useEffect(() => {
    onValidityChange(id, !parsed.error);
  }, [id, onValidityChange, parsed.error]);
  useEffect(
    () => () => {
      onValidityChange(id, true);
    },
    [id, onValidityChange],
  );

  return (
    <Input
      {...props}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      required={required}
      value={edit.text}
      onChange={(event) => {
        const text = event.target.value;
        const next = parseNumberText(text, { min, max, decimal, required });

        const normalized =
          next.value === undefined ? undefined : (normalizeValue?.(next.value) ?? next.value);

        setEdit({ text, observed: next.error ? value : normalized, resetKey, touched: true });

        if (!next.error) {
          onValueChange(normalized);
        }
      }}
    />
  );
}

export function useNumberInputValidation() {
  const [invalidIds, setInvalidIds] = useState<Set<string>>(() => new Set());
  const onValidityChange = useCallback<ValidityChange>((id, valid) => {
    setInvalidIds((previous) => {
      if (previous.has(id) === !valid) {
        return previous;
      }

      const next = new Set(previous);

      if (valid) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  return { invalid: invalidIds.size > 0, onValidityChange };
}
