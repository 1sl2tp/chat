import { signInAdmin } from '../../admin/auth'
import { adminSupabase } from '../../supabase/client'

export function mountAdminLogin(
  root: HTMLElement,
  onSignedIn: () => Promise<void>,
  initialError: string | null = null,
): () => void {
  const screen = document.createElement('main')
  screen.className = 'admin-login'

  const form = document.createElement('form')
  form.className = 'admin-login__form'

  const title = document.createElement('h1')
  title.textContent = 'Admin'

  const login = document.createElement('input')
  login.name = 'login'
  login.autocomplete = 'username'
  login.placeholder = 'Admin'
  login.value = 'admin'
  login.setAttribute('aria-label', 'Tài khoản Admin')

  const password = document.createElement('input')
  password.name = 'password'
  password.type = 'password'
  password.autocomplete = 'current-password'
  password.placeholder = 'Mật khẩu'
  password.setAttribute('aria-label', 'Mật khẩu Admin')

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = 'Đăng nhập'

  const error = document.createElement('p')
  error.className = 'admin-login__error'
  error.textContent = initialError ?? ''

  form.append(title, login, password, submit, error)
  screen.append(form)
  root.replaceChildren(screen)

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    submit.disabled = true
    error.textContent = ''

    try {
      await signInAdmin({
        async signIn(email, value) {
          const { error: authError } = await adminSupabase.auth.signInWithPassword({ email, password: value })
          if (authError) throw authError
        },
      }, login.value, password.value)
      await onSignedIn()
    } catch {
      error.textContent = 'Không đăng nhập được Admin.'
      submit.disabled = false
    }
  }

  form.addEventListener('submit', onSubmit)
  password.focus()

  return () => form.removeEventListener('submit', onSubmit)
}
