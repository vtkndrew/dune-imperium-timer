/** Pointer feedback without cancelling native scrolling, selection or keyboard activation. */
export function initInputBehavior() {
  const root = document.documentElement;

  root.dataset.input = matchMedia('(any-hover: hover)').matches ? 'mouse' : 'touch';
  let pressed: HTMLButtonElement | null = null;

  const clear = () => {
    if (pressed) {
      delete pressed.dataset.pressed;
      pressed = null;
    }
  };

  const buttonAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest('button:not(:disabled)') : null;

  const pointer = (event: PointerEvent) => {
    root.dataset.input = event.pointerType === 'mouse' ? 'mouse' : 'touch';

    if (event.type === 'pointerdown') {
      clear();
      const button = buttonAt(event.target);

      if (event.button === 0 && button instanceof HTMLButtonElement) {
        pressed = button;
        pressed.dataset.pressed = 'true';
      }
    }
  };

  const keyboard = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    root.dataset.input = 'keyboard';

    if (event.key === 'Enter' || event.key === ' ') {
      const button = buttonAt(event.target);

      if (button instanceof HTMLButtonElement) {
        pressed = button;
        pressed.dataset.pressed = 'true';
      }
    }
  };

  const changed = () => {
    if (pressed && (!pressed.isConnected || pressed.disabled)) {
      clear();
    }
  };

  const observer = new MutationObserver(changed);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };

  document.addEventListener('pointerdown', pointer, options);
  document.addEventListener('pointermove', pointer, options);
  document.addEventListener('keydown', keyboard, options);

  for (const event of [
    'pointerup',
    'pointercancel',
    'lostpointercapture',
    'keyup',
    'visibilitychange',
  ]) {
    document.addEventListener(event, clear, options);
  }

  document.addEventListener(
    'focusout',
    (event) => {
      if (event.target === pressed) {
        clear();
      }
    },
    options,
  );
  window.addEventListener('blur', clear, options);
  window.addEventListener('pagehide', clear, options);

  return () => {
    clear();
    controller.abort();
    observer.disconnect();
  };
}
