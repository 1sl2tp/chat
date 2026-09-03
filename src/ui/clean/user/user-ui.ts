import './user.css'

export interface CleanUserUi {
  root: HTMLElement
  chatHost: HTMLElement
  callHost: HTMLElement
  sheet: HTMLElement
  sheetBackdrop: HTMLButtonElement
  sheetClose: HTMLButtonElement
  modeLabel: HTMLElement
  authAction: HTMLButtonElement
  notificationAction: HTMLButtonElement
  settingsPanel: HTMLElement
  notificationChat: HTMLInputElement
  notificationCall: HTMLInputElement
  notificationSound: HTMLSelectElement
  notificationVibrate: HTMLInputElement
  settingsStatus: HTMLElement
  passwordForm: HTMLFormElement
  newPassword: HTMLInputElement
  confirmPassword: HTMLInputElement
  login: HTMLElement
  loginForm: HTMLFormElement
  username: HTMLInputElement
  password: HTMLInputElement
  loginSubmit: HTMLButtonElement
  loginCancel: HTMLButtonElement
  loginError: HTMLElement
  diagnostic: HTMLElement
  setSheetOpen(open: boolean): void
  setLoginOpen(open: boolean): void
}

export function createCleanUserUi(root: HTMLElement): CleanUserUi {
  root.innerHTML = `
    <main class="clean-user" data-clean-app="user">
      <section id="clean-user-chat" class="clean-user__chat"></section>
    </main>
    <div id="clean-user-sheet" class="clean-sheet" data-open="false" aria-hidden="true">
      <button id="clean-user-sheet-backdrop" class="clean-sheet__backdrop" type="button" aria-label="Đóng menu"></button>
      <aside class="clean-sheet__panel" aria-label="Tài khoản và cài đặt">
        <header class="clean-sheet__head">
          <strong class="clean-sheet__title">Tài khoản</strong>
          <button id="clean-user-sheet-close" class="clean-sheet__close" type="button" aria-label="Đóng">×</button>
        </header>
        <section class="clean-sheet__section">
          <div class="clean-sheet__row"><span>Trạng thái</span><strong id="clean-user-mode">Vãng lai</strong></div>
        </section>
        <section id="clean-user-settings" class="clean-sheet__section" hidden>
          <div class="clean-sheet__row"><span>Tin nhắn</span><input id="clean-notification-chat" type="checkbox"></div>
          <div class="clean-sheet__row"><span>Cuộc gọi</span><input id="clean-notification-call" type="checkbox"></div>
          <div class="clean-sheet__row"><span>Âm thanh</span><select id="clean-notification-sound"><option value="system">Theo hệ thống</option><option value="silent">Im lặng</option></select></div>
          <div class="clean-sheet__row"><span>Rung</span><input id="clean-notification-vibrate" type="checkbox"></div>
          <button id="clean-notification-action" class="clean-sheet__action" type="button" hidden>Bật thông báo</button>
          <form id="clean-password-form" class="clean-sheet__section">
            <input id="clean-new-password" type="password" minlength="6" autocomplete="new-password" placeholder="Mật khẩu mới">
            <input id="clean-confirm-password" type="password" minlength="6" autocomplete="new-password" placeholder="Nhập lại mật khẩu">
            <button class="clean-sheet__action" type="submit">Đổi mật khẩu</button>
          </form>
          <p id="clean-settings-status" class="clean-sheet__status" aria-live="polite"></p>
        </section>
        <button id="clean-auth-action" class="clean-sheet__action clean-sheet__action--primary" type="button">Đăng nhập</button>
      </aside>
    </div>
    <section id="clean-user-login" class="clean-login clean-auth" data-open="false" aria-hidden="true">
      <form id="clean-user-login-form" class="clean-login__card">
        <div class="clean-login__brand">💬</div>
        <h1>Đăng nhập</h1>
        <label>Tài khoản<input id="clean-user-login-name" autocomplete="username"></label>
        <label>Mật khẩu<input id="clean-user-login-password" type="password" autocomplete="current-password"></label>
        <p id="clean-user-login-error" class="clean-login__error" aria-live="polite"></p>
        <div class="clean-login__buttons">
          <button id="clean-user-login-submit" class="clean-login__submit" type="submit">Đăng nhập</button>
          <button id="clean-user-login-cancel" class="clean-login__cancel" type="button">Hủy</button>
        </div>
      </form>
    </section>
    <div id="clean-user-call"></div>
    <span id="clean-diagnostic" class="clean-diagnostic"></span>
  `

  const $ = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector)
    if (!el) throw new Error(`Missing ${selector}`)
    return el
  }
  const sheet = $('#clean-user-sheet') as HTMLElement
  const login = $('#clean-user-login') as HTMLElement

  return {
    root,
    chatHost: $('#clean-user-chat') as HTMLElement,
    callHost: $('#clean-user-call') as HTMLElement,
    sheet,
    sheetBackdrop: $('#clean-user-sheet-backdrop') as HTMLButtonElement,
    sheetClose: $('#clean-user-sheet-close') as HTMLButtonElement,
    modeLabel: $('#clean-user-mode') as HTMLElement,
    authAction: $('#clean-auth-action') as HTMLButtonElement,
    notificationAction: $('#clean-notification-action') as HTMLButtonElement,
    settingsPanel: $('#clean-user-settings') as HTMLElement,
    notificationChat: $('#clean-notification-chat') as HTMLInputElement,
    notificationCall: $('#clean-notification-call') as HTMLInputElement,
    notificationSound: $('#clean-notification-sound') as HTMLSelectElement,
    notificationVibrate: $('#clean-notification-vibrate') as HTMLInputElement,
    settingsStatus: $('#clean-settings-status') as HTMLElement,
    passwordForm: $('#clean-password-form') as HTMLFormElement,
    newPassword: $('#clean-new-password') as HTMLInputElement,
    confirmPassword: $('#clean-confirm-password') as HTMLInputElement,
    login,
    loginForm: $('#clean-user-login-form') as HTMLFormElement,
    username: $('#clean-user-login-name') as HTMLInputElement,
    password: $('#clean-user-login-password') as HTMLInputElement,
    loginSubmit: $('#clean-user-login-submit') as HTMLButtonElement,
    loginCancel: $('#clean-user-login-cancel') as HTMLButtonElement,
    loginError: $('#clean-user-login-error') as HTMLElement,
    diagnostic: $('#clean-diagnostic') as HTMLElement,
    setSheetOpen(open) {
      sheet.dataset.open = open ? 'true' : 'false'
      sheet.setAttribute('aria-hidden', open ? 'false' : 'true')
    },
    setLoginOpen(open) {
      login.dataset.open = open ? 'true' : 'false'
      login.setAttribute('aria-hidden', open ? 'false' : 'true')
    },
  }
}
