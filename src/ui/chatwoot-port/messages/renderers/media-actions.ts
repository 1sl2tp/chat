export interface MediaActionOptions {
  url: string
  allowOpen?: boolean
}

export function createMediaActions(options: MediaActionOptions): HTMLElement {
  const actions = document.createElement('div')
  actions.className = 'cw-media-actions'

  const trigger = document.createElement('button')
  trigger.className = 'cw-media-actions__trigger'
  trigger.type = 'button'
  trigger.ariaLabel = 'Thao tác'
  trigger.textContent = '…'

  const menu = document.createElement('div')
  menu.className = 'cw-media-actions__menu'

  const addAction = (label: string, action: string) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cw-media-actions__item'
    button.dataset.action = action
    button.textContent = label
    menu.append(button)
  }

  if (options.allowOpen) addAction('Mở', 'open')
  addAction('Lưu', 'save')
  addAction('Chia sẻ', 'share')

  actions.append(trigger, menu)
  return actions
}
