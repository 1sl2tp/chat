export interface OverflowMenuController {
  toggle(): void
  close(): void
  destroy(): void
}

export interface OverflowMenuOptions {
  onEditProfile?: () => void
}

export function mountOverflowMenu(container: HTMLElement, options: OverflowMenuOptions = {}): OverflowMenuController {
  const panel = document.createElement('div')
  panel.className = 'chat-menu'
  panel.hidden = true
  panel.setAttribute('role', 'menu')

  const items = [
    { label: 'Lưu cuộc trò chuyện', note: 'Sắp có', enabled: false },
    { label: 'Cập nhật tên & địa chỉ', note: '', enabled: true, action: options.onEditProfile },
    { label: 'Bật thông báo', note: 'Sắp có', enabled: false },
    { label: 'Kết thúc & xóa', note: 'Sắp có', enabled: false },
  ]

  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chat-menu__item'
    button.disabled = !item.enabled
    button.setAttribute('role', 'menuitem')

    const text = document.createElement('span')
    text.textContent = item.label
    const meta = document.createElement('small')
    meta.textContent = item.note

    button.append(text, meta)
    if (item.enabled) {
      button.addEventListener('click', () => {
        panel.hidden = true
        item.action?.()
      })
    }
    panel.append(button)
  }

  container.append(panel)

  return {
    toggle() {
      panel.hidden = !panel.hidden
    },
    close() {
      panel.hidden = true
    },
    destroy() {
      panel.remove()
    },
  }
}
