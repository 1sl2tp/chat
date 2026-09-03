export type ViewportMode = 'idle' | 'editing';

export interface ViewportMetricInput {
  innerHeight: number;
  visualHeight: number;
  offsetTop: number;
  editing: boolean;
}

export interface ViewportMetrics {
  appHeight: number;
  keyboardHeight: number;
  offsetTop: number;
  mode: ViewportMode;
}

export function computeViewportMetrics(input: ViewportMetricInput): ViewportMetrics {
  const mode: ViewportMode = input.editing ? 'editing' : 'idle';
  if (mode === 'idle') {
    return {
      appHeight: Math.max(1, Math.round(input.innerHeight)),
      keyboardHeight: 0,
      offsetTop: 0,
      mode
    };
  }

  const appHeight = Math.max(1, Math.round(input.visualHeight));
  const offsetTop = Math.max(0, Math.round(input.offsetTop));
  const keyboardHeight = Math.max(0, Math.round(input.innerHeight - input.visualHeight - input.offsetTop));
  return { appHeight, keyboardHeight, offsetTop, mode };
}

export class ViewportController {
  #onChange = (): void => this.update();
  #onFocusChange = (): void => {
    window.requestAnimationFrame(() => this.update());
  };

  start(): void {
    window.addEventListener('resize', this.#onChange, { passive: true });
    window.addEventListener('orientationchange', this.#onChange, { passive: true });
    window.visualViewport?.addEventListener('resize', this.#onChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.#onChange, { passive: true });
    document.addEventListener('focusin', this.#onFocusChange, { passive: true });
    document.addEventListener('focusout', this.#onFocusChange, { passive: true });
    this.update();
  }

  stop(): void {
    window.removeEventListener('resize', this.#onChange);
    window.removeEventListener('orientationchange', this.#onChange);
    window.visualViewport?.removeEventListener('resize', this.#onChange);
    window.visualViewport?.removeEventListener('scroll', this.#onChange);
    document.removeEventListener('focusin', this.#onFocusChange);
    document.removeEventListener('focusout', this.#onFocusChange);
  }

  update(): void {
    const vv = window.visualViewport;
    const metrics = computeViewportMetrics({
      innerHeight: window.innerHeight,
      visualHeight: vv?.height ?? window.innerHeight,
      offsetTop: vv?.offsetTop ?? 0,
      editing: isTextEntry(document.activeElement)
    });
    const style = document.documentElement.style;
    style.setProperty('--app-height', `${metrics.appHeight}px`);
    style.setProperty('--keyboard-height', `${metrics.keyboardHeight}px`);
    style.setProperty('--viewport-offset-top', `${metrics.offsetTop}px`);
    document.documentElement.dataset.viewportMode = metrics.mode;
    document.documentElement.dataset.keyboardOpen = metrics.mode === 'editing' && metrics.keyboardHeight > 80 ? 'true' : 'false';
  }
}

function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}
