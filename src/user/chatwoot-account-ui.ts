import { getChatRuntimeState, subscribeChatRuntime } from '../chat/store'
import { GUEST_AUTH_STORAGE_KEY, guestSupabase, userSupabase } from '../supabase/client'
import { mountAccountDrawer, type AccountDrawerModel, type AccountDrawerView } from '../ui/chatwoot-port/account/account-drawer'
import { updateUser2Profile, upgradeGuestToUser2 } from './auth'

export type ChatwootAccountUiMode = 'guest' | 'user2'

interface AccountProfile {
  displayName: string
  username: string
}

export function toAccountDrawerModel(
  mode: ChatwootAccountUiMode,
  profile: AccountProfile | null,
): AccountDrawerModel {
  if (mode === 'user2') {
    return {
      displayName: profile?.displayName.trim() || 'User 2',
      username: profile?.username.trim() || undefined,
      kind: 'user2',
      canEditProfile: true,
      canManageNotifications: true,
      canChangePassword: true,
      canDeleteAccount: false,
    }
  }

  return {
    displayName: 'Khách',
    username: undefined,
    kind: 'user1',
    canEditProfile: false,
    canManageNotifications: false,
    canChangePassword: false,
    canDeleteAccount: false,
  }
}

function modeFromLabel(label: string): ChatwootAccountUiMode {
  return label.trim().startsWith('User 2') ? 'user2' : 'guest'
}

function currentProfile(): AccountProfile | null {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return null
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return null
  const row = profile as { display_name?: unknown; username?: unknown }
  return {
    displayName: typeof row.display_name === 'string' ? row.display_name : '',
    username: typeof row.username === 'string' ? row.username : '',
  }
}

function accountErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (message.includes('invalid_display_name')) return 'Tên hiển thị chưa hợp lệ.'
  if (message.includes('invalid_username') || message.includes('admin_uses_admin_page')) {
    return 'Tài khoản dùng 3–24 ký tự: a-z, 0-9, _.'
  }
  if (message.includes('username_taken') || message.includes('username_exists') || message.includes('username_reserved')) {
    return 'Tài khoản này đã được sử dụng.'
  }
  if (message.includes('password_too_short') || message.includes('invalid_password')) {
    return 'Mật khẩu cần ít nhất 6 ký tự.'
  }
  return 'Không thể cập nhật tài khoản.'
}

function clearGuestBrowserAuth(): void {
  try {
    window.sessionStorage.removeItem(GUEST_AUTH_STORAGE_KEY)
  } catch {
    // Restrictive browser modes can block storage; reload still clears in-memory guest state.
  }
}

function createProfileForm(doc: Document): {
  element: HTMLElement
  displayName: HTMLInputElement
  username: HTMLInputElement
  status: HTMLElement
} {
  const form = doc.createElement('form')
  form.id = 'cw-user-profile-form'
  form.className = 'user-account-form cw-account-runtime-form'
  form.innerHTML = `
    <input id="cw-user-profile-display" autocomplete="name" maxlength="50" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
    <input id="cw-user-profile-username" autocomplete="username" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
    <button type="submit">Lưu thay đổi</button>
    <p id="cw-user-profile-status" class="user-settings-status" aria-live="polite"></p>
  `
  return {
    element: form,
    displayName: form.querySelector<HTMLInputElement>('#cw-user-profile-display')!,
    username: form.querySelector<HTMLInputElement>('#cw-user-profile-username')!,
    status: form.querySelector<HTMLElement>('#cw-user-profile-status')!,
  }
}

function createGuestActions(doc: Document): {
  element: HTMLElement
  upgradeToggle: HTMLButtonElement
  loginExisting: HTMLButtonElement
  form: HTMLFormElement
  displayName: HTMLInputElement
  username: HTMLInputElement
  password: HTMLInputElement
  status: HTMLElement
} {
  const section = doc.createElement('div')
  section.className = 'cw-account-guest-actions'
  section.innerHTML = `
    <button id="cw-user-upgrade-toggle" class="user-drawer-action primary" type="button">Nâng cấp tài khoản</button>
    <button id="cw-user-login-existing" class="user-drawer-action secondary" type="button">Đăng nhập tài khoản</button>
    <form id="cw-user-upgrade-form" class="user-account-form" hidden>
      <input id="cw-user-upgrade-display" autocomplete="name" maxlength="50" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
      <input id="cw-user-upgrade-username" autocomplete="username" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
      <input id="cw-user-upgrade-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" placeholder="Mật khẩu" aria-label="Mật khẩu User 2" />
      <button type="submit">Tạo tài khoản</button>
      <p id="cw-user-upgrade-status" class="user-settings-status" aria-live="polite"></p>
    </form>
  `

  return {
    element: section,
    upgradeToggle: section.querySelector<HTMLButtonElement>('#cw-user-upgrade-toggle')!,
    loginExisting: section.querySelector<HTMLButtonElement>('#cw-user-login-existing')!,
    form: section.querySelector<HTMLFormElement>('#cw-user-upgrade-form')!,
    displayName: section.querySelector<HTMLInputElement>('#cw-user-upgrade-display')!,
    username: section.querySelector<HTMLInputElement>('#cw-user-upgrade-username')!,
    password: section.querySelector<HTMLInputElement>('#cw-user-upgrade-password')!,
    status: section.querySelector<HTMLElement>('#cw-user-upgrade-status')!,
  }
}

function notificationNodes(settingsPanel: HTMLElement, passwordDetails: HTMLElement | null): HTMLElement[] {
  return [...settingsPanel.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter(child => child !== passwordDetails && child.tagName !== 'H2')
}

export function mountUserChatwootAccountUi(doc: Document = document): () => void {
  const drawerPanel = doc.querySelector<HTMLElement>('#user-drawer .user-drawer-panel')
  const drawerHeader = drawerPanel?.querySelector<HTMLElement>(':scope > header') ?? null
  const legacySummary = doc.querySelector<HTMLElement>('.user-account-summary')
  const modeElement = doc.querySelector<HTMLElement>('#user-mode')
  const settingsPanel = doc.querySelector<HTMLElement>('#user2-settings')
  const authButton = doc.querySelector<HTMLButtonElement>('#auth-action')
  if (!drawerPanel || !modeElement || !settingsPanel || !authButton) return () => undefined

  const drawerContainer: HTMLElement = drawerPanel
  const modeLabel: HTMLElement = modeElement
  const accountSettings: HTMLElement = settingsPanel
  const authAction: HTMLButtonElement = authButton
  const passwordDetails = accountSettings.querySelector<HTMLElement>('.user-password-details')
  const profile = createProfileForm(doc)
  const guest = createGuestActions(doc)
  const accountHost = doc.createElement('div')
  accountHost.className = 'cw-account-host'

  if (drawerHeader) drawerHeader.insertAdjacentElement('afterend', accountHost)
  else drawerContainer.insertBefore(accountHost, drawerContainer.firstChild)

  const notifications = notificationNodes(accountSettings, passwordDetails)
  for (const heading of [...accountSettings.querySelectorAll(':scope > h2')]) heading.remove()

  const managementNodes: HTMLElement[] = [guest.element]
  if (passwordDetails) managementNodes.push(passwordDetails)
  managementNodes.push(authAction)

  legacySummary?.setAttribute('hidden', '')
  accountSettings.setAttribute('hidden', '')

  let drawer: AccountDrawerView | null = mountAccountDrawer({
    host: accountHost,
    model: toAccountDrawerModel(modeFromLabel(modeLabel.textContent ?? ''), currentProfile()),
    slots: {
      editProfile: [profile.element],
      notifications,
      management: managementNodes,
    },
  })
  let actionPending = false

  function sync(): void {
    const mode = modeFromLabel(modeLabel.textContent ?? '')
    const current = mode === 'user2' ? currentProfile() : null
    drawer?.update(toAccountDrawerModel(mode, current))

    guest.element.hidden = mode !== 'guest'
    if (passwordDetails) passwordDetails.hidden = mode !== 'user2'
    authAction.hidden = mode !== 'user2'

    if (mode === 'user2' && current) {
      if (doc.activeElement !== profile.displayName) profile.displayName.value = current.displayName
      if (doc.activeElement !== profile.username) profile.username.value = current.username
    }
  }

  guest.upgradeToggle.addEventListener('click', () => {
    guest.form.hidden = !guest.form.hidden
    guest.status.textContent = ''
    if (!guest.form.hidden) guest.displayName.focus()
  })

  guest.loginExisting.addEventListener('click', () => authAction.click())

  guest.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (actionPending || modeFromLabel(modeLabel.textContent ?? '') !== 'guest') return
    actionPending = true
    guest.status.textContent = 'Đang tạo tài khoản…'
    for (const input of [guest.displayName, guest.username, guest.password]) input.disabled = true
    try {
      await upgradeGuestToUser2({
        async upgradeCurrentGuest(input) {
          const result = await guestSupabase.rpc('chat_upgrade_to_user2', {
            p_display_name: input.displayName,
            p_username: input.username,
            p_password: input.password,
          })
          if (result.error) throw new Error(result.error.message)
          const data = result.data as { login_username?: unknown } | null
          return {
            loginUsername: typeof data?.login_username === 'string' ? data.login_username : input.username,
          }
        },
        async signInPersistentUser2(email, password) {
          const result = await userSupabase.auth.signInWithPassword({ email, password })
          if (result.error) throw result.error
        },
        async clearGuestAuthSession() {
          clearGuestBrowserAuth()
        },
      }, guest.displayName.value, guest.username.value, guest.password.value)
      guest.status.textContent = 'Đã nâng cấp tài khoản.'
      window.location.reload()
    } catch (error) {
      guest.status.textContent = accountErrorMessage(error)
      actionPending = false
      for (const input of [guest.displayName, guest.username, guest.password]) input.disabled = false
    }
  })

  profile.element.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (actionPending || modeFromLabel(modeLabel.textContent ?? '') !== 'user2') return
    actionPending = true
    profile.status.textContent = 'Đang lưu…'
    profile.displayName.disabled = true
    profile.username.disabled = true
    try {
      await updateUser2Profile({
        async update(input) {
          const result = await userSupabase.rpc('chat_update_user2_account', {
            p_display_name: input.displayName,
            p_username: input.username,
          })
          if (result.error) throw new Error(result.error.message)
          const data = result.data as { display_name?: unknown; username?: unknown } | null
          return {
            displayName: typeof data?.display_name === 'string' ? data.display_name : input.displayName,
            username: typeof data?.username === 'string' ? data.username : input.username,
          }
        },
      }, profile.displayName.value, profile.username.value)
      const refreshed = await userSupabase.auth.refreshSession()
      if (refreshed.error) throw refreshed.error
      profile.status.textContent = 'Đã lưu.'
      window.location.reload()
    } catch (error) {
      profile.status.textContent = accountErrorMessage(error)
      actionPending = false
      profile.displayName.disabled = false
      profile.username.disabled = false
    }
  })

  const stopRuntime = subscribeChatRuntime(sync)
  const observer = new MutationObserver(sync)
  observer.observe(modeLabel, { childList: true, subtree: true, characterData: true })
  sync()

  return () => {
    stopRuntime()
    observer.disconnect()
    drawer?.destroy()
    drawer = null
    accountHost.remove()
    legacySummary?.removeAttribute('hidden')
    accountSettings.removeAttribute('hidden')
  }
}
