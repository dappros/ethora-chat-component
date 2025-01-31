import { useState } from 'react';

export function useLocalStorage<T>(key: string) {
  const get = (): T | null => {
    const storedValue = localStorage.getItem(key);
    if (!storedValue) return null;
    try {
      return JSON.parse(storedValue) as T;
    } catch (error) {
      console.error('Failed to parse localStorage value', error);
      return null;
    }
  };

  const set = (value: T) => {
    try {
      const stringValue = JSON.stringify(value);
      localStorage.setItem(key, stringValue);
    } catch (error) {
      console.error('Failed to store value in localStorage', error);
    }
  };

  const update = (updates: Partial<T>) => {
    const currentValue = get();
    if (currentValue) {
      const newValue = { ...currentValue, ...updates };
      set(newValue);
    } else {
      console.warn('No existing data found, initializing with updates.');
      set(updates as T);
    }
  };

  return { get, set, update };
}
