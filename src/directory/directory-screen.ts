import type { Store } from '../app/store.js';
import { addCustomer, addCustomerGroup, assignCustomerGroup, bulkDeleteGuests, deleteContact, deleteCustomerGroup, promoteGuest, updateCustomer } from '../app/store.js';
import type { Contact } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import { destructiveConfirmCopy } from '../app/overlay-manager.js';
import { icon } from '../ui/icons.js';
import { filterContacts } from './contact-actions.js';
import { createContactRow, toggleContactActions } from './contact-row.js';

export interface DirectoryManagement {
  createCustomer(input: { name: string; username: string; password: string }): Promise<void>;
  promoteGuest(profileId: string, input: { name: string; username: string; password: string }): Promise<void>;
  updateCustomer(profileId: string, input: { name: string; username: string; password: string }): Promise<void>;
  deleteContact(profileId: string): Promise<void>;
  createGroup(name: string): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  assignGroup(profileId: string, groupId: string | null): Promise<void>;
}

export interface DirectoryCallbacks {
  onOpenContact: (contact: Contact) => void;
  management?: DirectoryManagement;
  onManagedChange?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  onError?: (error: Error) => void;
}

export class DirectoryScreen {
  #root: HTMLElement | null = null;
  #outsidePointer = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest('.contact-row, .contact-inline-group, .directory-quick-create')) return;
    this.closeRowActions();
    this.closeInlineGroup();
  };

  constructor(private readonly store: Store, private readonly overlays: OverlayManager, private readonly callbacks: DirectoryCallbacks) {}

  mount(): HTMLElement {
    const root = document.createElement('section');
    root.className = 'screen directory-screen';
    root.innerHTML = `
      <div class="directory-toolbar">
        <div class="group-tabs" data-tabs></div>
        <button class="icon-button" data-create-menu aria-label="Thêm">${icon('plus')}</button>
        <button class="icon-button" data-manage aria-label="Quản lý danh bạ">${icon('more')}</button>
      </div>
      <div class="directory-quick-create" data-quick-create hidden></div>
      <label class="directory-search"><span class="search-icon">${icon('search')}</span><input type="search" autocomplete="off" placeholder="Tìm khách hàng..." value="${escapeAttr(this.store.state.directorySearch)}" /></label>
      <div class="directory-list" data-list></div>`;
    this.#root = root;
    root.querySelector<HTMLInputElement>('.directory-search input')?.addEventListener('input', (event) => {
      this.store.state.directorySearch = (event.target as HTMLInputElement).value;
      this.paintList();
    });
    root.querySelector<HTMLButtonElement>('[data-create-menu]')?.addEventListener('click', () => this.toggleQuickCreate());
    root.querySelector<HTMLButtonElement>('[data-manage]')?.addEventListener('click', () => this.openManager());
    this.paintTabs();
    this.paintList();
    document.addEventListener('pointerdown', this.#outsidePointer, true);
    requestAnimationFrame(() => {
      const list = root.querySelector<HTMLElement>('[data-list]');
      if (list) list.scrollTop = this.store.state.directoryScrollTop;
    });
    return root;
  }

  unmount(): void {
    const list = this.#root?.querySelector<HTMLElement>('[data-list]');
    if (list) this.store.state.directoryScrollTop = list.scrollTop;
    document.removeEventListener('pointerdown', this.#outsidePointer, true);
    this.#root = null;
  }

  paintTabs(): void {
    const host = this.#root?.querySelector<HTMLElement>('[data-tabs]');
    if (!host) return;
    const groups = this.store.state.groups.filter((group) => group.id !== 'guest');
    const allTabs = [...groups, { id: 'guest', name: 'Vãng lai', builtIn: true }];
    host.replaceChildren(...allTabs.map((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `group-tab${this.store.state.directoryFilter === group.id ? ' active' : ''}`;
      button.textContent = group.name;
      button.addEventListener('click', () => {
        this.store.state.directoryFilter = group.id;
        this.paintTabs();
        this.paintList();
      });
      return button;
    }));
  }

  paintList(): void {
    const host = this.#root?.querySelector<HTMLElement>('[data-list]');
    if (!host) return;
    const items = filterContacts(this.store.state.contacts, this.store.state.directoryFilter, this.store.state.directorySearch);
    const nodes: HTMLElement[] = [];
    for (const contact of items) {
      let row!: HTMLElement;
      row = createContactRow(contact, {
        onOpen: (item) => this.callbacks.onOpenContact(item),
        onAction: (item, action) => {
          if (action === 'create') this.openPromote(item);
          else if (action === 'edit') this.openEdit(item);
          else if (action === 'group') this.openInlineGroup(item, row);
          else this.confirmDeleteContact(item);
        }
      });
      nodes.push(row);
    }
    host.replaceChildren(...nodes);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Không có liên hệ';
      host.append(empty);
    }
  }

  closeRowActions(): void {
    this.#root?.querySelectorAll<HTMLElement>('.contact-row.actions-open').forEach((row) => toggleContactActions(row, false));
  }

  closeInlineGroup(): void {
    this.#root?.querySelector<HTMLElement>('.contact-inline-group')?.remove();
  }

  private toggleQuickCreate(): void {
    const host = this.#root?.querySelector<HTMLElement>('[data-quick-create]');
    if (!host) return;
    if (!host.hidden) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    host.innerHTML = `<button type="button" data-quick-customer>${icon('plus')}<span>Thêm KH</span></button><button type="button" data-quick-group>${icon('group')}<span>Thêm nhóm</span></button>`;
    host.querySelector<HTMLButtonElement>('[data-quick-customer]')?.addEventListener('click', () => { host.hidden = true; this.openAddCustomer(); });
    host.querySelector<HTMLButtonElement>('[data-quick-group]')?.addEventListener('click', () => this.paintQuickGroupForm(host));
  }

  private paintQuickGroupForm(host: HTMLElement): void {
    host.innerHTML = `<form class="directory-quick-group-form" data-quick-group-form><input name="group" placeholder="Tên nhóm..." required /><button class="button secondary" type="submit">Tạo</button></form>`;
    const input = host.querySelector<HTMLInputElement>('input');
    input?.focus();
    host.querySelector<HTMLFormElement>('[data-quick-group-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const name = String(new FormData(form).get('group') ?? '');
      void this.createManagedGroup(name, host);
    });
  }

  openManager(): void {
    const content = document.createElement('div');
    content.className = 'manager-sheet';
    const customGroups = this.store.state.groups.filter((group) => !group.builtIn);
    const guestCount = this.store.state.contacts.filter((contact) => contact.accountType === 'guest').length;
    content.innerHTML = `
      <div class="group-manager-list">${customGroups.length ? customGroups.map((group) => `<div><span>${escapeHtml(group.name)}</span><button class="icon-button compact" data-delete-group="${escapeAttr(group.id)}" aria-label="Xóa nhóm">${icon('trash')}</button></div>`).join('') : '<div><span>Chưa có nhóm riêng</span></div>'}</div>
      <button class="manager-action danger" data-delete-guests ${guestCount ? '' : 'disabled'}>${icon('trash')}<span>Xóa Vãng lai · ${guestCount}</span></button>
      ${this.callbacks.onSignOut ? `<button class="manager-action" data-logout>${icon('logout')}<span>Đăng xuất</span></button>` : ''}`;
    const id = this.overlays.openSheet({ title: 'Quản lý', content });
    content.querySelectorAll<HTMLButtonElement>('[data-delete-group]').forEach((button) => button.addEventListener('click', () => {
      const groupId = button.dataset.deleteGroup ?? '';
      const group = this.store.state.groups.find((item) => item.id === groupId);
      if (!group) return;
      const copy = destructiveConfirmCopy(`nhóm ${group.name}`);
      this.overlays.openConfirm({ ...copy, onConfirm: () => { void this.deleteManagedGroup(groupId, id); }});
    }));
    content.querySelector<HTMLButtonElement>('[data-delete-guests]')?.addEventListener('click', () => {
      const copy = destructiveConfirmCopy('toàn bộ Vãng lai');
      this.overlays.openConfirm({ ...copy, onConfirm: () => { void this.deleteAllGuests(id); }});
    });
    content.querySelector<HTMLButtonElement>('[data-logout]')?.addEventListener('click', () => {
      this.overlays.close(id);
      void this.callbacks.onSignOut?.();
    });
  }

  openAddCustomer(): void {
    this.openAccountForm({ title: 'Thêm KH', name: '', username: '', password: '', submit: 'Tạo', passwordRequired: true, onSubmit: async (values) => {
      if (this.callbacks.management) {
        await this.callbacks.management.createCustomer(values);
        await this.callbacks.onManagedChange?.();
      } else {
        addCustomer(this.store.state, values);
      }
      this.store.state.directoryFilter = 'customer';
      this.paintTabs(); this.paintList();
    }});
  }

  openPromote(contact: Contact): void {
    this.openAccountForm({ title: 'Tạo khách hàng', name: contact.name, username: '', password: '', submit: 'Tạo', passwordRequired: true, onSubmit: async (values) => {
      if (this.callbacks.management) {
        await this.callbacks.management.promoteGuest(contact.id, values);
        await this.callbacks.onManagedChange?.();
      } else {
        contact.name = values.name;
        promoteGuest(this.store.state, contact.id, { username: values.username, password: values.password });
      }
      this.store.state.directoryFilter = 'customer';
      this.paintTabs(); this.paintList();
    }});
  }

  openEdit(contact: Contact): void {
    this.openAccountForm({ title: 'Sửa khách hàng', name: contact.name, username: contact.username ?? '', password: contact.password ?? '', submit: 'Lưu', passwordRequired: !this.callbacks.management, onSubmit: async (values) => {
      if (this.callbacks.management) {
        await this.callbacks.management.updateCustomer(contact.id, values);
        await this.callbacks.onManagedChange?.();
      } else {
        updateCustomer(this.store.state, contact.id, values);
      }
      this.paintList();
    }});
  }

  openGroup(contact: Contact): void {
    if (contact.accountType !== 'customer') return;
    const content = document.createElement('div');
    content.className = 'choice-list';
    const groups = this.store.state.groups.filter((group) => group.id !== 'guest');
    let sheetId = '';
    for (const group of groups) {
      const button = this.groupChoiceButton(contact, group.id, group.name, () => { this.overlays.close(sheetId); this.paintList(); });
      content.append(button);
    }
    sheetId = this.overlays.openSheet({ title: 'Nhóm', content });
  }

  private openInlineGroup(contact: Contact, row: HTMLElement): void {
    if (contact.accountType !== 'customer') return;
    this.closeRowActions();
    this.closeInlineGroup();
    const panel = document.createElement('div');
    panel.className = 'contact-inline-group';
    panel.innerHTML = `<strong>Nhóm</strong><div data-inline-choices></div>`;
    const choices = panel.querySelector<HTMLElement>('[data-inline-choices]')!;
    for (const group of this.store.state.groups.filter((item) => item.id !== 'guest')) {
      choices.append(this.groupChoiceButton(contact, group.id, group.name, () => panel.remove()));
    }
    row.insertAdjacentElement('afterend', panel);
  }

  private groupChoiceButton(contact: Contact, groupId: string, label: string, after: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    const selected = groupId === 'customer' ? contact.customerGroupId === null : contact.customerGroupId === groupId;
    button.className = selected ? 'selected' : '';
    button.innerHTML = `<span>${escapeHtml(label)}</span><b>${selected ? '✓' : ''}</b>`;
    button.addEventListener('click', () => {
      void this.assignManagedGroup(contact, groupId, after);
    });
    return button;
  }

  confirmDeleteContact(contact: Contact): void {
    const copy = destructiveConfirmCopy(contact.name);
    this.overlays.openConfirm({ ...copy, onConfirm: () => { void this.deleteManagedContact(contact); } });
  }

  private async createManagedGroup(name: string, host: HTMLElement): Promise<void> {
    try {
      if (this.callbacks.management) {
        await this.callbacks.management.createGroup(name);
        await this.callbacks.onManagedChange?.();
      } else {
        addCustomerGroup(this.store.state, name);
      }
      host.hidden = true;
      host.replaceChildren();
      this.paintTabs();
      this.paintList();
    } catch (error) {
      this.callbacks.onError?.(toError(error));
    }
  }

  private async deleteManagedGroup(groupId: string, sheetId: string): Promise<void> {
    try {
      if (this.callbacks.management) {
        await this.callbacks.management.deleteGroup(groupId);
        await this.callbacks.onManagedChange?.();
      } else {
        deleteCustomerGroup(this.store.state, groupId);
      }
      if (this.store.state.directoryFilter === groupId) this.store.state.directoryFilter = 'customer';
      this.overlays.close(sheetId);
      this.paintTabs();
      this.paintList();
    } catch (error) {
      this.callbacks.onError?.(toError(error));
    }
  }

  private async assignManagedGroup(contact: Contact, groupId: string, after: () => void): Promise<void> {
    try {
      if (this.callbacks.management) {
        await this.callbacks.management.assignGroup(contact.id, groupId === 'customer' ? null : groupId);
        await this.callbacks.onManagedChange?.();
      } else {
        assignCustomerGroup(this.store.state, contact.id, groupId);
      }
      this.paintList();
      after();
    } catch (error) {
      this.callbacks.onError?.(toError(error));
    }
  }

  private async deleteManagedContact(contact: Contact): Promise<void> {
    try {
      if (this.callbacks.management) {
        await this.callbacks.management.deleteContact(contact.id);
        await this.callbacks.onManagedChange?.();
      } else {
        deleteContact(this.store.state, contact.id);
      }
      this.paintList();
    } catch (error) {
      this.callbacks.onError?.(toError(error));
    }
  }

  private async deleteAllGuests(sheetId: string): Promise<void> {
    try {
      if (this.callbacks.management) {
        const guests = this.store.state.contacts.filter((contact) => contact.accountType === 'guest');
        for (const contact of guests) await this.callbacks.management.deleteContact(contact.id);
        await this.callbacks.onManagedChange?.();
      } else {
        bulkDeleteGuests(this.store.state);
      }
      if (this.store.state.directoryFilter === 'guest') this.store.state.directoryFilter = 'customer';
      this.overlays.close(sheetId);
      this.paintTabs(); this.paintList();
    } catch (error) {
      this.callbacks.onError?.(toError(error));
    }
  }

  #openAccountSheet(options: { title: string; name: string; username: string; password: string; submit: string; passwordRequired?: boolean; onSubmit: (values: { name: string; username: string; password: string }) => Promise<void> | void }): void {
    const content = document.createElement('form');
    content.className = 'account-form';
    content.innerHTML = `
      <label>Tên<input name="name" value="${escapeAttr(options.name)}" required /></label>
      <label>Tài khoản<input name="username" value="${escapeAttr(options.username)}" required autocomplete="username" /></label>
      <label>Mật khẩu<input name="password" value="${escapeAttr(options.password)}" ${options.passwordRequired === false ? '' : 'required'} autocomplete="new-password" /></label>
      <button class="button" type="submit">${escapeHtml(options.submit)}</button>`;
    const sheetId = this.overlays.openSheet({ title: options.title, content });
    content.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = content.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit?.disabled) return;
      if (submit) submit.disabled = true;
      const data = new FormData(content);
      const values = { name: String(data.get('name') ?? ''), username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') };
      try {
        await options.onSubmit(values);
        this.overlays.close(sheetId);
      } catch (error) {
        if (submit) submit.disabled = false;
        this.callbacks.onError?.(toError(error));
      }
    });
  }

  openAccountForm(options: { title: string; name: string; username: string; password: string; submit: string; passwordRequired?: boolean; onSubmit: (values: { name: string; username: string; password: string }) => Promise<void> | void }): void {
    this.#openAccountSheet(options);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
function escapeAttr(value: string): string { return escapeHtml(value).replace(/`/g, '&#96;'); }
function toError(value: unknown): Error { return value instanceof Error ? value : new Error(String(value)); }
