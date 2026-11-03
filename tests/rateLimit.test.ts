import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, createRateLimiter } from "../src/lib/rateLimit.ts";

test("allows up to the limit, then blocks until the window slides", () => {
  const check = createRateLimiter(3, 60_000);
  const t0 = 1_000_000;
  assert.equal(check("a", t0).ok, true);
  assert.equal(check("a", t0 + 1).ok, true);
  assert.equal(check("a", t0 + 2).remaining, 0);
  const blocked = check("a", t0 + 3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 60);
  assert.equal(check("a", t0 + 60_001).ok, true);
});

test("tracks keys independently", () => {
  const check = createRateLimiter(1, 60_000);
  assert.equal(check("a", 0).ok, true);
  assert.equal(check("b", 0).ok, true);
  assert.equal(check("a", 1).ok, false);
});

test("clientIp reads the first forwarded address", () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
  assert.equal(clientIp(req), "1.2.3.4");
  assert.equal(clientIp(new Request("http://x")), "local");
});
