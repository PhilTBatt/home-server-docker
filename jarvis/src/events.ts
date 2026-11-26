export type Events<Value> = { push: (value: Value) => void; end: () => void; events: AsyncIterable<Value> };

export function createEvents<Value>(): Events<Value> {
  const waiting: Value[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  const stir = () => {
    const waiter = wake;
    wake = null;
    waiter?.();
  };
  return {
    push(value) {
      if (ended) return;
      waiting.push(value);
      stir();
    },
    end() {
      ended = true;
      stir();
    },
    events: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (waiting.length > 0) yield waiting.shift() as Value;
          if (ended) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
    },
  };
}

export async function* merged<Value>(...sources: AsyncIterable<Value>[]): AsyncGenerator<Value> {
  const readers = sources.map((source) => source[Symbol.asyncIterator]());
  const pending = new Map<number, Promise<{ from: number; result: IteratorResult<Value> }>>();
  const ask = (from: number) =>
    pending.set(
      from,
      readers[from].next().then(
        (result) => ({ from, result }),
        () => ({ from, result: { done: true as const, value: undefined } }),
      ),
    );
  readers.forEach((_reader, from) => ask(from));
  try {
    while (pending.size > 0) {
      const { from, result } = await Promise.race(pending.values());
      if (result.done === true) pending.delete(from);
      else {
        ask(from);
        yield result.value;
      }
    }
  } finally {
    for (const reader of readers) void reader.return?.(undefined)?.catch(() => {});
  }
}
