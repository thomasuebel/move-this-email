"use strict";

// TB 128+ uses ESM-only module paths.
const { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// ---------------------------------------------------------------------------
// IDL constants — plain integers, not accessible via Ci.<name>.
// ---------------------------------------------------------------------------
const FILTER_TYPE_INBOX  = 0x1; // nsMsgFilterType.InboxRule
const FILTER_TYPE_MANUAL = 0x4; // nsMsgFilterType.Manual
const ATTRIB_SENDER      = 1;   // nsMsgSearchAttrib.Sender (From header)
const OP_CONTAINS        = 0;   // nsMsgSearchOp.Contains
const ACTION_MOVE        = 1;   // nsMsgFilterAction.MoveToFolder

// ---------------------------------------------------------------------------
// Experiment API
// ---------------------------------------------------------------------------

this.filterCreator = class extends ExtensionCommon.ExtensionAPI {
  getAPI(/* context */) {
    return {
      filterCreator: {
        async openFilterEditor({
          senderName,
          senderEmail,
          accountId,
          runAfterCreation  = false,
          useLocalFolders   = false,
          parentFolderName  = "",
        }) {
          console.log("[filterCreator] called", {
            senderName, senderEmail, accountId,
            runAfterCreation, useLocalFolders, parentFolderName,
          });

          // ── Source account (owns the filter list) ─────────────────────────
          const account = MailServices.accounts.getAccount(accountId);
          if (!account) {
            throw new Error(`[filterCreator] account not found: ${accountId}`);
          }
          const server = account.incomingServer;
          console.log("[filterCreator] server type:", server.type);

          // ── Filter list lives on the source account's server ───────────────
          const filterList = server.getEditableFilterList(null);

          // ── Target server for folder creation ──────────────────────────────
          let targetServer;
          if (useLocalFolders) {
            targetServer = MailServices.accounts.localFoldersServer;
            if (!targetServer) {
              throw new Error("[filterCreator] Local Folders account not found");
            }
          } else {
            targetServer = server;
          }

          // ── Resolve the container folder (root or parent subfolder) ────────
          const rootFolder        = targetServer.rootMsgFolder;
          const senderFolderName  = _sanitizeFolderName(senderName || senderEmail.split("@")[0]);
          let   containerFolder   = rootFolder;

          if (parentFolderName.trim()) {
            const sanitizedParent = _sanitizeFolderName(parentFolderName);
            const parentUri       = _resolveOrCreateFolder(rootFolder, sanitizedParent);

            if (parentUri) {
              // Prefer getChildNamed; fall back to folderLookup for IMAP.
              let parentFolder = null;
              try { parentFolder = rootFolder.getChildNamed(sanitizedParent); } catch (_) {}
              if (!parentFolder) {
                parentFolder = MailServices.folderLookup.getFolderForURL(parentUri);
              }

              if (parentFolder) {
                containerFolder = parentFolder;
                console.log("[filterCreator] using parent folder:", parentFolder.URI);
              } else {
                // IMAP async: parent CREATE is in-flight but not yet registered
                // locally. Log and fall back to root so the sender folder is at
                // least created. On the next button press the parent will exist
                // and the sender folder will be placed correctly.
                console.warn(
                  "[filterCreator] parent folder not yet in cache — creating sender folder at root. " +
                  "Retry once the IMAP folder list has synced."
                );
              }
            }
          }

          // ── Resolve or create the destination folder ───────────────────────
          const targetFolderUri = _resolveOrCreateFolder(containerFolder, senderFolderName);

          // ── Check for an existing filter by sender email ──────────────────
          // Identify filters by email address (stable), not display name.
          const existingFilter = _findFilterByEmail(filterList, senderEmail);
          const alreadyExisted = existingFilter !== null;

          // The human-readable filter name: reuse existing, or derive from sender.
          const filterName = alreadyExisted
            ? existingFilter.filterName
            : (senderName || senderEmail);

          let conditionAdded = false;

          if (alreadyExisted) {
            // Add the current display name as a new OR condition if not already present.
            if (senderName && !_hasSearchTerm(existingFilter, senderName)) {
              _appendSearchTerm(existingFilter, ATTRIB_SENDER, OP_CONTAINS, senderName);
              conditionAdded = true;
              console.log("[filterCreator] added display name condition:", senderName);
              try {
                filterList.saveToDefaultFile();
                console.log("[filterCreator] filter updated:", filterName);
              } catch (e) {
                console.error("[filterCreator] save failed:", e.message);
              }
            } else {
              console.log("[filterCreator] filter already covers this sender:", filterName);
            }
          } else {
            // ── Build the filter ───────────────────────────────────────────
            const filter = filterList.createFilter(filterName);

            // Guard each property — some may be read-only in certain TB builds.
            try { filter.enabled    = true;                                    } catch (_) {}
            try { filter.filterType = FILTER_TYPE_INBOX | FILTER_TYPE_MANUAL; } catch (_) {}
            try { filter.matchAll   = false; } catch (_) {} // false = OR (any condition)

            _appendSearchTerm(filter, ATTRIB_SENDER, OP_CONTAINS, senderName || senderEmail);
            if (senderEmail && senderEmail !== senderName) {
              _appendSearchTerm(filter, ATTRIB_SENDER, OP_CONTAINS, senderEmail);
            }

            if (targetFolderUri) {
              const action = filter.createAction();
              action.type            = ACTION_MOVE;
              action.targetFolderUri = targetFolderUri;
              filter.appendAction(action);
              console.log("[filterCreator] move action target:", targetFolderUri);
            } else {
              console.warn("[filterCreator] no target folder — filter saved without move action");
            }

            filterList.insertFilterAt(0, filter);
            try {
              filterList.saveToDefaultFile();
              console.log("[filterCreator] filter saved:", filterName);
            } catch (e) {
              console.error("[filterCreator] save failed:", e.message);
            }
          }

          // ── Optionally run all filters on the inbox ────────────────────────
          let filterRun = false;
          if (runAfterCreation) {
            filterRun = _runFiltersOnInbox(server, filterList);
          }

          return { filterName, folderUri: targetFolderUri, alreadyExisted, conditionAdded, filterRun };
        },
      },
    };
  }
};

// ---------------------------------------------------------------------------
// _sanitizeFolderName
//
// Strips characters that are invalid in mail folder names and normalises
// whitespace. Returns "Filtered" if the result would be empty.
// ---------------------------------------------------------------------------
function _sanitizeFolderName(rawName) {
  return (rawName || "")
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "Filtered";
}

// ---------------------------------------------------------------------------
// _resolveOrCreateFolder
//
// Returns the URI string for a folder named `folderName` directly under
// `parentFolder` (an nsIMsgFolder), creating it if absent.
//
// For local folders the object is available synchronously after creation.
// For IMAP, createSubfolder() queues an async server-side CREATE; if the
// local registry does not yet reflect the new folder, the URI is constructed
// from the parent URI to allow the filter to be saved immediately.
// ---------------------------------------------------------------------------
function _resolveOrCreateFolder(parentFolder, folderName) {
  // 1. Already exists?
  try {
    const existing = parentFolder.getChildNamed(folderName);
    console.log("[filterCreator] folder exists:", existing.URI);
    return existing.URI;
  } catch (_) {}

  // 2. Create it.
  try {
    parentFolder.createSubfolder(folderName, null);
    console.log("[filterCreator] createSubfolder() called for:", folderName);
  } catch (e) {
    console.error("[filterCreator] createSubfolder() failed:", e.message);
    return null;
  }

  // 3. Local folders register synchronously; try getChildNamed first.
  try {
    const created = parentFolder.getChildNamed(folderName);
    console.log("[filterCreator] folder created:", created.URI);
    return created.URI;
  } catch (_) {
    // IMAP: the server-side CREATE is async; construct the URI from the
    // parent URI so the filter can be saved without waiting.
    const uri = parentFolder.URI + "/" + encodeURIComponent(folderName);
    console.log("[filterCreator] IMAP async, computed URI:", uri);
    return uri;
  }
}

// ---------------------------------------------------------------------------
// _findFilterByEmail
//
// Returns the first filter in `filterList` that contains a Sender search term
// matching `senderEmail` (case-insensitive), or null if none found.
// Identifying filters by email address rather than display name makes them
// stable across senders that use different display names.
// ---------------------------------------------------------------------------
function _findFilterByEmail(filterList, senderEmail) {
  const needle = senderEmail.toLowerCase();
  for (let i = 0; i < filterList.filterCount; i++) {
    const candidate = filterList.getFilterAt(i);
    if (_hasSearchTerm(candidate, needle)) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// _hasSearchTerm
//
// Returns true if `filter` already contains a Sender term whose value equals
// `str` (case-insensitive).
// ---------------------------------------------------------------------------
function _hasSearchTerm(filter, str) {
  const needle = str.toLowerCase();
  for (const term of filter.searchTerms) {
    if (term.attrib === ATTRIB_SENDER && term.value.str.toLowerCase() === needle) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// _runFiltersOnInbox
//
// Applies all filters in `filterList` to `server`'s inbox — equivalent to
// Tools → Run Filters on Folder. Async; we do not wait for completion.
// Returns true if the call was dispatched, false on any error.
// ---------------------------------------------------------------------------
function _runFiltersOnInbox(server, filterList) {
  try {
    const inboxFolder = server.rootMsgFolder.getFolderWithFlags(0x1000); // nsMsgFolderFlags.Inbox
    if (!inboxFolder) {
      console.warn("[filterCreator] inbox folder not found for:", server.serverURI);
      return false;
    }

    MailServices.filters.applyFiltersToFolders(filterList, [inboxFolder], null);
    console.log("[filterCreator] filters applied to inbox:", inboxFolder.URI);
    return true;
  } catch (e) {
    console.error("[filterCreator] _runFiltersOnInbox failed:", e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// _appendSearchTerm — appends one OR condition (booleanAnd = false) to a filter.
// ---------------------------------------------------------------------------
function _appendSearchTerm(filter, attrib, op, str) {
  const term  = filter.createTerm();
  term.attrib = attrib;
  term.op     = op;

  // term.value must be read, mutated, and written back.
  const value   = term.value;
  value.attrib  = attrib;
  value.str     = str;
  term.value    = value;

  term.booleanAnd = false;
  filter.appendTerm(term);
}
