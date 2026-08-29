/**
 * /peer/pull sizing guards.
 *
 * Historically the endpoint allowed up to 2000 sync_outbox rows WITH the full
 * JSON payload in a single response — enough to OOM / time out the edge
 * function (502s). Limits are now conservative and the response is additionally
 * capped by serialized byte size, so a few very large payload rows can never
 * blow up the worker.
 *
 * Protocol compatibility: request shape is unchanged (`since_id`, optional
 * `limit`), response still returns `{ changes, next_since_id }`. A client that
 * asks for more than the cap simply receives fewer rows and keeps paging with
 * `next_since_id` — which every existing client already does.
 */
export const PULL_DEFAULT_LIMIT = 200;
export const PULL_MAX_LIMIT = 500;
/** ~4 MB of serialized changes per response. */
export const PULL_MAX_BYTES = 4 * 1024 * 1024;

export const resolvePullLimit = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return PULL_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), PULL_MAX_LIMIT);
};

/**
 * Trim a page so the serialized response stays under `maxBytes`.
 * Always keeps at least one row so a single oversized row still makes
 * progress (the client advances `next_since_id` and never stalls).
 */
export const capChangesByBytes = <T,>(rows: T[], maxBytes = PULL_MAX_BYTES): T[] => {
  const out: T[] = [];
  let bytes = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length;
    if (out.length && bytes + size > maxBytes) break;
    out.push(r);
    bytes += size;
  }
  return out;
};
