import { useCallback, useEffect, useState } from 'react';
import type { GroupStat, StoredRecord } from '@/types';

/**
 * Model pricing from models.dev (https://github.com/anomalyco/models.dev).
 *
 * The catalog is a single ~5 MB document, so it is fetched once, reduced to an
 * id -> provider -> price map (~0.5 MB) and cached in localStorage for a day.
 * Every cost shown in the dashboard is an estimate on list prices.
 */

const PRICING_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'cpa-usage-stats.pricing.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** USD per 1M tokens. */
export type ModelPrice = {
  input: number;
  output: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type PricingTable = {
  fetchedAt: number;
  /** model id -> models.dev provider id -> price */
  models: Record<string, Record<string, ModelPrice>>;
};

export type PriceMatch = {
  /** models.dev model id the record was matched to. */
  modelId: string;
  /** models.dev provider id the price came from. */
  providerId: string;
  price: ModelPrice;
};

/** Token buckets used for costing. */
export type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

/**
 * How a provider counts cache/reasoning tokens, mirroring CLIProxyAPI's
 * accounting rules (sdk/cliproxy/usage/accounting.go):
 * - subset: cache tokens are part of input, reasoning part of output (OpenAI style)
 * - independent: cache and reasoning are separate counters (Anthropic style)
 * - separateReasoning: cache inside input, reasoning separate from output (Gemini style)
 */
type TokenSemantics = 'subset' | 'independent' | 'separateReasoning';

const PROVIDER_HINTS: Record<string, string[]> = {
  claude: ['anthropic'],
  anthropic: ['anthropic'],
  codex: ['openai', 'github-copilot'],
  openai: ['openai'],
  'openai-compatibility': ['openai'],
  gemini: ['google'],
  aistudio: ['google'],
  antigravity: ['google'],
  vertex: ['google-vertex', 'google'],
  interactions: ['google'],
  xai: ['xai'],
  meta: ['meta', 'meta-llama'],
  devin: ['devin', 'cognition'],
};

type RawCost = {
  input?: unknown;
  output?: unknown;
  reasoning?: unknown;
  cache_read?: unknown;
  cache_write?: unknown;
};

type RawModel = { cost?: RawCost; canonical_model_id?: unknown };
type RawProvider = { models?: Record<string, RawModel> };

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toPrice(cost: RawCost | undefined): ModelPrice | null {
  const input = numberOrUndefined(cost?.input);
  const output = numberOrUndefined(cost?.output);
  if (input === undefined || output === undefined) return null;
  const price: ModelPrice = { input, output };
  const reasoning = numberOrUndefined(cost?.reasoning);
  const cacheRead = numberOrUndefined(cost?.cache_read);
  const cacheWrite = numberOrUndefined(cost?.cache_write);
  if (reasoning !== undefined) price.reasoning = reasoning;
  if (cacheRead !== undefined) price.cacheRead = cacheRead;
  if (cacheWrite !== undefined) price.cacheWrite = cacheWrite;
  return price;
}

/** Reduces the models.dev catalog to the price map the dashboard needs. */
export function buildPricingTable(catalog: unknown, fetchedAt = Date.now()): PricingTable {
  const models: Record<string, Record<string, ModelPrice>> = {};
  if (!catalog || typeof catalog !== 'object') return { fetchedAt, models };

  const add = (key: string, providerId: string, price: ModelPrice) => {
    const id = key.trim().toLowerCase();
    if (!id) return;
    if (!models[id]) models[id] = {};
    models[id][providerId] = price;
  };

  for (const [providerId, provider] of Object.entries(catalog as Record<string, RawProvider>)) {
    for (const [modelId, model] of Object.entries(provider?.models ?? {})) {
      const price = toPrice(model?.cost);
      if (!price) continue;
      add(modelId, providerId, price);
      const canonical = model?.canonical_model_id;
      if (typeof canonical === 'string') {
        const short = canonical.slice(canonical.lastIndexOf('/') + 1);
        if (short && short !== modelId) add(short, providerId, price);
      }
    }
  }
  return { fetchedAt, models };
}

function readCache(): PricingTable | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<PricingTable>;
    if (typeof record.fetchedAt !== 'number' || !record.models) return null;
    return { fetchedAt: record.fetchedAt, models: record.models };
  } catch {
    return null;
  }
}

function writeCache(table: PricingTable) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(table));
  } catch {
    // Storage full or unavailable; pricing still works for this session.
  }
}

/**
 * Loads the price table, preferring a fresh cache entry. Returns the stale
 * cache when the network call fails so the dashboard keeps working offline.
 */
export async function loadPricing(force = false): Promise<PricingTable> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(PRICING_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
    const table = buildPricingTable(await res.json());
    if (Object.keys(table.models).length === 0) throw new Error('models.dev 返回了空的价格表');
    writeCache(table);
    return table;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

/** Model-name variants to try, most specific first (CPA names carry dates/prefixes). */
function lookupKeys(value: string): string[] {
  const base = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!base) return [];
  const keys = new Set<string>();
  const push = (candidate: string) => {
    if (candidate) keys.add(candidate);
  };
  const variants = [base];
  const withoutPrefix = base.includes('/') ? base.slice(base.indexOf('/') + 1) : '';
  if (withoutPrefix) variants.push(withoutPrefix);

  for (const variant of variants) {
    push(variant);
    push(variant.replace(/[-_.:]?\d{8}$/, ''));
    push(variant.replace(/[-_.:]?v?\d{1,3}(\.\d+)*$/, ''));
    push(variant.replace(/[-_.]?(latest|preview|beta|exp|experimental)$/, ''));
  }
  return [...keys];
}

function providerCandidates(provider: string | undefined): string[] {
  const raw = (provider ?? '').trim().toLowerCase();
  if (!raw) return [];
  const hints = PROVIDER_HINTS[raw] ?? [];
  return [...new Set([...hints, raw])];
}

function pickPrice(
  providers: Record<string, ModelPrice>,
  hints: string[],
): { providerId: string; price: ModelPrice } | null {
  for (const hint of hints) {
    const price = providers[hint];
    if (price) return { providerId: hint, price };
  }
  const fallback = Object.entries(providers)[0];
  return fallback ? { providerId: fallback[0], price: fallback[1] } : null;
}

/** Resolves a record/group to a models.dev price entry. */
export function priceFor(
  table: PricingTable | null,
  ref: { model?: string; responseModel?: string; alias?: string; provider?: string },
): PriceMatch | null {
  if (!table) return null;
  const hints = providerCandidates(ref.provider);
  for (const raw of [ref.responseModel, ref.model, ref.alias]) {
    const value = (raw ?? '').trim();
    if (!value) continue;
    for (const key of lookupKeys(value)) {
      const providers = table.models[key];
      if (!providers) continue;
      const picked = pickPrice(providers, hints);
      if (picked) return { modelId: key, providerId: picked.providerId, price: picked.price };
    }
  }
  return null;
}

export function tokenSemantics(provider: string | undefined): TokenSemantics {
  const value = (provider ?? '').trim().toLowerCase();
  if (value.startsWith('openai-compat') || value.includes('openaicompat')) return 'subset';
  if (value.includes('claude') || value.includes('anthropic')) return 'independent';
  for (const marker of ['gemini', 'aistudio', 'antigravity', 'vertex', 'interaction']) {
    if (value.includes(marker)) return 'separateReasoning';
  }
  return 'subset';
}

function perMillion(tokens: number, pricePerMillion: number): number {
  return (tokens / 1_000_000) * pricePerMillion;
}

/** Estimated USD cost of one usage bucket set, honouring the provider token semantics. */
export function usageCost(price: ModelPrice, usage: TokenUsage, semantics: TokenSemantics): number {
  const cacheInsideInput = semantics !== 'independent';
  const uncached = cacheInsideInput
    ? Math.max(0, usage.input - usage.cacheRead - usage.cacheWrite)
    : usage.input;
  const reasoning = semantics === 'separateReasoning' ? usage.reasoning : 0;

  return (
    perMillion(uncached, price.input) +
    perMillion(usage.cacheRead, price.cacheRead ?? price.input) +
    perMillion(usage.cacheWrite, price.cacheWrite ?? price.input) +
    perMillion(usage.output, price.output) +
    perMillion(reasoning, price.reasoning ?? price.output)
  );
}

function usageOfRecord(record: StoredRecord): TokenUsage {
  return {
    input: record.input_tokens,
    output: record.output_tokens,
    reasoning: record.reasoning_tokens,
    cacheRead: record.cache_read_tokens,
    cacheWrite: record.cache_creation_tokens,
  };
}

function usageOfGroup(group: GroupStat): TokenUsage {
  return {
    input: group.input_tokens,
    output: group.output_tokens,
    reasoning: group.reasoning_tokens,
    cacheRead: group.cache_read_tokens,
    cacheWrite: group.cache_creation_tokens,
  };
}

export type RecordCost = { match: PriceMatch; cost: number };

/** Estimated cost of a single stored record, or null when no price is known. */
export function recordCost(table: PricingTable | null, record: StoredRecord): RecordCost | null {
  const match = priceFor(table, {
    model: record.model,
    responseModel: record.response_model,
    alias: record.alias,
    provider: record.provider,
  });
  if (!match) return null;
  return {
    match,
    cost: usageCost(match.price, usageOfRecord(record), tokenSemantics(record.provider)),
  };
}

/** Estimated cost of a summary group row (model ranking / provider breakdown). */
export function groupCost(table: PricingTable | null, group: GroupStat): number | null {
  const provider = group.secondary ?? '';
  const match = priceFor(table, { model: group.name, provider });
  if (!match) return null;
  return usageCost(match.price, usageOfGroup(group), tokenSemantics(provider));
}

export type CostTotal = { cost: number; priced: number; total: number };

/** Sums the cost of every priced group, reporting how many groups matched a price. */
export function totalCost(table: PricingTable | null, groups: GroupStat[]): CostTotal {
  let cost = 0;
  let priced = 0;
  for (const group of groups) {
    const value = groupCost(table, group);
    if (value === null) continue;
    cost += value;
    priced += 1;
  }
  return { cost, priced, total: groups.length };
}

export function isPricingStale(table: PricingTable | null): boolean {
  return !table || Date.now() - table.fetchedAt >= CACHE_TTL_MS;
}

export type PricingState = {
  table: PricingTable | null;
  loading: boolean;
  error: string;
  refresh: () => void;
};

/** Loads the price table for the dashboard and exposes a manual refresh. */
export function usePricing(): PricingState {
  const [table, setTable] = useState<PricingTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPricing(nonce > 0)
      .then((next) => {
        if (!alive) return;
        setTable(next);
        setError('');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { table, loading, error, refresh };
}
