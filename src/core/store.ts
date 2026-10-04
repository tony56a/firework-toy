type Listener<T> = (state: Readonly<T>, changed: ReadonlyArray<keyof T>) => void;

/** Tiny observable state container. `set` only notifies about keys that actually changed. */
export class Store<T extends object> {
  private listeners = new Set<Listener<T>>();

  constructor(private state: T) {}

  get(): Readonly<T> {
    return this.state;
  }

  set(patch: Partial<T>): void {
    const changed = (Object.keys(patch) as Array<keyof T>).filter(
      (k) => patch[k] !== undefined && patch[k] !== this.state[k],
    );
    if (changed.length === 0) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state, changed));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
