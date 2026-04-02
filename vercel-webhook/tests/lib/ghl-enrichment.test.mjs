import assert from "node:assert/strict";
import { enrichContactInfoWithProvider } from "../../lib/ghl.js";

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("enrichContactInfoWithProvider returns emails and phones from GHL contact", async () => {
  const result = await enrichContactInfoWithProvider("jane@example.com", null, {
    restSearcher: async () => ({
      id: "abc123",
      email: "jane@example.com",
      phone: "+15551234567",
      additionalEmails: ["jane2@example.com"],
      additionalPhones: ["+15559876543"],
    }),
  });

  assert.ok(result.emails.includes("jane@example.com"));
  assert.ok(result.emails.includes("jane2@example.com"));
  assert.ok(result.phones.includes("+15551234567"));
  assert.ok(result.phones.includes("+15559876543"));
  assert.equal(result.firstName, undefined);
});

await run("enrichContactInfoWithProvider extracts name from contact", async () => {
  const result = await enrichContactInfoWithProvider(null, "(555)123-4567", {
    restSearcher: async () => ({
      id: "abc123",
      email: "test@test.com",
      phone: "+15551234567",
      firstName: "Jane",
      lastName: "Doe",
    }),
  });

  assert.equal(result.firstName, "Jane");
  assert.equal(result.lastName, "Doe");
  assert.ok(result.emails.includes("test@test.com"));
});

await run("enrichContactInfoWithProvider returns empty on no contact found", async () => {
  const result = await enrichContactInfoWithProvider("nobody@example.com", null, {
    restSearcher: async () => null,
  });

  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.phones, []);
});

await run("enrichContactInfoWithProvider handles REST errors gracefully", async () => {
  const result = await enrichContactInfoWithProvider("jane@example.com", null, {
    restSearcher: async () => { throw new Error("401"); },
  });

  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.phones, []);
});
