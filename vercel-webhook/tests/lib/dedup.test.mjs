import assert from "node:assert/strict";
import { buildDedupKey } from "../../lib/dedup.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("buildDedupKey creates key from caseId + appointmentStart", () => {
  const key = buildDedupKey(12345, "2026-04-02T12:00:00.000Z");
  assert.equal(key, "12345|2026-04-02T12:00:00.000Z");
});

run("buildDedupKey returns null if caseId is missing", () => {
  assert.equal(buildDedupKey(null, "2026-04-02T12:00:00.000Z"), null);
});

run("buildDedupKey returns null if appointmentStart is missing", () => {
  assert.equal(buildDedupKey(12345, null), null);
});
