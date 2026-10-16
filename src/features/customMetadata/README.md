# Custom work metadata

All fork-specific implementation lives in `src/features/customMetadata/`, independent
of the work's format (manga, comics, books). Custom components, helpers and local
values use neutral names; upstream Suwayomi contracts (`MangaMeta`, `Manga*` types,
`Mangas`, `requestMangaMetadataUpdate`) and API-specific MANGA filters stay unchanged.
The directory move and symbol renames require no stored-data migration.

Upstream call sites explicitly use
these components/helpers; source `title`, `author` and `artist` are never replaced.
No global Manga interception, second persistence layer, server, Docker, download,
migration or tracker changes are needed.

## Files and integration

- `CatalogDetails.tsx`: the two details-page entry points. `CatalogDetails`
  composes the custom title, contributors and alternative titles; `MetadataImportButton`
  opens the shared importer. Key both by work ID to reset editors when navigating.
- `DisplayTitle.tsx`, `Contributors.tsx`, `AlternativeTitles.tsx`:
  individual editors, source restoration and presentation. The alternative-title
  editor is also reused in the import preview.
- `CatalogMetadata.ts`: raw MangaMeta reads/writes, chunk handling, display
  fallback, searchable values and custom Fuse keys.
- `CatalogMetadataValues.ts`: pure alternative-title validation/normalization
  and selective import updates, tested without a browser or server.
- `MetadataImportDialog.tsx`: shared search/selection/preview/confirmation UI.
- `MetadataImportValues.ts`: shared result/contributor types, names and helpers.
- `useCatalogSearch.ts`: 500 ms debounce, numbered pagination, retry and cancellation.
- `CatalogSearchState.ts`: search criteria and page transitions, including an atomic
  pagination reset when the Open Library filter changes.
- `anilist/`, `openLibrary/`: independent clients and conversion functions. Keep
  transport validation, rate limits and provider response shapes out of upstream UI.
- `__tests__/`: Node tests with injected fetch/time and small response fixtures.

### Upstream files to retain

Paths below are relative to `src/`. These 21 upstream files implement required
behavior. The independent `.gitignore` change is outside this feature's scope.

| Purpose                                                                    | Upstream file(s)                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Details: custom rows above status; import button below source              | `features/manga/components/details/MangaDetails.tsx`                                                                                                                                                                                                               |
| Optional metadata on card props                                            | `features/manga/Manga.types.ts`                                                                                                                                                                                                                                    |
| Display titles in library grid/list                                        | `features/manga/components/cards/MangaGridCard.tsx`, `features/manga/components/cards/MangaListCard.tsx`                                                                                                                                                           |
| Library title suggestions                                                  | `features/library/screens/Library.tsx`                                                                                                                                                                                                                             |
| Original/custom search, Fuse and display-title sorting/cache invalidation  | `features/library/hooks/useGetVisibleLibraryMangas.ts`                                                                                                                                                                                                             |
| Manga application title                                                    | `features/manga/screens/Manga.tsx`                                                                                                                                                                                                                                 |
| Sharing title                                                              | `features/manga/components/MangaToolbarMenu.tsx`                                                                                                                                                                                                                   |
| Library removal confirmation                                               | `features/manga/hooks/useManageMangaLibraryState.tsx`                                                                                                                                                                                                              |
| History/update/queue presentation                                          | `features/history/components/ChapterHistoryCard.tsx`, `features/updates/components/ChapterUpdateCard.tsx`, `features/downloads/components/DownloadQueueChapterCard.tsx`                                                                                            |
| Reader title and actions                                                   | `features/reader/screens/Reader.tsx`, `features/reader/overlay/mobile/ReaderOverlayHeaderMobile.tsx`, `features/reader/overlay/navigation/desktop/ReaderNavBarDesktop.tsx`, `features/reader/overlay/navigation/desktop/components/ReaderNavBarDesktopActions.tsx` |
| Type-safe raw metadata keys                                                | `features/metadata/services/MetadataUpdater.ts`                                                                                                                                                                                                                    |
| Metadata available in base Suwayomi queries, including outside the library | `lib/graphql/manga/MangaFragments.ts`                                                                                                                                                                                                                              |
| Matching generated query types                                             | `lib/graphql/generated/graphql.ts`                                                                                                                                                                                                                                 |
| Missing custom messages only                                               | `i18n/locales/en.po`, `i18n/locales/fr.po`                                                                                                                                                                                                                         |

The generated diff adds only the `meta` selections' types (24 properties in the
current baseline). Do not discard them or regenerate unrelated files. The metadata
updater change is type-only: `isMetadataKey: true` permits raw keys without weakening
ordinary prefixed-key checking. Existing chunking and Apollo updates are preserved.

## Storage contract

| Raw MangaMeta key                    | Value                                                   | Restore behavior                                            |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------- |
| `catalog.displayTitle`               | Trimmed text                                            | Empty input deletes the override                            |
| `catalog.authors`, `catalog.artists` | JSON string arrays                                      | Delete to use source; `[]` intentionally hides source names |
| `catalog.alternativeTitles`          | JSON objects with `title`, optional `type` and `source` | Manual editor can save `[]` or remove the override          |
| `catalog.anilistId`                  | Positive integer as text                                | Written only by confirmed AniList import                    |
| `catalog.openLibraryWorkId`          | Work identifier, e.g. `OL37863343W`                     | Written only by confirmed Open Library import               |

Absent/invalid contributor overrides fall back to source values. Missing names
reuse Lingui `Unknown`; author/artist rows and edit buttons always remain visible.
Missing `meta` is supported, including outside the library. Original contributor
splitting remains `Mangas.getAuthors` / `Mangas.getArtists`.

Use `isMetadataKey: true` without WebUI/device prefixes. `requestMangaMetadataUpdate`
and `MetadataChunker` handle long values, stale chunks, persistence and Apollo
updates. Source refresh must not overwrite these raw catalog keys. Associations
from other providers, including historical GCD keys, are left untouched.

Alternative titles are plain, non-clickable text above status, without displayed
provenance. Their editor preserves optional type/source, supports individual edits,
and does not change the primary title. Types/origins are open strings; synonyms
are not assigned an invented language. Entries are trimmed and deduplicated by
NFKC/case normalization, keeping the first provenance. Malformed entries are ignored.

Both normal and fuzzy library search include original and custom titles, alternative
titles, original and custom authors/artists. Empty custom lists do not remove source
names from search. Fuse keeps the upstream title key at weight 10, adds display and
alternative titles at weight 10, and extends author/artist keys at weight 4. Other
fields/weights and remote-source search are unchanged. Metadata-reference updates
rebuild existing search memoization; sorting is invalidated after a displayed rename.

## Manual import

The dialog opens without a selected catalogue and mounts no search hook until an
explicit choice. Search then starts from the current display title. Changing or
clearing the catalogue unmounts its panel, aborts requests and resets drafts. The
selector stays outside the scrollable body. Shared Lingui messages interpolate the
service name rather than duplicating provider-specific messages.

Searching, selecting and canceling never save. Every category starts unchecked.
The user can correct the main/alternative titles, names and contributor categories,
then explicitly confirms replacement of selected categories. Empty/unselected
categories cannot erase customizations. One metadata operation saves usable selected
categories and the provider ID; an ID alone cannot be saved. Success is shown only
after completion; a failed save keeps the draft open and reports the error. The
selected public catalogue page is linked in the preview, not the work details.

### AniList

Public GraphQL client at `https://graphql.anilist.co`, restricted to MANGA.
Search loads 10 results per page; selection loads 25 staff entries per page, with
additional staff fetched only on a button click. Manual changes/removals survive
additional pages; duplicate staff IDs are merged. Only recognized whole roles for
story/script/writing, art/illustration, or both are proposed. Ambiguous roles remain
unassigned for user correction. Romaji/English/native titles and synonyms retain
provenance without inventing languages.

### Open Library

`https://openlibrary.org/search.json?title=...` requests only
`key,title,author_name,cover_i,first_publish_year`, 20 results per page. Explicit
selection fetches `/works/OL…W.json`. Search author names are carried into the
editable preview. No edition or author traversal, automatic illustrator inference
or alternative-title collection is performed. Missing values remain editable and
never erase existing information. Covers use actual returned cover IDs.

The **Comics & Graphic Novels** checkbox is enabled for each new Open Library
panel. The client adds a Solr `q=subject:("Comic books, strips" OR "Comics & Graphic Novels" OR …)`
alongside the existing `title` parameter. Open Library combines the parameters;
free title input stays outside the Solr expression. Subject alternatives are ORed,
not required together. Filtering happens on Open Library before pagination, with
`numFound` determining the next page. Results are never filtered locally by subject.
Changing the checkbox resets the page and cancels/debounces the previous search.
Disabling it omits `q` and restores the original unrestricted title search.

Use analyzed `subject` matching rather than exact `subject_key` matching to retain
subdivisions such as `Comics & graphic novels, manga, fantasy` and
`Comics & Graphic Novels - Superheroes`. Alternatives include comic books/strips,
`Cartoons and comics`, graphic novels, bandes dessinées (accented/unaccented,
singular/plural), romans graphiques and manga. Singular graphic novel and manga
also cover the newer `form:graphic novel` and `form:manga` subjects observed on
One Piece. See the official [Search API](https://openlibrary.org/dev/docs/api/search)
and [subject query documentation](https://openlibrary.org/search/howto#subject-search).

Live checks on 2026-10-16 used the modified client, 20 results per page:

| Title      | Without filter | With filter |
| ---------- | -------------- | ----------- |
| Astérix    | 630            | 77          |
| Tintin     | 573            | 107         |
| Watchmen   | 236            | 22          |
| Batman     | 3319           | 764         |
| Naruto     | 1296           | 123         |
| One Piece  | 1909           | 176         |
| Nude Model | 32             | 0           |

Counts and rankings can change with the catalogue. Representative retained works
include Astérix le Gaulois (`OL267622W`), Tintin au Tibet (`OL151071W`), Watchmen
(`OL2897798W`), Batman (`OL2897789W`), Naruto 33 (`OL13268171W`) and One Piece 1
(`OL8215661W`). Naruto page 2 returned 20 results with previous=1 and next=3.
Additional queries scoped to the first 20 unfiltered work IDs distinguished actual
exclusions from ranking changes: 20/20 Astérix, 15/20 Tintin, 10/20 Watchmen,
18/20 Batman, 19/20 Naruto and 19/20 One Piece survived. Excluded works had no
matching comics subjects, including unrelated prose/medical books and sparsely
categorized works such as Absolute Watchmen (`OL8665966W`).
Nude Model and Other Stories (`OL37863343W`) has no subjects and is excluded by
the filter; disabling it recovers the work. This is why the filter must remain
optional. A subject filter can also retain criticism or novelizations tagged with
comics subjects; it cannot guarantee the physical format of every result.
These live API checks and automated state/client tests do not validate browser
rendering; no browser was available during this change.

### API access and limits

Header checks on 2026-10-15 confirmed `Access-Control-Allow-Origin: *` on AniList
preflight/POST and Open Library search/work GET responses. GCD was removed because
its API did not allow cross-origin reads. No proxy, security bypass or OAuth is used.
Browser/network policy can still block an installation; report errors explicitly.

Clients deliberately remain independent: AniList handles GraphQL errors and its
rate-budget headers; Open Library handles REST search/work validation. Both support
timeouts, cancellation, HTTP errors and 429 cooldowns without automatic retries.
AniList spaces requests by 2100 ms (30/minute degraded limit observed during initial
checks); Open Library by 1100 ms (anonymous limit documented as one/second). Honor
readable Retry-After, with a conservative 60-second fallback; AniList can also use
X-RateLimit-Reset when Retry-After is not exposed by CORS. No background sync or bulk
collection. Browser clients do not override User-Agent.

Review current provider terms before public distribution. AniList restricts mass
collection, competing list/tracker services and commercial usage above its license
threshold. Open Library requests human-triggered lookups, caching where possible
and application registration/identification for regular use. References:

- https://docs.anilist.co/guide/graphql/
- https://docs.anilist.co/guide/rate-limiting
- https://docs.anilist.co/guide/terms-of-use
- https://openlibrary.org/developers/api
- https://openlibrary.org/dev/docs/api/search

## Updating from upstream

1. Adapt the explicit integration points above to upstream component/query changes.
   Keep source fields intact; do not introduce a global Manga transformation.
2. Preserve the storage keys/formats, source fallback, search and display call sites.
   Fuse key names and weights must still match the upstream search configuration.
3. After GraphQL changes, regenerate against the matching server schema with
   `pnpm gql:codegen` and inspect only relevant output. Ordinary checks do not need
   code generation; avoid broad generator churn.
4. Update only changed Lingui messages/source references in English/French. Keep
   `{service}` placeholders aligned. Do not regenerate unrelated locale catalogs.
5. After provider API changes, check official docs, a small real sample and CORS;
   update validators/fixtures and conversion tests before claiming live compatibility.
6. Run the checks below and browser/server regression checks. Never auto-commit.

```sh
node --import tsx --test --test-isolation=none src/features/customMetadata/__tests__/*.test.ts
node_modules/.bin/tsgo --noEmit
node_modules/.bin/oxlint src tools
node_modules/.bin/oxfmt --check src/features/customMetadata src/features/manga/components/details/MangaDetails.tsx src/features/library/hooks/useGetVisibleLibraryMangas.ts
node_modules/.bin/vite build --outDir /tmp/suwayomi-custom-metadata-build
```

Use the installed dependencies and project's Node version. `pnpm test` is upstream's
placeholder; the Node command runs individual tests through tsx without isolation.
Fixtures are small public Open Library responses retrieved on 2026-10-15 from
`/search.json?title=Nude%20Model&limit=5&fields=key,title,author_name,cover_i,first_publish_year,subtitle`
and `/works/OL37863343W.json`. Automated tests use mocked transport, not a live server.

Browser/server checks: source/empty/multiple/Unicode names; empty overrides and
restore; missing/malformed metadata; long chunked values replaced by shorter ones;
manual editors; no request before catalogue choice; rapid search changes, pagination
and cancellation; selective imports and save failure; Apollo immediate updates;
reload/source-refresh persistence, including outside the library; normal/Fuse
search; alphabetical sorting; cards/history/updates/queue, reader and sharing titles;
desktop/mobile layout and keyboard access. Automated tests do not prove persistence
or browser rendering. The user has confirmed Open Library lookup works locally.
