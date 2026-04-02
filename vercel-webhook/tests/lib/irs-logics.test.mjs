import assert from "node:assert/strict";
import { phoneFormats, extractCaseId } from "../../lib/irs-logics.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("phoneFormats returns unique format variations for parenthesized number", () => {
  const formats = phoneFormats("(267)333-9583");
  assert.ok(formats.includes("2673339583"), "should include digits-only");
  assert.ok(formats.includes("267-333-9583"), "should include dashed");
  assert.ok(formats.includes("267.333.9583"), "should include dotted");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
  assert.ok(!formats.includes("(267)333-9583"), "should exclude original");
});

run("phoneFormats returns unique format variations for dashed number", () => {
  const formats = phoneFormats("267-333-9583");
  assert.ok(formats.includes("2673339583"), "should include digits-only");
  assert.ok(formats.includes("(267)333-9583"), "should include parenthesized");
  assert.ok(formats.includes("267.333.9583"), "should include dotted");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
  assert.ok(!formats.includes("267-333-9583"), "should exclude original");
});

run("phoneFormats handles 11-digit number with leading 1", () => {
  const formats = phoneFormats("12673339583");
  assert.ok(formats.includes("2673339583"), "should include 10-digit");
  assert.ok(formats.includes("(267)333-9583"), "should include parenthesized");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
});

run("phoneFormats returns empty array for invalid phone", () => {
  assert.deepEqual(phoneFormats("123"), []);
  assert.deepEqual(phoneFormats(""), []);
  assert.deepEqual(phoneFormats(null), []);
  assert.deepEqual(phoneFormats(undefined), []);
});

run("extractCaseId prefers active cases with SaleDate", () => {
  const response = {
    Success: true,
    Data: [
      { CaseID: 100, CreatedDate: "2026-01-01", SaleDate: null },
      { CaseID: 200, CreatedDate: "2026-02-01", SaleDate: "2026-02-15" },
    ],
  };
  assert.equal(extractCaseId(response), 200);
});

run("extractCaseId returns null for empty response", () => {
  assert.equal(extractCaseId(null), null);
  assert.equal(extractCaseId({ Success: false }), null);
  assert.equal(extractCaseId({ Success: true, Data: [] }), null);
});
