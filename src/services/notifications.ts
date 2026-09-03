export interface NotificationItem {
  text: string;
  detail?: string;
}

export class NotificationQueue {
  #blocked = false;
  #items: NotificationItem[] = [];

  constructor(private readonly present: (item: NotificationItem) => void) {}

  notify(item: NotificationItem): void {
    if (this.#blocked) {
      this.#items.push(item);
      return;
    }
    this.present(item);
  }

  setBlocked(blocked: boolean): void {
    this.#blocked = blocked;
    if (!blocked) this.flushOne();
  }

  flushOne(): void {
    if (this.#blocked) return;
    const item = this.#items.shift();
    if (item) this.present(item);
  }

  clear(): void { this.#items = []; }
}
