import { useRef } from 'react';

import { Button, Input } from '@/shared/ui';

export function ImportPicker({ onFile }: { onFile: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button onClick={() => input.current?.click()}>↓ Импорт JSON</Button>
      <Input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Файл партии JSON"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          event.currentTarget.value = '';
          onFile(file);
        }}
      />
    </>
  );
}
