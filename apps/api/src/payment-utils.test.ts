import assert from "node:assert/strict";
import test from "node:test";
import { isTransactionHash } from "./payment-utils.js";

test("accepts a canonical transaction hash", () => {
  assert.equal(isTransactionHash(`0x${"a".repeat(64)}`), true);
});

test("rejects malformed transaction hashes", () => {
  assert.equal(isTransactionHash("0x1234"), false);
  assert.equal(isTransactionHash(undefined), false);
  assert.equal(isTransactionHash(`0x${"g".repeat(64)}`), false);
});
