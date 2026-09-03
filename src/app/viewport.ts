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
  #debugEl: HTMLElement | null = null;

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
    this.#debugEl?.remove();
    this.#debugEl = null;
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
    this.#renderDebug(metrics);
  }

  #renderDebug(metrics: ViewportMetrics): void {
    if (new URLSearchParams(location.search).get('viewportDebug') !== '1') {
      this.#debugEl?.remove();
      this.#debugEl = null;
      return;
    }
    if (!this.#debugEl) {
      const el = document.createElement('pre');
      el.dataset.viewportDebug = 'true';
      Object.assign(el.style, {
        position: 'fixed',
        left: '6px',
        top: '6px',
        zIndex: '2147483647',
        margin: '0',
        padding: '6px 8px',
        borderRadius: '8px',
        background: 'rgba(0,0,0,.82)',
        color: '#fff',
        font: '10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap'
      });
      document.body.append(el);
      this.#debugEl = el;
    }
    const vv = window.visualViewport;
    const active = document.activeElement;
    const activeLabel = active instanceof HTMLElement
      ? `${active.tagName.toLowerCase()}${active instanceof HTMLInputElement ? `:${active.type}` : ''}`
      : 'none';
    this.#debugEl.textContent = [
      `mode=${metrics.mode} keyboard=${document.documentElement.dataset.keyboardOpen}`,
      `inner=${Math.round(window.innerHeight)} client=${Math.round(document.documentElement.clientHeight)} vv=${Math.round(vv?.height ?? 0)} top=${Math.round(vv?.offsetTop ?? 0)}`,
      `appH=${metrics.appHeight} kbH=${metrics.keyboardHeight} active=${activeLabel}`,
      rectLine('app', '#app-root'),
      rectLine('header', '.app-header'),
      rectLine('host', '.screen-host'),
      rectLine('screen', '.chat-screen'),
      rectLine('primary', '.chat-primary'),
      rectLine('list', '.message-list'),
      rectLine('composer', '.composer-owner')
    ].join('\n');
  }
}

function rectLine(label: string, selector: string): string {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return `${label}=none`;
  const rect = element.getBoundingClientRect();
  return `${label} t${Math.round(rect.top)} h${Math.round(rect.height)} b${Math.round(rect.bottom)}`;
}

function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}
