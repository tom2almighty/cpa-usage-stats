import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resolveManagementKey } from "../src/lib/auth.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function encode(value, prefix = "enc::v2::") {
  const key = Buffer.from("cli-proxy-api-webui::secure-storage|localhost:8317");
  const bytes = Buffer.from(JSON.stringify(value));
  return prefix + Buffer.from(bytes.map((byte, i) => byte ^ key[i % key.length])).toString("base64");
}

beforeEach(() => {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  globalThis.window = { location: { host: "localhost:8317" } };
});

test("reads the management center v2 persisted state without depending on the user agent", () => {
  localStorage.setItem(
    "cli-proxy-auth",
    encode({ state: { rememberPassword: true, managementKey: "center-key" }, version: 0 }),
  );
  assert.deepEqual(resolveManagementKey(), { key: "center-key", source: "center" });
});

test("preserves plugin and panel key precedence", () => {
  localStorage.setItem(
    "cli-proxy-auth",
    encode({ state: { rememberPassword: true, managementKey: "center-key" }, version: 0 }),
  );
  localStorage.setItem("cpa-dashboard.management-key", "panel-key");
  sessionStorage.setItem("cpa-dashboard.management-key", "session-key");
  assert.deepEqual(resolveManagementKey(), { key: "session-key", source: "panel" });
  localStorage.setItem("cpa-usage-stats.management-key", "own-key");
  assert.deepEqual(resolveManagementKey(), { key: "own-key", source: "own" });
});

test("ignores retired, corrupt, unremembered, and malformed center credentials", () => {
  const state = { state: { rememberPassword: true, managementKey: "center-key" }, version: 0 };
  for (const raw of [
    encode(state, "enc::v1::"),
    JSON.stringify(state),
    "enc::v2::invalid!",
    encode({ state: { managementKey: "center-key", rememberPassword: false } }),
    encode({ managementKey: "center-key" }),
    encode({ state: { managementKey: 123, rememberPassword: true } }),
    encode(null),
  ]) {
    localStorage.setItem("cli-proxy-auth", raw);
    assert.equal(resolveManagementKey().key, "", raw);
  }
});

test("storage denial leaves the page unauthenticated", () => {
  const denied = {
    getItem: () => {
      throw new Error("denied");
    },
  };
  globalThis.localStorage = denied;
  globalThis.sessionStorage = denied;
  assert.equal(resolveManagementKey().key, "");
});
