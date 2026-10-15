/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type {
    MangaArtistInfo,
    MangaAuthorInfo,
    MangaIdInfo,
    MangaMetaInfo,
    MangaTitleInfo,
} from '@/features/manga/Manga.types.ts';
import { convertFromGqlMeta } from '@/features/metadata/services/MetadataConverter.ts';
import { MetadataChunker } from '@/features/metadata/services/MetadataChunker.ts';
import { requestMangaMetadataUpdate } from '@/features/metadata/services/MetadataUpdater.ts';

import type { AlternativeTitle, CatalogImport } from '@/features/customMetadata/CatalogMetadataValues.ts';
import {
    buildCatalogImportUpdates,
    normalizeAlternativeTitles,
    parseAlternativeTitles,
} from '@/features/customMetadata/CatalogMetadataValues.ts';

export const DISPLAY_TITLE_KEY = 'catalog.displayTitle';
export type ContributorRole = 'authors' | 'artists';

/** Read raw catalog keys using the same chunk handling as the official metadata updater. */
const getCatalogMetadata = (work: MangaMetaInfo, key: string): string | undefined => {
    const metadata = convertFromGqlMeta(work.meta);
    if (!metadata) {
        return undefined;
    }
    return MetadataChunker.isChunkedInMetadata(metadata, key)
        ? MetadataChunker.reassembleChunkedValue(metadata, key)
        : metadata[key];
};

export const getCustomDisplayTitle = (work: MangaMetaInfo): string | undefined =>
    getCatalogMetadata(work, DISPLAY_TITLE_KEY)?.trim() || undefined;

/** Presentation only: never replace the source title used for matching and migrations. */
export const getDisplayTitle = (work: MangaTitleInfo & MangaMetaInfo): string =>
    getCustomDisplayTitle(work) ?? work.title;

/** An empty title removes the override, including any stored chunks. */
export const updateDisplayTitle = (work: MangaIdInfo & MangaMetaInfo, title: string): Promise<void> => {
    const value = title.trim();
    return requestMangaMetadataUpdate(work, {
        isMetadataKey: true,
        ...(value ? { update: [[DISPLAY_TITLE_KEY, value]] } : { delete: [DISPLAY_TITLE_KEY] }),
    });
};

const getContributorMetadataKey = (role: ContributorRole): string => `catalog.${role}`;

/** Undefined means source fallback; an empty array is an intentional override. */
export const getCustomContributors = (work: MangaMetaInfo, role: ContributorRole): string[] | undefined => {
    const value = getCatalogMetadata(work, getContributorMetadataKey(role));
    if (value === undefined) {
        return undefined;
    }
    try {
        const names: unknown = JSON.parse(value);
        if (!Array.isArray(names) || !names.every((name): name is string => typeof name === 'string')) {
            return undefined;
        }
        return names.map((name) => name.trim()).filter(Boolean);
    } catch {
        return undefined;
    }
};

/** Library search includes source names even when the display override is empty. */
export const getSearchableContributors = (
    work: MangaMetaInfo & MangaAuthorInfo & MangaArtistInfo,
    role: ContributorRole,
): string[] => {
    const original = role === 'authors' ? work.author : work.artist;
    return [...new Set([...(original ? [original] : []), ...(getCustomContributors(work, role) ?? [])])];
};

/** Only metadata is changed. Undefined restores the source; [] saves an empty list. */
export const updateContributors = (
    work: MangaIdInfo & MangaMetaInfo,
    role: ContributorRole,
    names: string[] | undefined,
): Promise<void> => {
    const key = getContributorMetadataKey(role);
    return requestMangaMetadataUpdate(work, {
        isMetadataKey: true,
        ...(names === undefined
            ? { delete: [key] }
            : { update: [[key, JSON.stringify(names.map((name) => name.trim()).filter(Boolean))]] }),
    });
};

export const getAlternativeTitles = (work: MangaMetaInfo): AlternativeTitle[] =>
    parseAlternativeTitles(getCatalogMetadata(work, 'catalog.alternativeTitles'));

export const getSearchableTitles = (work: MangaTitleInfo & MangaMetaInfo): string[] => [
    ...new Set([work.title, getDisplayTitle(work), ...getAlternativeTitles(work).map(({ title }) => title)]),
];

/** Custom Fuse keys stay local; keep the upstream source-title key and other weights unchanged. */
export const CATALOG_FUZZY_SEARCH_KEYS = [
    {
        name: 'displayTitle',
        weight: 10,
        getFn: (work: MangaTitleInfo & MangaMetaInfo) => [
            getDisplayTitle(work),
            ...getAlternativeTitles(work).map(({ title }) => title),
        ],
    },
    {
        name: 'author',
        weight: 4,
        getFn: (work: MangaMetaInfo & MangaAuthorInfo & MangaArtistInfo) => getSearchableContributors(work, 'authors'),
    },
    {
        name: 'artist',
        weight: 4,
        getFn: (work: MangaMetaInfo & MangaAuthorInfo & MangaArtistInfo) => getSearchableContributors(work, 'artists'),
    },
];

export const updateAlternativeTitles = (
    work: MangaIdInfo & MangaMetaInfo,
    titles: AlternativeTitle[] | undefined,
): Promise<void> =>
    requestMangaMetadataUpdate(work, {
        isMetadataKey: true,
        ...(titles === undefined
            ? { delete: ['catalog.alternativeTitles'] }
            : { update: [['catalog.alternativeTitles', JSON.stringify(normalizeAlternativeTitles(titles))]] }),
    });

/** One existing MangaMeta operation, limited to the explicitly confirmed usable categories. */
export const importCatalogMetadata = (work: MangaIdInfo & MangaMetaInfo, proposal: CatalogImport): Promise<void> =>
    requestMangaMetadataUpdate(work, {
        isMetadataKey: true,
        update: buildCatalogImportUpdates(proposal),
    });
