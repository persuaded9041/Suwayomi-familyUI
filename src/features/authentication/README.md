# Family reading access

`AuthManager` reads the native `roles` claim from the access token on login and
refresh. Access is based on `ADMIN`, never a username or user ID. Until a role is
available, management controls are hidden. Servers without authentication retain
their existing unrestricted interface.

`AccessPolicy.ts` lists management routes. `PrivateRoutes` redirects non-admins
to the library even when they enter a restricted URL directly. Navigation and
settings use the same policy/`AdminOnly` component. Reader preferences, filters,
reading progress, bookmarks and history remain available to every account.

Admin controls include catalog metadata editing/imports, library membership and
categories, migrations, browsing/extensions, server settings, backup/restore,
tracking configuration, update triggers, About and download management. Chapter
downloads store files on the server. For non-admins, the reader also skips
download-ahead and never includes files for deletion in progress updates.

Non-admins have no download or export action. No external file service is used.

## Personal settings

Despite the name `GlobalMeta`, metadata reads and writes are scoped to the
authenticated user (`GlobalMetaTable.user`). Appearance and reader defaults
therefore belong to that account, with a device prefix on applicable keys.
Some settings, such as locale, custom themes, hide-history and the device list,
are shared across devices **within that account**, not across all users.
Reader overrides for a work are also user-scoped. The active device selection
and some theme/startup values use browser local storage, whose keys are not
account-specific: switching accounts in the same browser can retain those local
values. This does not share reading progress or server preferences across users.

## Scope and server permissions

This is a WebUI policy, **not server-side authorization**. The JWT is only decoded
to choose the interface; Suwayomi-Server verifies it for API calls. In particular,
the server has no separate admin-only permission for catalog edits or browsing.
A different client can still perform actions allowed by that account's native
permissions. `DOWNLOAD_CHAPTERS` and other management permissions should not be
granted to family reader accounts if API-level restrictions are required. This
change does not modify existing accounts, permissions, server configuration or data.

## Maintenance and validation

Keep restricted paths in `AccessPolicy.ts`; protect newly introduced editing
controls with `AdminOnly` or `AuthManager.useIsAdmin()`. Check both desktop and
mobile actions when updating upstream. Background file operations must also
check `AuthManager.isAdmin()` while preserving reading progress writes.

```sh
node --import tsx --test --test-isolation=none src/features/authentication/__tests__/*.test.ts src/features/customMetadata/__tests__/*.test.ts
```

In a browser, test an `ADMIN`, a `USER`, logout/login, page reload, direct
management URLs, catalog reading/search and chapter reading/bookmarks. Verify
that non-admin reading changes progress without enqueueing downloads or deleting
shared files. No server or account mutations are needed by the automated tests.
