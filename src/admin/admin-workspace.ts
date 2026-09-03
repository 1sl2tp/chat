import type { Store } from '../app/store.js';
import type { Contact } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import { DirectoryScreen, type DirectoryManagement } from '../directory/directory-screen.js';
import { ChatScreen } from '../chat/chat-screen.js';
import type { ChatConversationSource } from '../chat/live-conversation.js';

export interface AdminWorkspaceCallbacks {
  localParticipantId?: string;
  conversationSourceFor?: (contact: Contact) => ChatConversationSource | undefined;
  directoryManagement?: DirectoryManagement;
  onDirectoryChanged?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  onPeerChange: (contact: Contact) => void;
  onCallBack: (contact: Contact) => void;
  onError?: (error: Error) => void;
}

export class AdminWorkspace {
  #root: HTMLElement | null = null;
  #directory: DirectoryScreen | null = null;
  #chat: ChatScreen | null = null;
  #chatPane: HTMLElement | null = null;
  #selected: Contact | null = null;

  constructor(
    private readonly store: Store,
    private readonly overlays: OverlayManager,
    private readonly callbacks: AdminWorkspaceCallbacks
  ) {}

  mount(initial: Contact | null): HTMLElement {
    const root = document.createElement('section');
    root.className = 'screen admin-workspace';
    const directoryPane = document.createElement('aside');
    directoryPane.className = 'admin-directory-pane';
    const chatPane = document.createElement('section');
    chatPane.className = 'admin-chat-pane';

    this.#directory = new DirectoryScreen(this.store, this.overlays, {
      onOpenContact: (contact) => this.select(contact),
      management: this.callbacks.directoryManagement,
      onManagedChange: this.callbacks.onDirectoryChanged,
      onSignOut: this.callbacks.onSignOut,
      onError: this.callbacks.onError
    });
    directoryPane.append(this.#directory.mount());
    root.append(directoryPane, chatPane);
    this.#root = root;
    this.#chatPane = chatPane;

    if (initial) this.select(initial);
    else chatPane.innerHTML = '<div class="admin-chat-empty">Chọn một liên hệ để mở chat</div>';
    return root;
  }

  select(contact: Contact): void {
    if (!this.#chatPane) return;
    this.#chat?.unmount();
    this.#selected = contact;
    this.#chat = new ChatScreen(this.store, this.overlays, contact, {
      localParticipantId: this.callbacks.localParticipantId ?? 'admin',
      conversationSource: this.callbacks.conversationSourceFor?.(contact),
      onCallBack: () => this.callbacks.onCallBack(contact),
      onError: this.callbacks.onError
    });
    this.#chatPane.replaceChildren(this.#chat.mount());
    this.store.state.activeContactId = contact.id;
    this.store.state.route = 'chat';
    this.callbacks.onPeerChange(contact);
  }

  openMedia(): void { this.#chat?.openMedia(); }
  get selected(): Contact | null { return this.#selected; }
  get chat(): ChatScreen | null { return this.#chat; }

  unmount(): void {
    this.#directory?.unmount();
    this.#chat?.unmount();
    this.#directory = null;
    this.#chat = null;
    this.#chatPane = null;
    this.#selected = null;
    this.#root = null;
  }
}
