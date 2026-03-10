/**
 * Unit tests for the sender-parsing and notification-text logic in background.js.
 *
 * The functions are duplicated here because background.js runs inside
 * Thunderbird's WebExtension sandbox and cannot be imported by Node directly.
 * If the logic grows, extract it to a shared ES-module.
 *
 * Run: node --test test/**\/*.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline copies — keep in sync with background.js
// ---------------------------------------------------------------------------

function parseSender(author) {
  const trimmed = (author || "").trim();
  let senderName  = "";
  let senderEmail = "";

  const match = trimmed.match(/^"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    senderName  = match[1].trim();
    senderEmail = match[2].trim().toLowerCase();
  } else {
    senderEmail = trimmed.toLowerCase();
    senderName  = senderEmail.split("@")[0];
  }

  if (!senderName) {
    senderName = senderEmail.split("@")[0];
  }

  return { senderName, senderEmail };
}

function _notificationTitle(result) {
  if (result.alreadyExisted) {
    if (result.conditionAdded) {
      return result.filterRun ? "Filter updated and applied" : "Filter updated";
    }
    return result.filterRun ? "Filter applied" : "Filter already up to date";
  }
  return result.filterRun ? "Filter created and applied" : "Filter created";
}

function _notificationMessage(result, settings) {
  const folder = result.folderUri
    ? decodeURIComponent(result.folderUri.split("/").pop())
    : result.filterName;

  if (result.alreadyExisted && result.conditionAdded && result.filterRun) {
    return `Added new display name to filter "${result.filterName}" and ran it on inbox — matching messages moved to "${folder}".`;
  }
  if (result.alreadyExisted && result.conditionAdded) {
    return `Added new display name to filter "${result.filterName}". Enable "Run filter after creation" to apply it to your inbox.`;
  }
  if (result.alreadyExisted && result.filterRun) {
    return `Ran existing filter "${result.filterName}" on inbox — matching messages moved to "${folder}".`;
  }
  if (result.alreadyExisted) {
    return `Filter "${result.filterName}" already covers this sender. Enable "Run filter after creation" to apply it to your inbox.`;
  }
  if (result.filterRun) {
    return `Filter "${result.filterName}" saved and run on inbox — matching messages moved to "${folder}".`;
  }
  return `Filter "${result.filterName}" saved — future mail will be moved to "${folder}".`;
}

// ---------------------------------------------------------------------------
// Tests — sender parsing
// ---------------------------------------------------------------------------

describe("parseSender", () => {
  describe("display name + angle-bracket address", () => {
    it("parses a standard formatted address", () => {
      const result = parseSender("John Doe <john.doe@example.com>");
      assert.equal(result.senderName,  "John Doe");
      assert.equal(result.senderEmail, "john.doe@example.com");
    });

    it("lower-cases the email address", () => {
      const result = parseSender("Alice <Alice@Example.COM>");
      assert.equal(result.senderEmail, "alice@example.com");
    });

    it("handles a quoted display name", () => {
      const result = parseSender('"Doe, Jane" <jane@example.com>');
      assert.equal(result.senderName,  "Doe, Jane");
      assert.equal(result.senderEmail, "jane@example.com");
    });

    it("falls back to local part when display name is empty", () => {
      const result = parseSender("<noreply@service.com>");
      assert.equal(result.senderName,  "noreply");
      assert.equal(result.senderEmail, "noreply@service.com");
    });
  });

  describe("bare email address (no display name)", () => {
    it("parses a plain email address", () => {
      const result = parseSender("user@domain.org");
      assert.equal(result.senderName,  "user");
      assert.equal(result.senderEmail, "user@domain.org");
    });

    it("lower-cases a bare address", () => {
      const result = parseSender("User@DOMAIN.ORG");
      assert.equal(result.senderEmail, "user@domain.org");
    });
  });

  describe("edge cases", () => {
    it("handles an empty string without throwing", () => {
      const result = parseSender("");
      assert.equal(result.senderEmail, "");
    });

    it("handles null without throwing", () => {
      const result = parseSender(null);
      assert.equal(result.senderEmail, "");
    });

    it("trims surrounding whitespace", () => {
      const result = parseSender("  Bob <bob@example.com>  ");
      assert.equal(result.senderName,  "Bob");
      assert.equal(result.senderEmail, "bob@example.com");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — notification text
// ---------------------------------------------------------------------------

describe("notifications", () => {
  const settings = { runAfterCreation: false, useLocalFolders: false };
  const base = {
    filterName:     "CineStar Newsletter",
    folderUri:      "imap://user@host/CineStar%20Newsletter",
    alreadyExisted: false,
    conditionAdded: false,
    filterRun:      false,
  };

  it("new filter, not run", () => {
    assert.equal(_notificationTitle(base),            "Filter created");
    assert.match(_notificationMessage(base, settings), /saved — future mail/);
  });

  it("new filter and run on inbox", () => {
    const r = { ...base, filterRun: true };
    assert.equal(_notificationTitle(r),            "Filter created and applied");
    assert.match(_notificationMessage(r, settings), /saved and run on inbox/);
  });

  it("existing filter, same sender, not run", () => {
    const r = { ...base, alreadyExisted: true };
    assert.equal(_notificationTitle(r),            "Filter already up to date");
    assert.match(_notificationMessage(r, settings), /already covers this sender/);
  });

  it("existing filter, same sender, run on inbox", () => {
    const r = { ...base, alreadyExisted: true, filterRun: true };
    assert.equal(_notificationTitle(r),            "Filter applied");
    assert.match(_notificationMessage(r, settings), /Ran existing filter/);
  });

  it("existing filter, new display name added, not run", () => {
    const r = { ...base, alreadyExisted: true, conditionAdded: true };
    assert.equal(_notificationTitle(r),            "Filter updated");
    assert.match(_notificationMessage(r, settings), /Added new display name/);
  });

  it("existing filter, new display name added, run on inbox", () => {
    const r = { ...base, alreadyExisted: true, conditionAdded: true, filterRun: true };
    assert.equal(_notificationTitle(r),            "Filter updated and applied");
    assert.match(_notificationMessage(r, settings), /Added new display name.*and ran it/);
  });

  it("decodes folder name from URI for display", () => {
    const r = { ...base, filterRun: true };
    assert.match(_notificationMessage(r, settings), /"CineStar Newsletter"/);
  });
});
