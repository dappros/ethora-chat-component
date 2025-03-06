export class PriorityQueue<T> {
  private items: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compareFunction: (a: T, b: T) => number) {
    this.compare = compareFunction;
  }

  push(item: T): void {
    this.items.push(item);
    this.items.sort(this.compare);
  }

  //should take variable size, so it could pop more than 1 item
  pop(size: number = 1): T[] {
    const poppedItems = this.items.splice(0, size);
    return poppedItems;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  clear(): void {
    this.items = [];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.items.find(predicate);
  }

  toArray(): T[] {
    return [...this.items];
  }

  contains(predicate: (item: T) => boolean): boolean {
    return this.items.some(predicate);
  }
}
