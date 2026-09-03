import type { SupabasePort } from './port.js';
import { requireData } from './port.js';

export interface AdminAccountInput {
  name: string;
  username: string;
  password: string;
}

export interface AdminDirectoryGroup {
  id: string;
  name: string;
  profileIds: string[];
}

interface AdminDirectoryGroupRow {
  group_id: string;
  name: string;
  profile_ids?: string[] | null;
}

export class SupabaseAdminDirectoryService {
  constructor(private readonly port: SupabasePort) {}

  async loadGroups(): Promise<AdminDirectoryGroup[]> {
    const rows = requireData(await this.port.rpc<AdminDirectoryGroupRow[]>('chat_admin_list_directory_groups'), 'admin directory groups');
    return rows.map((row) => ({ id: row.group_id, name: row.name, profileIds: [...(row.profile_ids ?? [])] }));
  }

  async createGroup(name: string): Promise<void> {
    requireData(await this.port.rpc<unknown>('chat_admin_create_directory_group', { p_name: name }), 'create directory group');
  }

  async deleteGroup(groupId: string): Promise<void> {
    requireData(await this.port.rpc<boolean>('chat_admin_delete_directory_group', { p_group_id: groupId }), 'delete directory group');
  }

  async assignGroup(profileId: string, groupId: string | null): Promise<void> {
    requireData(await this.port.rpc<boolean>('chat_admin_assign_directory_group', { p_target_profile_id: profileId, p_group_id: groupId }), 'assign directory group');
  }

  async createCustomer(input: AdminAccountInput): Promise<void> {
    await this.#invoke({ action: 'create_user2', displayName: input.name, username: input.username, password: input.password });
  }

  async promoteGuest(profileId: string, input: AdminAccountInput): Promise<void> {
    await this.#invoke({ action: 'upgrade_guest', profileId, displayName: input.name, username: input.username, password: input.password });
  }

  async updateCustomer(profileId: string, input: AdminAccountInput): Promise<void> {
    await this.#invoke({ action: 'update_user2', profileId, displayName: input.name, username: input.username });
    const password = input.password.trim();
    if (password && password !== '••••••') await this.#invoke({ action: 'reset_password', profileId, password });
  }

  async deleteContact(profileId: string): Promise<void> {
    await this.#invoke({ action: 'delete_user', profileId });
  }

  async #invoke(body: Record<string, unknown>): Promise<void> {
    requireData(await this.port.functions.invoke<{ ok?: boolean }>('taphoaxyz-admin-user', body), 'admin directory');
  }
}
