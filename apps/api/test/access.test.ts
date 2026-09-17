import assert from "node:assert/strict";
import test from "node:test";
import { chapterAccessMessage, chapterAccessReason } from "../src/lib/access.js";

test("active chapter hierarchy grants access", () => {
  assert.equal(chapterAccessReason({ chapterActive: true, organizationActive: true, universityActive: true }), null);
});

test("organization suspension takes precedence", () => {
  assert.equal(chapterAccessReason({ chapterActive: false, organizationActive: false, universityActive: false }), "ORGANIZATION_SUSPENDED");
  assert.equal(chapterAccessMessage("ORGANIZATION_SUSPENDED"), "This organization is currently suspended");
});

test("university suspension blocks an otherwise active chapter", () => {
  assert.equal(chapterAccessReason({ chapterActive: true, organizationActive: true, universityActive: false }), "UNIVERSITY_SUSPENDED");
});

test("chapter suspension blocks an otherwise active hierarchy", () => {
  assert.equal(chapterAccessReason({ chapterActive: false, organizationActive: true, universityActive: true }), "CHAPTER_SUSPENDED");
});
