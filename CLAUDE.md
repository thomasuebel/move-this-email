# CLAUDE.md — Move this eMail!

Thunderbird WebExtension add-on. Adds a toolbar button in the message view that
creates a Move-To-Folder filter for the current sender in one click — no dialogs.
Filters are identified by email address; repeated clicks on the same sender add
new display name conditions to the existing filter rather than creating duplicates.

Repository: https://github.com/thomasuebel/move-this-email
Extension ID: `move-this-email@thomasuebel.de`
Developer: Thomas Uebel — https://thomasuebel.de
License: MIT
Target: Thunderbird 128+ (developed on TB 140.8)

---

## Project layout

```
manifest.json              WebExtension manifest (MV2)
background.js              Button handler — parses sender, reads settings, calls experiment
options.html / options.js  Settings page (storage-backed, saves on change)
icons/icon.svg             Toolbar button icon
experiment/
  schema.json              Privileged API declaration (WebExtension Experiment)
  api.js                   XPCOM: folder creation, filter building, filter execution
test/
  parseSender.test.mjs     Unit tests (Node built-in runner — no framework)
.github/workflows/
  ci.yml                   test → lint → build XPI; publish GitHub Release on v* tag
package.json               Dev tooling only (web-ext, node test runner)
CHANGELOG.md               User-facing release notes
ATN_SUBMISSION.md          Draft copy for addons.thunderbird.net submission
```

---

## Architecture

Two execution contexts that cannot share objects directly:

| Layer | File | Environment |
|---|---|---|
| WebExtension | `background.js`, `options.js` | Thunderbird WebExtension sandbox (`browser.*` APIs only) |
| Experiment API | `experiment/api.js` | Privileged chrome process (`Components`, `Services`, `ChromeUtils`, XPCOM) |

`background.js` calls `browser.filterCreator.openFilterEditor({...})` which
crosses the sandbox boundary. **Objects passed across this boundary are cloned,
not shared by reference** — this is why `FilterEditor.xhtml` could not be used
(the `filterCreated` flag written by the dialog was invisible to the caller).

---

## Feature behaviour

### Filter creation
- Filter name: `senderName || senderEmail` from the displayed message.
- Search terms: OR conditions — one for display name, one for email address.
- Move action: target folder URI (account root or Local Folders, with optional
  parent folder nesting).
- Saved via `filterList.insertFilterAt(0, filter)` + `filterList.saveToDefaultFile()`.

### Duplicate detection (`_findFilterByEmail`)
- Scans all filters in the list for a Sender term matching the sender's email
  (case-insensitive).
- If found: check whether the current display name is already a term
  (`_hasSearchTerm`). If not, append it as a new OR condition and re-save.
- The filter name and folder target are never changed on update.

### Run after creation (`_runFiltersOnInbox`)
- Calls `MailServices.filters.applyFiltersToFolders(filterList, [inboxFolder], null)`.
- Runs **all** filters in the list — equivalent to Tools → Run Filters on Folder.
- Inbox identified via `server.rootMsgFolder.getFolderWithFlags(0x1000)`.

### Folder resolution (`_resolveOrCreateFolder`)
- Accepts an `nsIMsgFolder` as the parent (not a server), so it works at any
  nesting level.
- Tries `getChildNamed()` first (folder already exists).
- Falls back to `createSubfolder()` then `getChildNamed()` again.
- IMAP async fallback: if `getChildNamed()` still fails after creation (Gmail
  and some other IMAP servers don't register the folder locally until the server
  round-trip completes), the URI is computed as `parentFolder.URI + "/" +
  encodeURIComponent(folderName)`. The IMAP CREATE is in-flight; the folder
  will exist before any filter moves mail.

### Parent folder option
- If `parentFolderName` is set, the parent folder is resolved/created first under
  the root, then the sender folder is created under it.
- IMAP edge case: if the parent folder was just created and isn't yet in the local
  registry, the sender folder is placed at root level for that one call. On the
  next button press (after IMAP syncs) it goes under the parent correctly.

---

## Settings (browser.storage.local)

| Key | Type | Default | Description |
|---|---|---|---|
| `runAfterCreation` | boolean | false | Run all inbox filters after saving |
| `useLocalFolders` | boolean | false | Create destination folder under Local Folders |
| `parentFolderName` | string | `""` | Name of parent folder to nest sender folders under |

---

## Key internal APIs (experiment/api.js)

| API | Purpose |
|---|---|
| `MailServices.accounts.getAccount(id)` | Look up account by ID |
| `MailServices.accounts.localFoldersServer` | Get the Local Folders server |
| `MailServices.folderLookup.getFolderForURL(uri)` | Resolve a folder from its URI |
| `MailServices.filters.applyFiltersToFolders(list, folders, window)` | Run filters on folders |
| `server.getEditableFilterList(null)` | Get the mutable filter list |
| `server.rootMsgFolder` | Root of the account's folder tree |
| `nsIMsgFolder.getChildNamed(name)` | Get child folder by name (throws if absent) |
| `nsIMsgFolder.createSubfolder(name, null)` | Create subfolder; async on IMAP |
| `filterList.createFilter(name)` | Create a new filter object |
| `filter.createTerm()` / `filter.createAction()` | Build search terms and actions |
| `filter.searchTerms` | Iterable collection of `nsIMsgSearchTerm` |
| `filterList.insertFilterAt(0, filter)` | Prepend filter to list |
| `filterList.saveToDefaultFile()` | Persist filter list to disk |
| `Services.wm.getMostRecentWindow("mail:3pane")` | Get main Thunderbird window |

## IDL constants (plain integers — not accessible via Ci)

```js
FILTER_TYPE_INBOX  = 0x1  // nsMsgFilterType.InboxRule
FILTER_TYPE_MANUAL = 0x4  // nsMsgFilterType.Manual
ATTRIB_SENDER      = 1    // nsMsgSearchAttrib.Sender
OP_CONTAINS        = 0    // nsMsgSearchOp.Contains
ACTION_MOVE        = 1    // nsMsgFilterAction.MoveToFolder
// nsMsgFolderFlags.Inbox = 0x1000  (used in getFolderWithFlags)
```

---

## Known constraints

- **`FilterEditor.xhtml` unusable from experiment context**: Args are cloned
  across the sandbox boundary; the `filterCreated` flag written inside the dialog
  is never visible to the caller. The extension saves directly and skips the dialog.
- **IMAP folder registration**: `createSubfolder()` on Gmail/some IMAP servers
  does not register the folder locally before the server round-trip. Mitigated by
  computing the URI directly. First-run with a new parent folder may place the
  sender folder at root level until IMAP syncs.
- **`filter.matchAll`**: Set to `false` for OR logic, individually guarded with
  try/catch as the property is read-only in some TB builds.
- **`applyFiltersToFolders` accepts JS arrays** in TB 128+ XPConnect — no need
  to construct `nsIArray` manually.

---

## Development workflow

```bash
# Install dev tools
npm install

# Run unit tests
npm test

# Lint WebExtension API usage
npm run lint

# Build XPI
npm run build
```

Load the add-on temporarily: `about:debugging` → **Load Temporary Add-on…** →
select `manifest.json`. Reload from `about:debugging` after source changes.

---

## Release process

1. Bump `"version"` in `manifest.json` **and** `package.json` (keep in sync).
2. Add a section to `CHANGELOG.md`.
3. Commit, tag, push:
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
4. CI builds the XPI and creates a GitHub Release automatically.
5. Upload XPI to ATN manually (see `ATN_SUBMISSION.md` for submission copy).
   Automate with `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` GitHub secrets if desired.

---

## Code style

- `"use strict"` in every JS file.
- `const` by default; `let` only when reassignment is required.
- Descriptive variable names — no single-letter abbreviations except loop indices.
- Named constants for all IDL integers; no bare magic numbers.
- `console.error` for failures; `console.log` for diagnostic flow; `console.warn`
  for recoverable unexpected states.
- Guard volatile TB API properties individually with try/catch so one failure
  does not block the rest of the flow.
- Tests: Node built-in `node:test` + `node:assert/strict`. File extension: `.test.mjs`.
  Functions under test are inlined in the test file (background.js runs in the
  TB sandbox and cannot be imported by Node).
