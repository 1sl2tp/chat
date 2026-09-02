import { mountLoginScreen, type LoginScreenView } from '../ui/chatwoot-port/auth/login-screen'

export function installAdminChatwootLoginUi(doc: Document = document): () => void {
  let currentHost: HTMLElement | null = null
  let currentView: LoginScreenView | null = null

  const mountCurrent = (): void => {
    const host = doc.querySelector<HTMLElement>('.admin-login')
    if (!host || host === currentHost || host.dataset.cwLoginMounted === 'true') return

    const form = host.querySelector<HTMLFormElement>('#admin-login-form')
    const login = host.querySelector<HTMLInputElement>('#admin-login')
    const password = host.querySelector<HTMLInputElement>('#admin-password')
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null
    const error = host.querySelector<HTMLElement>('#admin-login-error')
    if (!form || !login || !password || !submit || !error) return

    currentView?.destroy()
    currentHost = host
    host.dataset.cwLoginMounted = 'true'
    currentView = mountLoginScreen({
      host,
      form,
      login,
      password,
      submit,
      error,
      title: 'Đăng nhập',
      description: 'Đăng nhập Hỗ trợ',
      loginLabel: 'Tài khoản',
      passwordLabel: 'Mật khẩu',
    })
  }

  mountCurrent()
  const observer = new MutationObserver(mountCurrent)
  observer.observe(doc.documentElement, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    currentView?.destroy()
    currentView = null
    currentHost = null
  }
}
