import type { AccountType, Contact } from '../app/types.js';

export function contactActionLabels(type: AccountType): string[] {
  return type === 'guest' ? ['Tạo', 'Xóa'] : ['Sửa', 'Nhóm', 'Xóa'];
}

export function filterContacts(contacts: Contact[], filter: string, search: string): Contact[] {
  const q = search.trim().toLocaleLowerCase('vi');
  return contacts.filter((contact) => {
    const matchesFilter = filter === 'customer'
      ? contact.accountType === 'customer'
      : filter === 'guest'
        ? contact.accountType === 'guest'
        : contact.accountType === 'customer' && contact.customerGroupId === filter;
    if (!matchesFilter) return false;
    if (!q) return true;
    return `${contact.name} ${contact.username ?? ''} ${contact.lastMessage}`.toLocaleLowerCase('vi').includes(q);
  });
}
