import { iconSvg } from '../../icons'
import './login-screen.css'

export interface LoginScreenControls {
  host: HTMLElement
  form: HTMLFormElement
  login: HTMLInputElement
  password: HTMLInputElement
  submit: HTMLButtonElement
  error: HTMLElement
  cancel?: HTMLButtonElement | null
  title: string
  description: string
  loginLabel?: string
  passwordLabel?: string
}

export interface LoginScreenView {
  element: HTMLElement
  destroy(): void
}

function field(labelText: string, input: HTMLInputElement): HTMLElement {
  const wrapper = document.createElement('label')
  wrapper.className = 'cw-login__field'
  const label = document.createElement('span')
  label.className = 'cw-login__field-label'
  label.textContent = labelText
  input.classList.add('cw-login__input')
  wrapper.append(label, input)
  return wrapper
}

export function mountLoginScreen(options: LoginScreenControls): LoginScreenView {
  const root = document.createElement('section')
  root.className = 'cw-login'

  const content = document.createElement('div')
  content.className = 'cw-login__content'

  const logo = document.createElement('div')
  logo.className = 'cw-login__logo'
  logo.innerHTML = iconSvg('chat')
  logo.setAttribute('aria-hidden', 'true')

  const intro = document.createElement('header')
  intro.className = 'cw-login__intro'
  const title = document.createElement('h1')
  title.className = 'cw-login__title'
  title.textContent = options.title
  const description = document.createElement('p')
  description.className = 'cw-login__description'
  description.textContent = options.description
  intro.append(title, description)

  const form = options.form
  form.className = 'cw-login__form'
  options.login.classList.add('cw-login__input')
  options.password.classList.add('cw-login__input')
  options.submit.classList.add('cw-login__submit')
  options.error.classList.add('cw-login__error')

  const loginField = field(options.loginLabel ?? 'Tài khoản', options.login)
  const passwordField = field(options.passwordLabel ?? 'Mật khẩu', options.password)
  passwordField.classList.add('cw-login__field--password')

  const passwordWrap = document.createElement('div')
  passwordWrap.className = 'cw-login__password-wrap'
  const passwordLabel = passwordField.querySelector('.cw-login__field-label')!
  passwordWrap.append(options.password)
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'cw-login__password-toggle'
  toggle.innerHTML = iconSvg('eye')
  toggle.setAttribute('aria-label', 'Hiện mật khẩu')
  toggle.addEventListener('click', () => {
    const showing = options.password.type === 'text'
    options.password.type = showing ? 'password' : 'text'
    toggle.setAttribute('aria-label', showing ? 'Hiện mật khẩu' : 'Ẩn mật khẩu')
    toggle.innerHTML = iconSvg(showing ? 'eye' : 'eyeOff')
  })
  passwordWrap.append(toggle)
  passwordField.replaceChildren(passwordLabel, passwordWrap)

  const actions = document.createElement('div')
  actions.className = 'cw-login__actions'
  actions.append(options.submit)
  if (options.cancel) {
    options.cancel.classList.add('cw-login__cancel')
    actions.append(options.cancel)
  }

  form.replaceChildren(loginField, passwordField, options.error, actions)
  content.append(logo, intro, form)
  root.append(content)
  options.host.replaceChildren(root)

  return {
    element: root,
    destroy() {
      root.remove()
    },
  }
}
