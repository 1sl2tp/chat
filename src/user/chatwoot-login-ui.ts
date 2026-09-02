import { mountLoginScreen, type LoginScreenView } from '../ui/chatwoot-port/auth/login-screen'

export function mountUserChatwootLoginUi(doc: Document = document): () => void {
  const host = doc.querySelector<HTMLElement>('#login-panel')
  const form = doc.querySelector<HTMLFormElement>('#user-login-form')
  const login = doc.querySelector<HTMLInputElement>('#user-login')
  const password = doc.querySelector<HTMLInputElement>('#user-password')
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null
  const cancel = doc.querySelector<HTMLButtonElement>('#login-cancel')
  const error = doc.querySelector<HTMLElement>('#login-error')
  if (!host || !form || !login || !password || !submit || !error) return () => undefined

  const view: LoginScreenView = mountLoginScreen({
    host,
    form,
    login,
    password,
    submit,
    cancel,
    error,
    title: 'Đăng nhập',
    description: 'Đăng nhập tài khoản User 2',
    loginLabel: 'Tài khoản',
    passwordLabel: 'Mật khẩu',
  })

  return () => view.destroy()
}
