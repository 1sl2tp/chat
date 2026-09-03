import type { RouteName } from './types.js';

export interface RouteState {
  name: RouteName;
  contactId: string | null;
}

export class Router {
  #listeners = new Set<(route: RouteState) => void>();
  #route: RouteState;

  constructor(initial: RouteState) {
    this.#route = initial;
  }

  get current(): RouteState {
    return this.#route;
  }

  subscribe(listener: (route: RouteState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  navigate(next: RouteState): void {
    if (this.#route.name === next.name && this.#route.contactId === next.contactId) return;
    this.#route = next;
    for (const listener of this.#listeners) listener(this.#route);
  }
}
