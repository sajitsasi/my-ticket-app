import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ticket-app:persona-id';

type Listener = () => void;

const listeners = new Set<Listener>();

function safeGet(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSet(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    /* ignore */
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const personaStore = {
  getId(): string | null {
    return safeGet();
  },
  setId(id: string | null): void {
    const next = id && id.length > 0 ? id : null;
    if (safeGet() === next) {
      return;
    }
    safeSet(next);
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  STORAGE_KEY,
};

export function usePersonaId(): string | null {
  return useSyncExternalStore(
    personaStore.subscribe,
    personaStore.getId,
    () => null
  );
}
