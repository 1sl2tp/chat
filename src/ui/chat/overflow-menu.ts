export interface OverflowMenuController {
  toggle(): void
  close(): void
  destroy(): void
}

export function mountOverflowMenu(container: HTMLElement): OverflowMenuController {
  const panel = document.createElement('div')
  panel.className = 'chat-menu'
  panel.hidden = true
  panel.setAttribute('role', 'menu')

  const items = [
    ['Lưu cuộc trò chuyện', 'Sắp có'],
    ['Cập nhật tên & địa chỉ', 'Sắp có'],
    ['Bật thông báo', 'Sắp có'],
    ['Kết thúc & xóa', 'Sắp có'],
  ] as const

  for (const [label, note] of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chat-menu__item'
    button.disabled = true
    button.setAttribute('role', 'menuitem')

    const text = document.createElement('span')
    text.textContent = label
    const meta = document.createElement('small')
    meta.textContent = note

    button.append(text, meta)
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
