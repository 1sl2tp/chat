export interface AccountDrawerModel {
  displayName: string
  username?: string
  kind: 'user1' | 'user2'
  canEditProfile: boolean
  canManageNotifications: boolean
  canChangePassword: boolean
  canDeleteAccount: boolean
}

export interface AccountDrawerSlots {
  editProfile?: HTMLElement[]
  notifications?: HTMLElement[]
  management?: HTMLElement[]
}

export interface AccountDrawerMountOptions {
  host: HTMLElement
  model: AccountDrawerModel
  slots?: AccountDrawerSlots
  onDeleteAccount?: () => void
}

export interface AccountDrawerView {
  element: HTMLElement
  update(model: AccountDrawerModel): void
  destroy(): void
}

function createGroup(label: 'Sửa thông tin' | 'Thông báo' | 'Quản lý tài khoản'): {
  section: HTMLElement
  body: HTMLElement
} {
  const section = document.createElement('section')
  section.className = 'cw-account__group'

  const title = document.createElement('h2')
  title.className = 'cw-account__group-title'
  title.textContent = label

  const body = document.createElement('div')
  body.className = 'cw-account__group-body'
  section.append(title, body)
  return { section, body }
}

export function mountAccountDrawer(options: AccountDrawerMountOptions): AccountDrawerView {
  const root = document.createElement('section')
  root.className = 'cw-account-drawer'

  const identity = document.createElement('header')
  identity.className = 'cw-account__identity'
  const displayName = document.createElement('strong')
  displayName.className = 'cw-account__display-name'
  const username = document.createElement('small')
  username.className = 'cw-account__username'
  const kind = document.createElement('span')
  kind.className = 'cw-account__kind'
  identity.append(displayName, username, kind)

  const edit = createGroup('Sửa thông tin')
  const notifications = createGroup('Thông báo')
  const management = createGroup('Quản lý tài khoản')

  const editNodes = options.slots?.editProfile ?? []
  const notificationNodes = options.slots?.notifications ?? []
  const managementNodes = options.slots?.management ?? []
  edit.body.append(...editNodes)
  notifications.body.append(...notificationNodes)

  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'cw-account__delete'
  deleteButton.textContent = 'Xóa tài khoản'
  deleteButton.addEventListener('click', () => options.onDeleteAccount?.())

  root.append(identity, edit.section, notifications.section, management.section)
  options.host.replaceChildren(root)

  let model = options.model

  function render(): void {
    displayName.textContent = model.displayName
    username.textContent = model.username
      ? `@${model.username}`
      : model.kind === 'user2'
        ? 'Chưa đặt tài khoản'
        : 'Chưa có tài khoản'
    kind.textContent = model.kind === 'user2' ? 'User 2' : 'User 1'

    edit.body.hidden = !model.canEditProfile
    notifications.body.hidden = !model.canManageNotifications
    management.body.replaceChildren(
      ...managementNodes,
      ...(model.canDeleteAccount && options.onDeleteAccount ? [deleteButton] : []),
    )
  }

  render()

  return {
    element: root,
    update(nextModel) {
      model = nextModel
      render()
    },
    destroy() {
      options.host.replaceChildren()
    },
  }
}
