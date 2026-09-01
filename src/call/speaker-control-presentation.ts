export interface PhoneSpeakerButtonPresentation {
  label: 'Loa ngoài'
  icon: '🔊'
  title: string
  pressed: boolean
}

export function phoneSpeakerButtonPresentation(
  speakerSelected: boolean,
): Readonly<PhoneSpeakerButtonPresentation> {
  return Object.freeze({
    label: 'Loa ngoài',
    icon: '🔊',
    title: speakerSelected ? 'Chạm để tắt loa ngoài' : 'Chạm để bật loa ngoài',
    pressed: speakerSelected,
  })
}
