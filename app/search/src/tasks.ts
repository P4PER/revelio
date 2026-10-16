import type { EnqueuedTaskPromise, Task, WaitOptions } from 'meilisearch'

// waitTask() resolves once a task stops running, whatever its outcome: a task
// Meilisearch rejected comes back with status 'failed' rather than as an error,
// so a caller that only awaits it reports success over an unchanged index.
export async function waitForSuccess(
  enqueued: EnqueuedTaskPromise,
  options?: WaitOptions,
): Promise<Task> {
  const task = await enqueued.waitTask(options)
  if (task.status !== 'succeeded') {
    const reason = task.error ? `${task.error.code}: ${task.error.message}` : task.status
    throw new Error(`Meilisearch task ${task.uid} (${task.type}) ${task.status}: ${reason}`)
  }
  return task
}
