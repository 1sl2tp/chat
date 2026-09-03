export interface ViewportMetricInput {
  innerHeight: number;
  visualHeight: number;
  offsetTop: number;
}

export interface ViewportMetrics {
  appHeight: number;
  keyboardHeight: number;
  offsetTop: number;
}

export function computeViewportMetrics(input: ViewportMetricInput): ViewportMetrics {
  const appHeight = Math.max(1, Math.round(input.visualHeight));
  const offsetTop = Math.max(0, Math.round(input.offsetTop));
  const keyboardHeight = Math.max(0, Math.round(input.innerHeight - input.visualHeight - input.offsetTop));
  return { appHeight, keyboardHeight, offsetTop };
}

export class ViewportController {
  #onChange = (): void => this.update();

  start(): void {
    window.addEventListener('resize', this.#onChange, { passive: true });
    window.addEventListener('orientationchange', this.#onChange, { passive: true });
    window.visualViewport?.addEventListener('resize', this.#onChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.#onChange, { passive: true });
    this.update();
  }

  stop(): void {
    window.removeEventListener('resize', this.#onChange);
    window.removeEventListener('orientationchange', this.#onChange);
    window.visualViewport?.removeEventListener('resize', this.#onChange);
    window.visualViewport?.removeEventListener('scroll', this.#onChange);
  }

  update(): void {
    const vv = window.visualViewport;
    const metrics = computeViewportMetrics({
      innerHeight: window.innerHeight,
      visualHeight: vv?.height ?? window.innerHeight,
      offsetTop: vv?.offsetTop ?? 0
    });
    const style = document.documentElement.style;
    style.setProperty('--app-height', `${metrics.appHeight}px`);
    style.setProperty('--keyboard-height', `${metrics.keyboardHeight}px`);
    style.setProperty('--viewport-offset-top', `${metrics.offsetTop}px`);
    document.documentElement.dataset.keyboardOpen = metrics.keyboardHeight > 80 ? 'true' : 'false';
  }
}
