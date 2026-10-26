// sync.js — offline-first sync queue logic for Strumio
// Stores pending operations in localStorage and flushes them when online.

const QUEUE_KEY = "strumio_sync_queue_v1";

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw);
    return Array.isArray(q) ? q : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q || [])); } catch (e) {}
}

export function getQueue() {
  return readQueue();
}

export function getQueueSize() {
  return readQueue().length;
}

export function clearQueue() {
  writeQueue([]);
}

/**
 * Enqueue an operation. op: { type, payload, ... }
 * Returns the queued operation with id/timestamps.
 */
export function enqueue(op) {
  if (!op || typeof op !== "object") throw new Error("enqueue requires an object");
  const queue = readQueue();
  const item = {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2),
    type: op.type || "unknown",
    payload: op.payload !== undefined ? op.payload : op,
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  // strip our own meta from payload if duplicated
  queue.push(item);
  writeQueue(queue);
  try { window.dispatchEvent(new CustomEvent("strumio:queue-changed", { detail: { size: queue.length } })); } catch (e) {}
  return item;
}

/**
 * Remove an operation by id.
 */
export function remove(id) {
  const queue = readQueue().filter(o => o.id !== id);
  writeQueue(queue);
}

/**
 * Flush the queue using a handler(op) that returns truthy on success.
 * Stops on persistent errors? We keep failed ops for retry.
 */
export async function flush(handler) {
  if (typeof handler !== "function") throw new Error("flush requires a handler function");
  const queue = readQueue();
  if (!queue.length) return { processed: 0, remaining: 0, failed: 0 };

  const remaining = [];
  let processed = 0;
  let failed = 0;
  for (const op of queue) {
    op.attempts = (op.attempts || 0) + 1;
    op.updatedAt = Date.now();
    try {
      const ok = await handler(op);
      if (ok === false) throw new Error("handler returned false");
      processed += 1;
    } catch (e) {
      failed += 1;
      // drop ops that have failed too many times to avoid infinite loops
      if (op.attempts < 8) remaining.push(op);
    }
  }
  writeQueue(remaining);
  try { window.dispatchEvent(new CustomEvent("strumio:queue-changed", { detail: { size: remaining.length } })); } catch (e) {}
  return { processed, remaining: remaining.length, failed };
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
}

export function onOnline(cb) {
  if (typeof window !== "undefined") window.addEventListener("online", cb);
  return () => { if (typeof window !== "undefined") window.removeEventListener("online", cb); };
}

export function onOffline(cb) {
  if (typeof window !== "undefined") window.addEventListener("offline", cb);
  return () => { if (typeof window !== "undefined") window.removeEventListener("offline", cb); };
}

export function onQueueChange(cb) {
  if (typeof window !== "undefined") window.addEventListener("strumio:queue-changed", (e) => cb(e.detail));
  return () => { if (typeof window !== "undefined") window.removeEventListener("strumio:queue-changed", cb); };
}

export default {
  getQueue, getQueueSize, clearQueue, enqueue, remove, flush, isOnline, onOnline, onOffline, onQueueChange
};
