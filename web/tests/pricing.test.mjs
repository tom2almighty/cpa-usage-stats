import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { groupCostDetails, priceFor, recordCost } from "../src/lib/pricing.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

beforeEach(() => {
  globalThis.localStorage = storage();
});

const TABLE = {
  fetchedAt: 0,
  models: {
    "claude-sonnet-5": {
      openrouter: { input: 9, output: 90, cacheRead: 0.9, cacheWrite: 11 },
      anthropic: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      "github-copilot": { input: 0, output: 0 },
    },
    "gpt-5.3-codex": {
      openrouter: { input: 8, output: 20, cacheRead: 1 },
      openai: { input: 2, output: 10, cacheRead: 0.5 },
      "github-copilot": { input: 0, output: 0 },
    },
    "mai-code-2": {
      "github-copilot": { input: 1, output: 4 },
    },
    "gemini-4-neon": {
      openrouter: { input: 5, output: 25 },
      google: { input: 1.5, output: 10, cacheRead: 0.3 },
    },
    "swe-2": {
      openrouter: { input: 4, output: 16 },
      cognition: { input: 1, output: 5 },
    },
  },
};

test("copilot prefers canonical upstream provider prices and falls back to github-copilot", () => {
  assert.equal(priceFor(TABLE, { model: "copilot/claude-sonnet-5", provider: "copilot" })?.providerId, "anthropic");
  assert.equal(priceFor(TABLE, { model: "copilot/gpt-5.3-codex", provider: "copilot" })?.providerId, "openai");
  assert.equal(priceFor(TABLE, { model: "copilot/mai-code-2", provider: "copilot" })?.providerId, "github-copilot");
});

test("devin prefers cognition for native models and canonical upstream providers for proxied models", () => {
  assert.equal(priceFor(TABLE, { model: "devin/swe-2", provider: "devin" })?.providerId, "cognition");
  assert.equal(priceFor(TABLE, { model: "devin/claude-sonnet-5", provider: "devin" })?.providerId, "anthropic");
  assert.equal(priceFor(TABLE, { model: "devin/gpt-5.3-codex", provider: "devin" })?.providerId, "openai");
  assert.equal(priceFor(TABLE, { model: "devin/gemini-4-neon", provider: "devin" })?.providerId, "google");
});

test("copilot uses independent cache semantics for Claude models and subset semantics for OpenAI models", () => {
  const claudeRecord = {
    provider: "copilot",
    model: "copilot/claude-sonnet-5",
    response_model: "claude-sonnet-5",
    alias: "",
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    reasoning_tokens: 0,
    cache_read_tokens: 2_000_000,
    cache_creation_tokens: 500_000,
  };
  const claudeCost = recordCost(TABLE, claudeRecord);
  assert.ok(claudeCost);
  // Independent: uncached input stays 1M (not clamped to 0 by subtracting cache tokens).
  assert.equal(claudeCost.breakdown.uncachedTokens, 1_000_000);
  assert.equal(claudeCost.breakdown.totalCost, 3 + 0.6 + 1.875 + 15);

  const claudeGroup = groupCostDetails(TABLE, {
    name: "copilot/claude-sonnet-5",
    secondary: "copilot",
    input_tokens: 1_000_000,
    output_tokens: 0,
    reasoning_tokens: 0,
    cache_read_tokens: 2_000_000,
    cache_creation_tokens: 0,
  });
  assert.ok(claudeGroup);
  assert.equal(claudeGroup.breakdown.uncachedTokens, 1_000_000);

  const gptRecord = {
    provider: "copilot",
    model: "copilot/gpt-5.3-codex",
    response_model: "gpt-5.3-codex",
    alias: "",
    input_tokens: 3_000_000,
    output_tokens: 1_000_000,
    reasoning_tokens: 0,
    cache_read_tokens: 2_000_000,
    cache_creation_tokens: 0,
  };
  const gptCost = recordCost(TABLE, gptRecord);
  assert.ok(gptCost);
  // Subset: cached tokens are part of input_tokens, so uncached = 3M - 2M = 1M.
  assert.equal(gptCost.breakdown.uncachedTokens, 1_000_000);
  assert.equal(gptCost.breakdown.totalCost, 2 + 1 + 10);
});
