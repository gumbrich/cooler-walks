import { afterEach, expect, it, vi } from 'vitest';
import { runCalculation } from '../src/lib/calculation';

afterEach(() => vi.restoreAllMocks());

it('lets an external message cancel CPU work and closes the interrupted calculation', async () => {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (elapsed += 17));
  const input = new MessageChannel();
  let cancelled = false;
  let visited = 0;
  let closed = false;
  input.port1.onmessage = () => {
    cancelled = true;
  };
  input.port2.postMessage('new trip');
  function* work() {
    try {
      for (; visited < 1000; visited++) yield;
      return 'obsolete result';
    } finally {
      closed = true;
    }
  }
  try {
    await expect(runCalculation(work(), () => cancelled)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(visited).toBeLessThan(1000);
    expect(closed).toBe(true);
  } finally {
    input.port1.close();
    input.port2.close();
  }
});

it('does not enter an already cancelled calculation and preserves model errors', async () => {
  let entered = false;
  function* work(): Generator<void, string, void> {
    entered = true;
    throw new Error('missing coverage');
  }
  await expect(runCalculation(work(), () => true)).rejects.toMatchObject({ name: 'AbortError' });
  expect(entered).toBe(false);
  await expect(runCalculation(work(), () => false)).rejects.toThrow('missing coverage');
});
