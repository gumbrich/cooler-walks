import { cityForArea } from './area-specs';
import type { AreaDescriptor, AreaPayload } from './area-types';
const packageLimit = 80 * 1024 * 1024;
const expandedLimit = 200 * 1024 * 1024;

export async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  max: number,
  signal?: AbortSignal,
  progress?: (bytes: number) => void,
) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) throw new Error('The area file is larger than expected');
      chunks.push(value);
      progress?.(length);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function decodeArea(bytes: Uint8Array, area: AreaDescriptor): Promise<AreaPayload> {
  if (
    bytes.length !== area.bytes ||
    bytes.length > packageLimit ||
    area.expandedBytes > expandedLimit
  )
    throw new Error('The area download is incomplete');
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const hash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  if (hash !== area.sha256)
    throw new Error('The download could not be verified. Please try again.');
  const output = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const expanded = await boundedBytes(output, area.expandedBytes);
  if (expanded.length !== area.expandedBytes)
    throw new Error('The area file has an unexpected size');
  const value = JSON.parse(new TextDecoder().decode(expanded)) as AreaPayload;
  const expected = cityForArea(area);
  if (
    value.schema !== 1 ||
    value.areaId !== area.id ||
    value.data?.cityId !== area.cityId ||
    value.data.version !== area.version ||
    JSON.stringify(value.data.bounds) !== JSON.stringify(expected.bounds) ||
    !Array.isArray(value.data.nodes) ||
    !Array.isArray(value.data.edges) ||
    !value.data.places?.length ||
    !Array.isArray(value.data.water) ||
    value.map?.type !== 'FeatureCollection' ||
    !Array.isArray(value.map.features)
  )
    throw new Error('This area is not compatible with this app');
  return value;
}
