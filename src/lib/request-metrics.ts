export type RequestMetricModule =
  | "Office"
  | "Finance"
  | "Cage Live"
  | "Cage Slots"
  | "Pit"
  | "Players"
  | "POS"
  | "Dashboard"
  | "Admin"
  | "Other";

export interface RequestMetricBucket {
  bucket_at: string;
  module: RequestMetricModule;
  client_id: string;
  request_count: number;
  error_count: number;
  timeout_count: number;
  total_duration_ms: number;
  max_duration_ms: number;
}

const FLUSH_EVENT = "cms:request-metrics-ready";
const TIMEOUT_MS = 15_000;
const METRICS_RESOURCE = "request_metrics";
const buckets = new Map<string, RequestMetricBucket>();
let installed = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function getClientId(): string {
  const key = "cms:request-metrics-client";
  try {
    const current = sessionStorage.getItem(key);
    if (current) return current;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

const clientId = typeof window !== "undefined" ? getClientId() : "server";

function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function classify(urlValue: string): RequestMetricModule {
  const value = urlValue.toLowerCase();
  if (value.includes(METRICS_RESOURCE)) return "Admin";
  if (/fin_|expenses|expense_categories|bank_checks|payroll|attendance|employee/.test(value)) return "Finance";
  if (/cage_slots|slots_/.test(value)) return "Cage Slots";
  if (/cage_|cash_count|chip_inventory|chip_transfer/.test(value)) return "Cage Live";
  if (/breaklist|dealer|gaming_tables|pit_|chip_snapshot|table_tracker/.test(value)) return "Pit";
  if (/player|client_session|casino_visit|kyc_/.test(value)) return "Players";
  if (/pos_/.test(value)) return "POS";
  if (/boss_|dashboard|ace_finance/.test(value)) return "Dashboard";
  if (/activity_logs|profiles|user_roles|role_|admin-|fleet_|node_|peer_/.test(value)) return "Admin";
  if (/office|business_day_closures|management_|staff_/.test(value)) return "Office";
  return "Other";
}

function minuteBucket(timestamp: number): string {
  return new Date(Math.floor(timestamp / 60_000) * 60_000).toISOString();
}

function record(module: RequestMetricModule, durationMs: number, failed: boolean, timedOut: boolean) {
  const bucketAt = minuteBucket(Date.now());
  const key = `${bucketAt}:${module}`;
  const current = buckets.get(key) ?? {
    bucket_at: bucketAt,
    module,
    client_id: clientId,
    request_count: 0,
    error_count: 0,
    timeout_count: 0,
    total_duration_ms: 0,
    max_duration_ms: 0,
  };
  const roundedDuration = Math.max(0, Math.round(durationMs));
  current.request_count += 1;
  current.error_count += failed ? 1 : 0;
  current.timeout_count += timedOut ? 1 : 0;
  current.total_duration_ms += roundedDuration;
  current.max_duration_ms = Math.max(current.max_duration_ms, roundedDuration);
  buckets.set(key, current);
}

export function getRequestMetricBuckets(): RequestMetricBucket[] {
  const cutoff = Date.now() - 20 * 60_000;
  return Array.from(buckets.values()).filter((bucket) => new Date(bucket.bucket_at).getTime() >= cutoff);
}

export function startRequestMetricsFlush() {
  if (typeof window === "undefined" || flushTimer) return;
  const notify = () => window.dispatchEvent(new CustomEvent(FLUSH_EVENT));
  flushTimer = setInterval(notify, 10_000);
  notify();
}

export function subscribeRequestMetricsFlush(listener: () => void) {
  window.addEventListener(FLUSH_EVENT, listener);
  return () => window.removeEventListener(FLUSH_EVENT, listener);
}

export function installRequestMetrics() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const measuredFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = inputUrl(input);
    if (url.includes(METRICS_RESOURCE)) return measuredFetch(input, init);

    const startedAt = performance.now();
    try {
      const response = await measuredFetch(input, init);
      const duration = performance.now() - startedAt;
      record(classify(url), duration, !response.ok, response.status === 408 || response.status === 504 || duration >= TIMEOUT_MS);
      return response;
    } catch (error) {
      const duration = performance.now() - startedAt;
      const timedOut = duration >= TIMEOUT_MS || (error instanceof DOMException && error.name === "AbortError");
      record(classify(url), duration, true, timedOut);
      throw error;
    }
  }) as typeof window.fetch;
}