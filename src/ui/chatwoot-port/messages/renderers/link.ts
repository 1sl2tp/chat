import type { PresentedMessage } from '../message-model'

export function renderLinkMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--link cw-message--${message.direction}`
  row.dataset.messageId = message.id

  const card = document.createElement('div')
  card.className = 'cw-link-card'

  const url = document.createElement('span')
  url.className = 'cw-link-card__url'
  url.textContent = message.linkPreview?.url || message.text || ''
  card.append(url)

  const preview = message.linkPreview
  if (preview && (preview.title || preview.description || preview.image || preview.siteName)) {
    const body = document.createElement('div')
    body.className = 'cw-link-card__preview'

    if (preview.image) {
      const image = document.createElement('img')
      image.className = 'cw-link-card__image'
      image.src = preview.image
      image.alt = ''
      body.append(image)
    }

    const copy = document.createElement('div')
    copy.className = 'cw-link-card__copy'

    if (preview.siteName) {
      const site = document.createElement('span')
      site.className = 'cw-link-card__site'
      site.textContent = preview.siteName
      copy.append(site)
    }
    if (preview.title) {
      const title = document.createElement('strong')
      title.className = 'cw-link-card__title'
      title.textContent = preview.title
      copy.append(title)
    }
    if (preview.description) {
      const description = document.createElement('span')
      description.className = 'cw-link-card__description'
      description.textContent = preview.description
      copy.append(description)
    }

    body.append(copy)
    card.append(body)
  }

  row.append(card)
  return row
}
