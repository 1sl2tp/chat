import type { Contact } from '../app/types.js';
import { formatDirectoryTime } from '../utils/time.js';
import { icon } from '../ui/icons.js';
import { contactActionLabels } from './contact-actions.js';

export interface ContactRowHandlers {
  onOpen: (contact: Contact) => void;
  onAction: (contact: Contact, action: 'create' | 'edit' | 'group' | 'delete') => void;
}

export function createContactRow(contact: Contact, handlers: ContactRowHandlers): HTMLElement {
  const row = document.createElement('article');
  row.className = 'contact-row';
  row.dataset.contactId = contact.id;
  row.innerHTML = `
    <button class="contact-identity" data-open type="button">
      <span class="avatar m">${escapeHtml(contact.initials)}</span>
      <span class="contact-copy">
        <strong>${escapeHtml(contact.name)}</strong>
        <small>${escapeHtml(contact.lastMessage)}</small>
      </span>
    </button>
    <div class="contact-right" data-contact-right>
      <div class="contact-meta" data-meta>
        <span class="unread-slot">${contact.unread > 0 ? `<b>${Math.min(99, contact.unread)}</b>` : ''}</span>
        <time>${escapeHtml(formatDirectoryTime(new Date(contact.lastMessageAt)))}</time>
        <button class="icon-button compact" data-more type="button" aria-label="Hành động">${icon('more')}</button>
      </div>
      <div class="contact-actions" data-actions aria-hidden="true">
        ${actionButtons(contact)}
      </div>
    </div>`;

  row.querySelector<HTMLButtonElement>('[data-open]')?.addEventListener('click', () => {
    if (row.classList.contains('actions-open')) return;
    handlers.onOpen(contact);
  });
  row.querySelector<HTMLButtonElement>('[data-more]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleContactActions(row, true);
  });
  row.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = button.dataset.action as 'create' | 'edit' | 'group' | 'delete';
      handlers.onAction(contact, action);
    });
  });

  bindRowSwipe(row);
  return row;
}

export function toggleContactActions(row: HTMLElement, open: boolean): void {
  row.classList.toggle('actions-open', open);
  row.querySelector<HTMLElement>('[data-actions]')?.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function actionButtons(contact: Contact): string {
  const labels = contactActionLabels(contact.accountType);
  if (contact.accountType === 'guest') {
    return `<button data-action="create" type="button">${icon('plus')}<span>${labels[0]}</span></button><button class="danger" data-action="delete" type="button">${icon('trash')}<span>${labels[1]}</span></button>`;
  }
  return `<button data-action="edit" type="button">${icon('edit')}<span>${labels[0]}</span></button><button data-action="group" type="button">${icon('group')}<span>${labels[1]}</span></button><button class="danger" data-action="delete" type="button">${icon('trash')}<span>${labels[2]}</span></button>`;
}

function bindRowSwipe(row: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let active = false;
  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.clientX <= 24) return;
    startX = event.clientX;
    startY = event.clientY;
    active = true;
  });
  row.addEventListener('pointerup', (event) => {
    if (!active) return;
    active = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < -42) toggleContactActions(row, true);
    else if (dx > 28) toggleContactActions(row, false);
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
