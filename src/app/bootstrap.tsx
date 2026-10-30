import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initPwa } from '@/features/pwa';
import { initInputBehavior } from '@/shared/lib';

import { App } from './App';
import './styles.css';

export function bootstrap() {
  initPwa();
  const cleanupInput = initInputBehavior();

  import.meta.hot?.dispose(cleanupInput);
  const root = document.getElementById('root');

  if (!root) {
    throw new Error('Missing root');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
