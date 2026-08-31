import type { PasswordCredentials } from '../../auth/contracts'
import { formatVersionLabel } from '../../version'
import './login.css'

export interface AdminLoginOptions {
  onSubmit(credentials: PasswordCredentials): Promise<void>
}

function appendVersion(container: HTMLElement): void {
  const version = document.createElement('div')
  version.className = 'admin-login__version'
  version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')
  container.append(version)
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
  form.append(title, subtitle, email, password, submit, error)
  appendVersion(form)
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

export function mountAdminAccessDenied(root: HTMLElement, onSignOut: () => Promise<void>): () => void {
  const main = document.createElement('main')
  main.className = 'admin-login'
  const card = document.createElement('section')
  card.className = 'admin-login__card'
  const title = document.createElement('h1')
  title.textContent = 'Không có quyền Admin'
  const text = document.createElement('p')
  text.textContent = 'Tài khoản hiện tại không phải tài khoản quản trị.'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Đăng xuất / đổi tài khoản'
  const error = document.createElement('p')
  error.className = 'admin-login__error'
  const onClick = async () => {
    button.disabled = true
    error.textContent = ''
    try {
      await onSignOut()
    } catch {
      error.textContent = 'Không thể đăng xuất. Vui lòng thử lại.'
      button.disabled = false
    }
  }
  button.addEventListener('click', onClick)
  card.append(title, text, button, error)
  appendVersion(card)
  main.append(card)
  root.replaceChildren(main)
  return () => button.removeEventListener('click', onClick)
}
