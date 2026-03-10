# ATN Submission Draft — Move this eMail!

This file contains copy ready to paste into the
[addons.thunderbird.net](https://addons.thunderbird.net/en-US/developers/)
developer submission form. Review and adjust before submitting.

---

## Add-on name

Move this eMail!

---

## Summary (≤ 250 characters, shown in search results)

One-click toolbar button that creates a Move-To-Folder filter for the current
sender — folder created automatically, filter runs immediately if you want.

---

## Description (shown on the listing page — Markdown supported on ATN)

**Move this eMail!** adds a button to Thunderbird's message toolbar.
Click it while reading an email and a filter is created instantly — no dialogs,
no manual typing.

**What happens on click:**

- A filter named after the sender is added to your account's filter list.
- A destination folder is created automatically (or reused if it already exists).
- The filter matches on both the sender's display name and email address, so
  variations in how the same sender labels themselves are all caught.
- If a filter for that email address already exists, the current display name is
  added as a new OR condition — no duplicate filters.
- A native notification confirms what was done.

**Settings (via Add-on Preferences):**

| Setting | Description |
|---|---|
| Run filter after creation | Applies all inbox filters immediately, moving existing matching messages right away. |
| Move to Local Folders | Creates the destination folder under Local Folders instead of inside the email account. |
| Parent folder name | Optional. All sender folders are created as children of this named folder. |

**Requirements:** Thunderbird 128 or later.

---

## Privacy policy

This add-on does not collect, transmit, or store any personal data. All
processing happens locally within Thunderbird. No network requests are made
beyond normal Thunderbird mail operations. No analytics or telemetry of any
kind is included.

---

## Reviewer notes (visible only to ATN reviewers)

Thank you for reviewing this add-on.

**Why a WebExtension Experiment is required:**

The stable Thunderbird WebExtension API does not expose:
- `nsIMsgFilterList` / `nsIMsgFilter` — needed to create, populate, and save
  message filters programmatically.
- `nsIMsgFolder.createSubfolder()` — needed to create the destination folder.
- `nsIMsgFilterService.applyFiltersToFolders()` — needed to run filters on the
  inbox immediately after creation.

These are internal Thunderbird APIs accessible only via XPCOM. The Experiment
API (`experiment/api.js`) runs in the `addon_parent` scope (chrome process) and
is the standard mechanism for accessing such APIs until they are exposed through
the stable WebExtension layer.

**What the experiment does (experiment/api.js):**

1. Looks up the account by ID via `MailServices.accounts.getAccount()`.
2. Resolves or creates the destination folder via `nsIMsgFolder.createSubfolder()`.
3. Builds a filter (`nsIMsgFilter`) with OR search terms for the sender's name
   and email address, and a Move-To-Folder action.
4. Saves the filter via `nsIMsgFilterList.saveToDefaultFile()`.
5. Optionally runs all inbox filters via
   `MailServices.filters.applyFiltersToFolders()`.

**No user data leaves the device.** The experiment only reads sender information
from the currently displayed message (already available to the extension via the
`messagesRead` permission) and writes to the local filter list file.

**Source code:** https://github.com/thomasuebel/move-this-email

**Build instructions (for reviewer reproducibility):**

```bash
git clone https://github.com/thomasuebel/move-this-email.git
cd move-this-email
zip -r move-this-email.xpi manifest.json background.js options.html options.js icons/ experiment/
```

The XPI is a plain ZIP of the listed files. No build tooling or transpilation
is involved — what you see in the source is what runs.

---

## Categories (select on ATN)

- Filters

## Tags (optional, helps discoverability)

filter, sort, move, sender, automation, productivity

---

## Support / source URL

https://github.com/thomasuebel/move-this-email

## Support email

*(your preferred contact address)*
