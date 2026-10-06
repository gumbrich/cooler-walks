/** Consume the same model as the synchronous checks, yielding real event-loop
 * tasks so worker messages can cancel obsolete calculations. Microtasks alone
 * would keep input messages waiting until the entire route has finished. */
export async function runCalculation<T>(
  steps: Generator<void, T, void>,
  cancelled: () => boolean,
): Promise<T> {
  const channel = new MessageChannel();
  const resume = () =>
    new Promise<void>((resolve) => {
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
  let started = performance.now();
  try {
    for (;;) {
      if (cancelled()) throw new DOMException('Superseded route', 'AbortError');
      const step = steps.next();
      if (step.done) return step.value;
      if (performance.now() - started >= 16) {
        await resume();
        started = performance.now();
      }
    }
  } finally {
    steps.return(undefined as T);
    channel.port1.close();
    channel.port2.close();
  }
}
