# Move this eMail! — Thunderbird Add-on

A Thunderbird add-on that adds a **"Move this eMail!"** button to the message
toolbar. One click creates a Move-To-Folder filter for the current sender and
optionally runs it immediately — no dialogs, no manual typing.

## What it does

When you view an email and click the toolbar button, the add-on:

1. Creates a filter named after the sender that moves matching mail to a
   dedicated folder (created automatically if it does not exist).
2. The filter matches on both the sender's **display name** and **email address**
   (OR conditions), so name variations from the same sender are all caught.
3. If a filter for that **email address** already exists, the current display name
   is added as a new condition rather than creating a duplicate.
4. A notification confirms what happened.

### Settings

Open **Add-ons and Themes → Move this eMail! → Preferences** to configure:

| Setting | Default | Description |
|---|---|---|
| **Run filter after creation** | off | Immediately applies all inbox filters after saving, moving existing matching messages. |
| **Move to Local Folders** | off | Creates the destination folder under Local Folders instead of inside the email account. |
| **Parent folder name** | *(empty)* | If set, all sender folders are created as subfolders of this folder (created automatically if absent). |

## Requirements

- **Thunderbird 128 or later**

## Installation

### From addons.thunderbird.net *(coming soon)*

Search for **"Move this eMail!"** on
[addons.thunderbird.net](https://addons.thunderbird.net) and click **Add to Thunderbird**.

### From GitHub Releases

1. Download the latest `.xpi` from the
   [Releases](https://github.com/thomasuebel/move-this-email/releases/latest) page.
2. In Thunderbird open **Tools → Add-ons and Themes**.
3. Click the ⚙ gear icon → **Install Add-on From File…** and select the `.xpi`.

### Temporary load (development / testing)

1. Open `about:debugging` in Thunderbird
   (**Tools → Developer Tools → Debug Add-ons**).
2. Click **Load Temporary Add-on…** and select `manifest.json` from this repository.

The add-on stays loaded until Thunderbird is restarted.

## Notes

- Invalid folder name characters (`/ \ : * ? " < > |`) are replaced with `_`.
- On **IMAP** accounts, folder creation is queued asynchronously; the folder may
  take a moment to appear in the folder pane.
- When **Move to Local Folders** is enabled, the filter still lives on the IMAP
  account's filter list — that is where incoming mail is processed.

## Development

```bash
git clone git@github.com:thomasuebel/move-this-email.git
cd move-this-email
npm install
```

No build step is required. Load the add-on as a temporary extension (see above)
and edit the source files directly. Reload from `about:debugging` to pick up changes.

### Project layout

```
manifest.json          WebExtension manifest (MV2)
background.js          Button handler — parses sender, reads settings, calls experiment
options.html / .js     Settings page
icons/icon.svg         Toolbar button icon
experiment/
  schema.json          Privileged API declaration (WebExtension Experiment)
  api.js               XPCOM: folder creation, filter building, filter execution
test/
  parseSender.test.mjs Unit tests (Node built-in test runner)
.github/workflows/
  ci.yml               Lint + test + build XPI; publish release on v* tag
```

### Running tests and linting

```bash
npm test        # node --test
npm run lint    # web-ext lint
npm run build   # produces move-this-email.xpi
```

## Releasing a new version

1. Bump `"version"` in `manifest.json` and `package.json`.
2. Add an entry to `CHANGELOG.md`.
3. Commit, tag, and push:
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
4. CI builds the XPI and creates a GitHub Release automatically.
5. Upload the XPI to ATN manually (or automate with `AMO_JWT_ISSUER` /
   `AMO_JWT_SECRET` GitHub secrets once an ATN API key is obtained).

## Contributing

Pull requests are welcome. Please open an issue first for anything beyond a small
bug fix so we can agree on the approach. Make sure the add-on loads cleanly as a
temporary extension before submitting.

## License

[MIT](LICENSE) — © 2026 Thomas Uebel
