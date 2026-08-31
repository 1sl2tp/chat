import { updateCustomerProfile } from '../../profile/runtime'
import { createSupabaseProfileBackend } from '../../supabase/profile-backend'
import './profile-form.css'

export interface ProfileFormController {
  open(displayName?: string | null): void
  close(): void
  destroy(): void
}

export function mountProfileForm(container: HTMLElement): ProfileFormController {
  const overlay = document.createElement('div')
  overlay.className = 'profile-sheet'
  overlay.hidden = true

  const panel = document.createElement('form')
  panel.className = 'profile-sheet__panel'

  const heading = document.createElement('h2')
  heading.textContent = 'Thông tin của bạn'

  const note = document.createElement('p')
  note.textContent = 'Thêm tên và địa chỉ nếu bạn muốn Admin dễ nhận biết và lưu thông tin hỗ trợ.'

  const name = document.createElement('input')
  name.type = 'text'
  name.maxLength = 50
  name.placeholder = 'Tên của bạn'
  name.autocomplete = 'name'

  const address = document.createElement('textarea')
  address.maxLength = 500
  address.rows = 3
  address.placeholder = 'Địa chỉ (không bắt buộc)'
  address.autocomplete = 'street-address'

  const error = document.createElement('div')
  error.className = 'profile-sheet__error'
  error.hidden = true

  const actions = document.createElement('div')
  actions.className = 'profile-sheet__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Hủy'
  const save = document.createElement('button')
  save.type = 'submit'
  save.textContent = 'Lưu'
  actions.append(cancel, save)

  panel.append(heading, note, name, address, error, actions)
  overlay.append(panel)
  container.append(overlay)

  const close = () => { overlay.hidden = true }
  cancel.addEventListener('click', close)

  panel.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    error.hidden = true
    try {
      await updateCustomerProfile(createSupabaseProfileBackend(), {
        displayName: name.value,
        address: address.value,
      })
      close()
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : 'Không thể lưu thông tin.'
      error.hidden = false
    } finally {
      save.disabled = false
    }
  })

  return {
    open(displayName = null) {
      name.value = displayName ?? ''
      error.hidden = true
      overlay.hidden = false
      name.focus()
    },
    close,
    destroy() { overlay.remove() },
  }
}
