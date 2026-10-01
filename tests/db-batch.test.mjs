import assert from "node:assert/strict";
import test from "node:test";
import { batchesOf, DB_WRITE_BATCH_SIZE } from "../src/lib/db-batch.ts";

test("database writes are split below PostgreSQL parameter limits", () => {
  const rows = Array.from({ length: DB_WRITE_BATCH_SIZE * 2 + 17 }, (_, index) => index);
  const batches = batchesOf(rows);

  assert.deepEqual(batches.map((batch) => batch.length), [250, 250, 17]);
  assert.deepEqual(batches.flat(), rows);
});

test("database batching rejects invalid sizes", () => {
  assert.throws(() => batchesOf([1], 0), /positive integer/);
});
