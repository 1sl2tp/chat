export type CleanIconName = 'menu' | 'back' | 'call' | 'video' | 'more' | 'attach' | 'mic' | 'send' | 'bell' | 'user' | 'close' | 'speaker' | 'phoneEnd' | 'phoneAnswer'

const glyphs: Record<CleanIconName, string> = {
  menu: '☰',
  back: '‹',
  call: '☎',
  video: '▣',
  more: '⋮',
  attach: '⌕',
  mic: '♩',
  send: '➤',
  bell: '●',
  user: '●',
  close: '×',
  speaker: '◖',
  phoneEnd: '☎',
  phoneAnswer: '☎',
}

export function cleanIcon(name: CleanIconName, label: string): HTMLSpanElement {
  const icon = document.createElement('span')
  icon.className = `clean-icon clean-icon--${name}`
  icon.textContent = glyphs[name]
  icon.setAttribute('aria-hidden', 'true')
  icon.title = label
  return icon
}
