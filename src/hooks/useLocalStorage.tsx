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

  return { get, set };
}
