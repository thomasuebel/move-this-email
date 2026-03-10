# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-03-10

### Added
- Toolbar button in the message view to create a Move-To-Folder filter in one click.
- Filter is identified by the sender's **email address**; clicking again on a message
  from the same address with a different display name adds the new name as an
  additional OR condition rather than creating a duplicate filter.
- Destination folder is created automatically (or reused if it already exists).
- **Settings** (accessible via the add-on preferences):
  - *Run filter after creation* — applies all inbox filters immediately after saving,
    moving all matching messages to their destination folder.
  - *Move to Local Folders* — creates the destination folder under Local Folders
    instead of inside the email account.
  - *Parent folder name* — if set, all sender folders are created as subfolders of
    this named folder, which is itself created automatically if absent.
- Native OS notification confirms the outcome (filter created / updated / applied).
- Duplicate-safe: if the filter already fully covers the sender, a notification says
  so rather than silently doing nothing.
- Requires Thunderbird 128 or later.
