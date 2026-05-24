import { beforeEach, describe, expect, it, vi } from 'vitest';
import { personaStore } from './personaStore';

beforeEach(() => {
  window.localStorage.clear();
});

describe('personaStore', () => {
  it('returns null when nothing is stored', () => {
    expect(personaStore.getId()).toBeNull();
  });

  it('persists the id in localStorage when set', () => {
    personaStore.setId('user-123');
    expect(personaStore.getId()).toBe('user-123');
    expect(window.localStorage.getItem(personaStore.STORAGE_KEY)).toBe(
      'user-123'
    );
  });

  it('reads the id from localStorage on a fresh getId call', () => {
    window.localStorage.setItem(personaStore.STORAGE_KEY, 'pre-loaded');
    expect(personaStore.getId()).toBe('pre-loaded');
  });

  it('clears the id when set to null or empty string', () => {
    personaStore.setId('user-1');
    personaStore.setId(null);
    expect(personaStore.getId()).toBeNull();
    expect(window.localStorage.getItem(personaStore.STORAGE_KEY)).toBeNull();

    personaStore.setId('user-2');
    personaStore.setId('');
    expect(personaStore.getId()).toBeNull();
  });

  it('notifies subscribers when the id changes', () => {
    const listener = vi.fn();
    const unsubscribe = personaStore.subscribe(listener);

    personaStore.setId('user-1');
    personaStore.setId('user-2');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    personaStore.setId('user-3');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify subscribers when set to the current value', () => {
    personaStore.setId('user-1');
    const listener = vi.fn();
    personaStore.subscribe(listener);

    personaStore.setId('user-1');
    expect(listener).not.toHaveBeenCalled();
  });
});
