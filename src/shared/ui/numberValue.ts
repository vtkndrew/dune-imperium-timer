export interface NumberRules {
  min?: number;
  max?: number;
  decimal?: boolean;
  required?: boolean;
}

export function parseNumberText(
  text: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER, decimal = false, required = false }: NumberRules,
) {
  if (text === '') {
    return { value: undefined, error: required ? 'Введите число.' : '' };
  }

  const sign = min < 0 ? '-?' : '';
  const pattern = new RegExp(`^${sign}\\d+${decimal ? '(?:[.,]\\d+)?' : ''}$`);

  if (!pattern.test(text)) {
    return {
      value: undefined,
      error: decimal
        ? 'Введите число; дробную часть отделяйте точкой или запятой.'
        : 'Введите целое число.',
    };
  }

  const value = Number(text.replace(',', '.'));

  if (
    !Number.isFinite(value) ||
    (!decimal && !Number.isSafeInteger(value)) ||
    value < min ||
    value > max
  ) {
    return { value: undefined, error: `Введите число от ${min} до ${max}.` };
  }

  return { value, error: '' };
}
