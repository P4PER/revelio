/**
 * Maps over `items` with at most `limit` calls of `fn` running at once,
 * resolving to the results in input order.
 *
 * Here rather than in each caller because both painters of the deck sheet load
 * card images this way, and the cap is what keeps a per-image timeout
 * meaningful: with every request started at once they share the connection, so
 * a wall-clock timeout measures the whole queue instead of one image and a
 * large deck can time out wholesale. Work that has not started yet has no timer
 * running.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
