import { getChatRuntimeState, subscribeChatRuntime } from '../chat/store'
import { GUEST_AUTH_STORAGE_KEY, guestSupabase, userSupabase } from '../supabase/client'
import { updateUser2Profile, upgradeGuestToUser2 } from './auth'

export type AccountUiMode = 'guest' | 'user2'

export interface UserAccountSummary {
  displayName: string
  typeLabel: string
  accountLabel: string
}

export function accountUiMode(label: string): AccountUiMode {
  return label.trim().startsWith('User 2') ? 'user2' : 'guest'
}

export function userAccountSummary(
  mode: AccountUiMode,
  profile: { displayName: string; username: string } | null,
): UserAccountSummary {
  if (mode === 'user2') {
    const displayName = profile?.displayName.trim() || 'User 2'
    const username = profile?.username.trim() || ''
    return {
      displayName,
      typeLabel: 'User 2',
      accountLabel: username ? `@${username}` : 'Chưa đặt tài khoản',
    }
  }
  return {
    displayName: 'Khách',
    typeLabel: 'User 1',
    accountLabel: 'Chưa có tài khoản',
  }
}

export function userAccountErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (message.includes('invalid_display_name')) return 'Tên hiển thị chưa hợp lệ.'
  if (message.includes('invalid_username') || message.includes('admin_uses_admin_page')) return 'Tài khoản dùng 3–24 ký tự: a-z, 0-9, _.'
  if (message.includes('username_taken') || message.includes('username_exists') || message.includes('username_reserved')) return 'Tài khoản này đã được sử dụng.'
  if (message.includes('password_too_short') || message.includes('invalid_password')) return 'Mật khẩu cần ít nhất 6 ký tự.'
  return 'Không thể cập nhật tài khoản.'
}

function currentProfile(): { displayName: string; username: string } | null {
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

function clearGuestBrowserAuth(): void {
  try {
    window.sessionStorage.removeItem(GUEST_AUTH_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in restrictive browser modes; reload still clears the in-memory guest client.
  }
}

function prepareSummaryLayout(doc: Document, modeElement: HTMLElement): {
  name: HTMLElement | null
  account: HTMLElement | null
  avatar: HTMLElement | null
} {
  const host = doc.querySelector<HTMLElement>('.user-account-summary')
  if (!host) return { name: null, account: null, avatar: null }

  const avatar = doc.createElement('span')
  avatar.className = 'user-account-summary__avatar'
  avatar.setAttribute('aria-hidden', 'true')

  const body = doc.createElement('div')
  body.className = 'user-account-summary__body'

  const name = doc.createElement('strong')
  name.id = 'user-summary-name'
  name.className = 'user-account-summary__name'

  const meta = doc.createElement('div')
  meta.className = 'user-account-summary__meta'

  const account = doc.createElement('span')
  account.id = 'user-summary-account'
  account.className = 'user-account-summary__account'

  modeElement.className = 'user-account-summary__type'
  meta.append(account, modeElement)
  body.append(name, meta)
  host.replaceChildren(avatar, body)
  host.classList.add('user-account-summary--identity')
  return { name, account, avatar }
}

function createDrawerDetails(doc: Document, className: string, label: string): {
  details: HTMLDetailsElement
  body: HTMLElement
} {
  const details = doc.createElement('details')
  details.className = `user-drawer-details ${className}`
  const summary = doc.createElement('summary')
  summary.textContent = label
  const body = doc.createElement('div')
  body.className = 'user-drawer-details__body'
  details.append(summary, body)
  return { details, body }
}

export function mountUserAccountUi(doc: Document = document): () => void {
  const drawerPanel = doc.querySelector<HTMLElement>('#user-drawer .user-drawer-panel')
  const modeLabel = doc.querySelector<HTMLElement>('#user-mode')
  const legacyAuthAction = doc.querySelector<HTMLButtonElement>('#auth-action')
  const settingsPanel = doc.querySelector<HTMLElement>('#user2-settings')
  const settingsStatus = doc.querySelector<HTMLElement>('#settings-status')
  if (!drawerPanel || !modeLabel || !legacyAuthAction || !settingsPanel || !settingsStatus) return () => undefined

  const modeElement: HTMLElement = modeLabel
  const authButton: HTMLButtonElement = legacyAuthAction
  const summaryLayout = prepareSummaryLayout(doc, modeElement)
  const supportTitle = doc.querySelector<HTMLElement>('.user-title strong')
  if (supportTitle) supportTitle.textContent = 'Hỗ trợ'
  doc.querySelector<HTMLElement>('#messages')?.setAttribute('aria-label', 'Tin nhắn với Hỗ trợ')

  const guestSection = doc.createElement('section')
  guestSection.className = 'user-account-actions'
  guestSection.innerHTML = `
    <button id="user-upgrade-toggle" class="user-drawer-action primary" type="button">Nâng cấp tài khoản</button>
    <button id="user-login-existing" class="user-drawer-action secondary" type="button">Đăng nhập tài khoản</button>
    <form id="user-upgrade-form" class="user-account-form" hidden>
      <h2>Tạo tài khoản</h2>
      <input id="user-upgrade-display" autocomplete="name" maxlength="50" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
      <input id="user-upgrade-username" autocomplete="username" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
      <input id="user-upgrade-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" placeholder="Mật khẩu" aria-label="Mật khẩu User 2" />
      <button type="submit">Tạo tài khoản</button>
      <p id="user-upgrade-status" class="user-settings-status" aria-live="polite"></p>
    </form>
  `
  drawerPanel.insertBefore(guestSection, settingsPanel)

  const profileDetails = doc.createElement('details')
  profileDetails.className = 'user-profile-details user-drawer-details'
  profileDetails.innerHTML = `
    <summary>Sửa thông tin</summary>
    <form id="user-profile-form" class="user-account-form">
      <input id="user-profile-display" autocomplete="name" maxlength="50" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
      <input id="user-profile-username" autocomplete="username" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
      <button type="submit">Lưu thay đổi</button>
      <p id="user-profile-status" class="user-settings-status" aria-live="polite"></p>
    </form>
  `
  settingsPanel.insertBefore(profileDetails, settingsPanel.firstChild)

  const passwordDetails = settingsPanel.querySelector<HTMLDetailsElement>('.user-password-details')
  const notificationDetails = createDrawerDetails(doc, 'user-notification-details', 'Thông báo')
  const notificationChildren = [...settingsPanel.children].filter((child) => child !== profileDetails && child !== passwordDetails)
  for (const child of notificationChildren) {
    if (child.tagName === 'H2') child.remove()
    else notificationDetails.body.append(child)
  }
  settingsPanel.append(notificationDetails.details)

  const managementDetails = createDrawerDetails(doc, 'user-management-details', 'Quản lý tài khoản')
  if (passwordDetails) managementDetails.body.append(passwordDetails)
  managementDetails.body.append(authButton)
  drawerPanel.append(managementDetails.details)

  const upgradeToggle = guestSection.querySelector<HTMLButtonElement>('#user-upgrade-toggle')!
  const loginExisting = guestSection.querySelector<HTMLButtonElement>('#user-login-existing')!
  const upgradeForm = guestSection.querySelector<HTMLFormElement>('#user-upgrade-form')!
  const upgradeDisplay = guestSection.querySelector<HTMLInputElement>('#user-upgrade-display')!
  const upgradeUsername = guestSection.querySelector<HTMLInputElement>('#user-upgrade-username')!
  const upgradePassword = guestSection.querySelector<HTMLInputElement>('#user-upgrade-password')!
  const upgradeStatus = guestSection.querySelector<HTMLElement>('#user-upgrade-status')!
  const profileForm = profileDetails.querySelector<HTMLFormElement>('#user-profile-form')!
  const profileDisplay = profileDetails.querySelector<HTMLInputElement>('#user-profile-display')!
  const profileUsername = profileDetails.querySelector<HTMLInputElement>('#user-profile-username')!
  const profileStatus = profileDetails.querySelector<HTMLElement>('#user-profile-status')!
  let actionPending = false

  function sync(): void {
    const mode = accountUiMode(modeElement.textContent ?? '')
    const profile = mode === 'user2' ? currentProfile() : null
    const summary = userAccountSummary(mode, profile)
    if (summaryLayout.name) summaryLayout.name.textContent = summary.displayName
    if (summaryLayout.account) summaryLayout.account.textContent = summary.accountLabel
    if (summaryLayout.avatar) summaryLayout.avatar.textContent = summary.displayName.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || 'U'
    if (modeElement.textContent !== summary.typeLabel) modeElement.textContent = summary.typeLabel

    guestSection.hidden = mode !== 'guest'
    profileDetails.hidden = mode !== 'user2'
    managementDetails.details.hidden = mode !== 'user2'
    authButton.hidden = mode === 'guest'

    if (mode === 'user2' && profile) {
      if (doc.activeElement !== profileDisplay) profileDisplay.value = profile.displayName
      if (doc.activeElement !== profileUsername) profileUsername.value = profile.username
    }
  }

  upgradeToggle.addEventListener('click', () => {
    upgradeForm.hidden = !upgradeForm.hidden
    upgradeStatus.textContent = ''
    if (!upgradeForm.hidden) upgradeDisplay.focus()
  })

  loginExisting.addEventListener('click', () => {
    authButton.click()
  })

  upgradeForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (actionPending || accountUiMode(modeElement.textContent ?? '') !== 'guest') return
    actionPending = true
    upgradeStatus.textContent = 'Đang tạo tài khoản…'
    for (const input of [upgradeDisplay, upgradeUsername, upgradePassword]) input.disabled = true
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
          return { loginUsername: typeof data?.login_username === 'string' ? data.login_username : input.username }
        },
        async signInPersistentUser2(email, password) {
          const result = await userSupabase.auth.signInWithPassword({ email, password })
          if (result.error) throw result.error
        },
        async clearGuestAuthSession() {
          clearGuestBrowserAuth()
        },
      }, upgradeDisplay.value, upgradeUsername.value, upgradePassword.value)
      upgradeStatus.textContent = 'Đã nâng cấp tài khoản.'
      window.location.reload()
    } catch (error) {
      upgradeStatus.textContent = userAccountErrorMessage(error)
      actionPending = false
      for (const input of [upgradeDisplay, upgradeUsername, upgradePassword]) input.disabled = false
    }
  })

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (actionPending || accountUiMode(modeElement.textContent ?? '') !== 'user2') return
    actionPending = true
    profileStatus.textContent = 'Đang lưu…'
    profileDisplay.disabled = true
    profileUsername.disabled = true
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
      }, profileDisplay.value, profileUsername.value)
      const refreshed = await userSupabase.auth.refreshSession()
      if (refreshed.error) throw refreshed.error
      profileStatus.textContent = 'Đã lưu.'
      settingsStatus.textContent = 'Thông tin tài khoản đã cập nhật.'
      window.location.reload()
    } catch (error) {
      profileStatus.textContent = userAccountErrorMessage(error)
      actionPending = false
      profileDisplay.disabled = false
      profileUsername.disabled = false
    }
  })

  const stopRuntime = subscribeChatRuntime(sync)
  const observer = new MutationObserver(sync)
  observer.observe(modeElement, { childList: true, subtree: true, characterData: true })
  sync()

  return () => {
    stopRuntime()
    observer.disconnect()
    guestSection.remove()
    profileDetails.remove()
    notificationDetails.details.remove()
    managementDetails.details.remove()
  }
}
