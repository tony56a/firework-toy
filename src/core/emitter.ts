type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. Subclasses call `emit`; consumers call `on`. */
export class Emitter<E> {
  private handlers: { [K in keyof E]?: Set<Handler<E[K]>> } = {};

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    const set = (this.handlers[type] ??= new Set<Handler<E[K]>>());
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  protected emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.handlers[type]?.forEach((fn) => fn(payload));
  }
}
