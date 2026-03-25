export interface ClawEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  timestamp: string;
}

export type EventListener<TPayload = unknown> = (event: ClawEvent<TPayload>) => void;

export class ClawEventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly iterators = new Map<string, Set<(event: ClawEvent) => void>>();

  emit<TPayload>(type: string, payload: TPayload): void {
    const event: ClawEvent<TPayload> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    for (const listener of this.listeners.get("*") ?? []) {
      listener(event);
    }
    for (const push of this.iterators.get(type) ?? []) {
      push(event);
    }
    for (const push of this.iterators.get("*") ?? []) {
      push(event);
    }
  }

  on(type: string, listener: EventListener): () => void {
    const bucket = this.listeners.get(type) ?? new Set<EventListener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  iterate(type = "*"): AsyncIterable<ClawEvent> {
    const queue: ClawEvent[] = [];
    let resolveNext: ((value: IteratorResult<ClawEvent>) => void) | null = null;

    const bucket = this.iterators.get(type) ?? new Set<(event: ClawEvent) => void>();
    const push = (event: ClawEvent) => {
      if (resolveNext) {
        const currentResolve = resolveNext;
        resolveNext = null;
        currentResolve({ value: event, done: false });
        return;
      }
      queue.push(event);
    };

    bucket.add(push);
    this.iterators.set(type, bucket);

    const close = () => {
      const activeBucket = this.iterators.get(type);
      activeBucket?.delete(push);
      if (activeBucket?.size === 0) {
        this.iterators.delete(type);
      }
      if (resolveNext) {
        const currentResolve = resolveNext;
        resolveNext = null;
        currentResolve({ value: undefined, done: true });
      }
    };

    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            if (queue.length > 0) {
              const event = queue.shift();
              return { value: event, done: false } as IteratorResult<ClawEvent>;
            }

            return new Promise<IteratorResult<ClawEvent>>((resolve) => {
              resolveNext = resolve;
            });
          },
          return: async () => {
            close();
            return { value: undefined, done: true };
          },
          throw: async (error?: unknown) => {
            close();
            throw error;
          },
        };
      },
    };
  }
}
