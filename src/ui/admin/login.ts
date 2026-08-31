import type { PasswordCredentials } from '../../auth/contracts'
import { formatVersionLabel } from '../../version'
import './login.css'

export interface AdminLoginOptions {
  onSubmit(credentials: PasswordCredentials): Promise<void>
}

export function mountAdminLogin(root: HTMLElement, options: AdminLoginOptions): () => void {
  const main = document.createElement('main')
  main.className = 'admin-login'

  const form = document.createElement('form')
  form.className = 'admin-login__card'

  const title = document.createElement('h1')
  title.textContent = 'Đăng nhập Admin'

  const subtitle = document.createElement('p')
  subtitle.textContent = 'Khu vực quản trị hỗ trợ khách hàng.'

  const email = document.createElement('input')
  email.type = 'email'
  email.name = 'email'
  email.autocomplete = 'username'
  email.inputMode = 'email'
  email.placeholder = 'Email Admin'
  email.required = true

  const password = document.createElement('input')
  password.type = 'password'
  password.name = 'password'
  password.autocomplete = 'current-password'
  password.placeholder = 'Mật khẩu'
  password.required = true

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = 'Đăng nhập'

  const error = document.createElement('p')
  error.className = 'admin-login__error'
  error.setAttribute('role', 'alert')

  const version = document.createElement('div')
  version.className = 'admin-login__version'
  version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')

  form.append(title, subtitle, email, password, submit, error, version)
  main.append(form)
  root.replaceChildren(main)

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (submit.disabled) return
    error.textContent = ''
    submit.disabled = true
    submit.textContent = 'Đang đăng nhập…'
    try {
      await options.onSubmit({ email: email.value.trim(), password: password.value })
    } catch {
      error.textContent = 'Không đăng nhập được. Kiểm tra tài khoản và mật khẩu.'
      submit.disabled = false
      submit.textContent = 'Đăng nhập'
      password.select()
    }
  }

  form.addEventListener('submit', onSubmit)
  return () => form.removeEventListener('submit', onSubmit)
}
