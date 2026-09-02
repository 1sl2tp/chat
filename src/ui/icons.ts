export type AppIconName =
  | 'menu'
  | 'call'
  | 'back'
  | 'plus'
  | 'send'
  | 'mic'
  | 'image'
  | 'file'
  | 'heart'
  | 'copy'
  | 'share'
  | 'account'
  | 'notification'
  | 'more'
  | 'close'
  | 'minimize'
  | 'speaker'
  | 'speakerOff'
  | 'mute'
  | 'unmute'
  | 'endCall'
  | 'acceptCall'

const paths: Record<AppIconName, string> = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  call: '<path d="M6.6 3.8 9 3l2 5-2.1 1.5a15 15 0 0 0 5.6 5.6L16 13l5 2-0.8 2.4a3 3 0 0 1-3.4 2A17.5 17.5 0 0 1 4.6 7.2a3 3 0 0 1 2-3.4Z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
  heart: '<path d="M20.8 5.8a5 5 0 0 0-7.1 0L12 7.5l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.1a5 5 0 0 0 0-7.1Z"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  notification: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  minimize: '<path d="M5 12h14"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
  speakerOff: '<path d="M11 5 6 9H3v6h3l5 4v-5"/><path d="m3 3 18 18"/>',
  mute: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  unmute: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6M4 4l16 16"/>',
  endCall: '<path d="M5 15.5c4.5-3.2 9.5-3.2 14 0"/><path d="m5 15.5-2 3M19 15.5l2 3"/>',
  acceptCall: '<path d="M6.6 3.8 9 3l2 5-2.1 1.5a15 15 0 0 0 5.6 5.6L16 13l5 2-0.8 2.4a3 3 0 0 1-3.4 2A17.5 17.5 0 0 1 4.6 7.2a3 3 0 0 1 2-3.4Z"/>',
}

export function iconSvg(name: AppIconName): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

export function setButtonIcon(button: HTMLButtonElement, name: AppIconName, label: string): void {
  button.innerHTML = iconSvg(name)
  button.setAttribute('aria-label', label)
  button.title = label
}
