import type { GroupStat, StoredRecord } from "@/types";

/**
 * Model pricing from models.dev (https://github.com/anomalyco/models.dev)
 * with multi-tier fuzzy matching and user custom price override support.
 */

const PRICING_URL = "https://models.dev/api.json";
const CACHE_KEY = "cpa-usage-stats.pricing.v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CUSTOM_PRICING_KEY = "cpa-usage-stats.custom-pricing.v1";

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
  /** Matched model identifier. */
  modelId: string;
  /** Provider identifier or 'custom'. */
  providerId: string;
  price: ModelPrice;
  /** Match confidence / origin. */
  matchType: "exact" | "fuzzy" | "custom";
};

/** Token buckets used for costing. */
type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

type CostBreakdown = {
  uncachedTokens: number;
  uncachedCost: number;
  cacheReadTokens: number;
  cacheReadCost: number;
  cacheReadSavings: number;
  cacheWriteTokens: number;
  cacheWriteCost: number;
  outputTokens: number;
  outputCost: number;
  reasoningTokens: number;
  reasoningCost: number;
  totalCost: number;
};

type TokenSemantics = "subset" | "independent" | "separateReasoning";

const PROVIDER_HINTS: Record<string, string[]> = {
  claude: ["anthropic"],
  anthropic: ["anthropic"],
  codex: ["openai", "github-copilot"],
  openai: ["openai"],
  "openai-compatibility": ["openai"],
  gemini: ["google"],
  aistudio: ["google"],
  antigravity: ["google"],
  vertex: ["google-vertex", "google"],
  interactions: ["google"],
  xai: ["xai"],
  meta: ["meta", "meta-llama"],
  devin: ["devin", "cognition"],
};

/** Common model shorthand aliases mapping to canonical models.dev IDs. */
const COMMON_ALIASES: Record<string, string[]> = {
  "4o": ["gpt-4o"],
  "4o-mini": ["gpt-4o-mini"],
  "gpt-4o-mini": ["gpt-4o-mini"],
  o1: ["o1"],
  "o1-mini": ["o1-mini"],
  o3: ["o3"],
  "o3-mini": ["o3-mini"],
  sonnet: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-sonnet-4-5"],
  haiku: ["claude-3-5-haiku", "claude-3-haiku"],
  opus: ["claude-3-opus", "claude-opus-4-5"],
  flash: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
  "flash-lite": ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"],
  pro: ["gemini-2.5-pro", "gemini-1.5-pro"],
  "deepseek-v3": ["deepseek-chat", "deepseek-v3"],
  v3: ["deepseek-chat", "deepseek-v3"],
  "deepseek-r1": ["deepseek-reasoner", "deepseek-r1"],
  r1: ["deepseek-reasoner", "deepseek-r1"],
  grok: ["grok-2", "grok-3", "grok-latest"],
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
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

// ---------- Local Custom Pricing ----------

function getCustomPrices(): Record<string, ModelPrice> {
  try {
    const raw = localStorage.getItem(CUSTOM_PRICING_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, ModelPrice>;
    }
  } catch {
    // Storage unavailable
  }
  return {};
}

export function setCustomPrice(modelName: string, price: ModelPrice): void {
  const norm = modelName.trim().toLowerCase();
  if (!norm) return;
  const current = getCustomPrices();
  current[norm] = price;
  try {
    localStorage.setItem(CUSTOM_PRICING_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable
  }
}

export function removeCustomPrice(modelName: string): void {
  const norm = modelName.trim().toLowerCase();
  if (!norm) return;
  const current = getCustomPrices();
  delete current[norm];
  try {
    localStorage.setItem(CUSTOM_PRICING_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable
  }
}

// ---------- models.dev Catalog ----------

/** Reduces the models.dev catalog to the price map the dashboard needs. */
function buildPricingTable(catalog: unknown, fetchedAt = Date.now()): PricingTable {
  const models: Record<string, Record<string, ModelPrice>> = {};
  if (!catalog || typeof catalog !== "object") return { fetchedAt, models };

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
      if (typeof canonical === "string") {
        const short = canonical.slice(canonical.lastIndexOf("/") + 1);
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
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<PricingTable>;
    if (typeof record.fetchedAt !== "number" || !record.models) return null;
    return { fetchedAt: record.fetchedAt, models: record.models };
  } catch {
    return null;
  }
}

function writeCache(table: PricingTable) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(table));
  } catch {
    // Storage full or unavailable
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
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
    const table = buildPricingTable(await res.json());
    if (Object.keys(table.models).length === 0) throw new Error("models.dev 返回了空的价格表");
    writeCache(table);
    return table;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// ---------- Matching Engine ----------

/** Generates candidate lookup keys for fuzzy matching. */
function lookupCandidates(value: string): {
  exact: string[];
  derived: string[];
  aliases: string[];
} {
  const base = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!base) return { exact: [], derived: [], aliases: [] };

  const exact = [base];
  const derivedSet = new Set<string>();
  const addDerived = (candidate: string) => {
    if (candidate && candidate !== base) derivedSet.add(candidate);
  };

  const withoutPrefix = base.includes("/") ? base.slice(base.indexOf("/") + 1) : "";
  if (withoutPrefix) {
    addDerived(withoutPrefix);
  }

  const baseVariants = [base, withoutPrefix].filter(Boolean);
  for (const v of baseVariants) {
    // Strip date suffixes like -20250929
    addDerived(v.replace(/[-_.:]?\d{8}$/, ""));
    // Strip version tags like -v1, -v1.2
    addDerived(v.replace(/[-_.:]?v?\d{1,3}(\.\d+)*$/, ""));
    // Strip common preview/latest tags
    addDerived(v.replace(/[-_.]?(latest|preview|beta|exp|experimental|chat|instruct)$/, ""));
    // Convert dots to dashes (e.g. 3.5 -> 3-5) and vice versa
    if (v.includes(".")) addDerived(v.replace(/\./g, "-"));
    if (v.includes("-")) addDerived(v.replace(/-/g, "."));
  }

  // Common shorthand aliases
  const aliasList = COMMON_ALIASES[base] ?? COMMON_ALIASES[withoutPrefix] ?? [];

  return { exact, derived: [...derivedSet], aliases: aliasList };
}

function providerCandidates(provider: string | undefined): string[] {
  const raw = (provider ?? "").trim().toLowerCase();
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

/** Resolves a record/group to an exact, fuzzy, or custom price entry. */
function priceFor(
  table: PricingTable | null,
  ref: { model?: string; responseModel?: string; alias?: string; provider?: string },
): PriceMatch | null {
  const customPrices = getCustomPrices();

  // 1. Check custom price overrides first
  for (const raw of [ref.responseModel, ref.model, ref.alias]) {
    const value = (raw ?? "").trim().toLowerCase();
    if (!value) continue;
    if (customPrices[value]) {
      return {
        modelId: value,
        providerId: "custom",
        price: customPrices[value],
        matchType: "custom",
      };
    }
    const clean = value.includes("/") ? value.slice(value.indexOf("/") + 1) : "";
    if (clean && customPrices[clean]) {
      return {
        modelId: clean,
        providerId: "custom",
        price: customPrices[clean],
        matchType: "custom",
      };
    }
  }

  if (!table) return null;
  const hints = providerCandidates(ref.provider);

  // 2. Exact match check
  for (const raw of [ref.responseModel, ref.model, ref.alias]) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const { exact } = lookupCandidates(value);
    for (const key of exact) {
      const providers = table.models[key];
      if (providers) {
        const picked = pickPrice(providers, hints);
        if (picked)
          return {
            modelId: key,
            providerId: picked.providerId,
            price: picked.price,
            matchType: "exact",
          };
      }
    }
  }

  // 3. Derived fuzzy match (punctuation, date/tag stripping)
  for (const raw of [ref.responseModel, ref.model, ref.alias]) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const { derived } = lookupCandidates(value);
    for (const key of derived) {
      const providers = table.models[key];
      if (providers) {
        const picked = pickPrice(providers, hints);
        if (picked)
          return {
            modelId: key,
            providerId: picked.providerId,
            price: picked.price,
            matchType: "fuzzy",
          };
      }
    }
  }

  // 4. Shorthand alias match
  for (const raw of [ref.responseModel, ref.model, ref.alias]) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const { aliases } = lookupCandidates(value);
    for (const targetId of aliases) {
      const providers = table.models[targetId];
      if (providers) {
        const picked = pickPrice(providers, hints);
        if (picked)
          return {
            modelId: targetId,
            providerId: picked.providerId,
            price: picked.price,
            matchType: "fuzzy",
          };
      }
    }
  }

  return null;
}

// ---------- Cost Calculations ----------

function tokenSemantics(provider: string | undefined): TokenSemantics {
  const value = (provider ?? "").trim().toLowerCase();
  if (value.startsWith("openai-compat") || value.includes("openaicompat")) return "subset";
  if (value.includes("claude") || value.includes("anthropic")) return "independent";
  for (const marker of ["gemini", "aistudio", "antigravity", "vertex", "interaction"]) {
    if (value.includes(marker)) return "separateReasoning";
  }
  return "subset";
}

function perMillion(tokens: number, pricePerMillion: number): number {
  return (tokens / 1_000_000) * pricePerMillion;
}

function calculateBreakdown(price: ModelPrice, usage: TokenUsage, semantics: TokenSemantics): CostBreakdown {
  const cacheInsideInput = semantics !== "independent";
  const uncachedTokens = cacheInsideInput ? Math.max(0, usage.input - usage.cacheRead - usage.cacheWrite) : usage.input;
  const reasoningTokens = semantics === "separateReasoning" ? usage.reasoning : 0;

  const uncachedCost = perMillion(uncachedTokens, price.input);
  const cacheReadPrice = price.cacheRead ?? price.input;
  const cacheReadCost = perMillion(usage.cacheRead, cacheReadPrice);
  const cacheReadSavings = Math.max(0, perMillion(usage.cacheRead, price.input) - cacheReadCost);
  const cacheWriteCost = perMillion(usage.cacheWrite, price.cacheWrite ?? price.input);
  const outputCost = perMillion(usage.output, price.output);
  const reasoningCost = perMillion(reasoningTokens, price.reasoning ?? price.output);
  const totalCost = uncachedCost + cacheReadCost + cacheWriteCost + outputCost + reasoningCost;

  return {
    uncachedTokens,
    uncachedCost,
    cacheReadTokens: usage.cacheRead,
    cacheReadCost,
    cacheReadSavings,
    cacheWriteTokens: usage.cacheWrite,
    cacheWriteCost,
    outputTokens: usage.output,
    outputCost,
    reasoningTokens,
    reasoningCost,
    totalCost,
  };
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

export type RecordCost = {
  match: PriceMatch;
  cost: number;
  breakdown: CostBreakdown;
};

/** Estimated cost of a single stored record, or null when no price is known. */
export function recordCost(table: PricingTable | null, record: StoredRecord): RecordCost | null {
  const match = priceFor(table, {
    model: record.model,
    responseModel: record.response_model,
    alias: record.alias,
    provider: record.provider,
  });
  if (!match) return null;
  const semantics = tokenSemantics(record.provider);
  const usage = usageOfRecord(record);
  const breakdown = calculateBreakdown(match.price, usage, semantics);
  return { match, cost: breakdown.totalCost, breakdown };
}

type GroupCostResult = {
  match: PriceMatch;
  cost: number;
  breakdown: CostBreakdown;
};

export function groupCostDetails(table: PricingTable | null, group: GroupStat): GroupCostResult | null {
  const provider = group.secondary ?? "";
  const match = priceFor(table, { model: group.name, provider });
  if (!match) return null;
  const semantics = tokenSemantics(provider);
  const usage = usageOfGroup(group);
  const breakdown = calculateBreakdown(match.price, usage, semantics);
  return { match, cost: breakdown.totalCost, breakdown };
}

function groupCost(table: PricingTable | null, group: GroupStat): number | null {
  const res = groupCostDetails(table, group);
  return res ? res.cost : null;
}

type CostTotal = { cost: number; priced: number; total: number };

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
