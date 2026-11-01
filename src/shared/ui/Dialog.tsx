import { useEffect, useRef, useId, type ReactNode } from 'react';

import { Button } from './Controls';
import styles from './Dialog.module.css';
import { Stack, ActionGroup } from './Layout';

export function Dialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement;

    node?.showModal();
    document.body.dataset.modal = 'true';

    return () => {
      node?.close();
      delete document.body.dataset.modal;

      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        <Button type="button" aria-label="Закрыть окно" onClick={onClose}>
          ×
        </Button>
      </header>
      <Stack className={styles.content}>
        <Stack>{children}</Stack>
        {actions && <ActionGroup>{actions}</ActionGroup>}
      </Stack>
    </dialog>
  );
}
