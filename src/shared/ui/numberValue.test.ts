import { describe, expect, it } from 'vitest';

import { parseNumberText } from './numberValue';

describe('number text', () => {
  it('distinguishes empty, zero and incomplete input', () => {
    expect(parseNumberText('', {})).toEqual({ value: undefined, error: '' });
    expect(parseNumberText('', { required: true }).error).toBeTruthy();
    expect(parseNumberText('0', { required: true })).toEqual({ value: 0, error: '' });

    for (const text of ['-', '1,', '1.', '1e2', ' ', '12abc', 'Infinity']) {
      expect(parseNumberText(text, { min: -1440, decimal: true }).error).toBeTruthy();
    }
  });
  it('accepts signed corrections and decimal separators within the existing ranges', () => {
    expect(parseNumberText('-12', { min: -1440, max: 1440 }).value).toBe(-12);
    expect(parseNumberText('-12', { min: 0 }).error).toBeTruthy();

    for (const text of ['1.25', '1,25']) {
      expect(parseNumberText(text, { decimal: true, max: 525600 }).value).toBe(1.25);
      expect(parseNumberText(text, { decimal: false }).error).toBeTruthy();
    }

    expect(parseNumberText('1441', { min: 1, max: 1440 }).error).toBeTruthy();
    expect(parseNumberText('012', {}).value).toBe(12);
  });
});
