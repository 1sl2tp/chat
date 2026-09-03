export interface AuthGateCallbacks {
  onGuest: () => Promise<void>;
  onLogin: (username: string, password: string) => Promise<void>;
}

export class AuthGate {
  readonly root: HTMLElement;
  #busy = false;
  #error: HTMLElement;
  #guestButton: HTMLButtonElement;
  #form: HTMLFormElement;

  constructor(private readonly callbacks: AuthGateCallbacks) {
    this.root = document.createElement('section');
    this.root.className = 'auth-gate-screen';
    this.root.innerHTML = `
      <div class="auth-gate-card">
        <header class="auth-gate-head">
          <strong>TAPHOA Chat</strong>
          <span>Chat trực tiếp với cửa hàng</span>
        </header>
        <button class="button auth-guest" type="button" data-auth-guest>Tiếp tục vãng lai</button>
        <div class="auth-divider"><span>Đã có tài khoản</span></div>
        <form class="auth-login" data-auth-login>
          <label>Tài khoản<input name="username" autocomplete="username" inputmode="text" required /></label>
          <label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="button secondary" type="submit">Đăng nhập</button>
        </form>
        <p class="auth-error" data-auth-error hidden></p>
      </div>`;
    this.#guestButton = this.root.querySelector<HTMLButtonElement>('[data-auth-guest]')!;
    this.#form = this.root.querySelector<HTMLFormElement>('[data-auth-login]')!;
    this.#error = this.root.querySelector<HTMLElement>('[data-auth-error]')!;
    this.bind();
  }

  focus(): void {
    this.#form.querySelector<HTMLInputElement>('input[name="username"]')?.focus();
  }

  showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#error.textContent = friendlyAuthError(message);
    this.#error.hidden = false;
  }

  private bind(): void {
    this.#guestButton.addEventListener('click', () => {
      void this.run(async () => this.callbacks.onGuest());
    });
    this.#form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(this.#form);
      const username = String(data.get('username') ?? '').trim();
      const password = String(data.get('password') ?? '');
      void this.run(async () => this.callbacks.onLogin(username, password));
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#error.hidden = true;
    this.#guestButton.disabled = true;
    this.#form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((control) => { control.disabled = true; });
    try {
      await action();
    } catch (error) {
      this.showError(error);
    } finally {
      this.#busy = false;
      this.#guestButton.disabled = false;
      this.#form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((control) => { control.disabled = false; });
    }
  }
}

function friendlyAuthError(message: string): string {
  if (/invalid login|invalid credentials/i.test(message)) return 'Tài khoản hoặc mật khẩu chưa đúng.';
  if (/network|fetch/i.test(message)) return 'Không kết nối được máy chủ. Vui lòng thử lại.';
  return 'Không thể đăng nhập. Vui lòng thử lại.';
}
