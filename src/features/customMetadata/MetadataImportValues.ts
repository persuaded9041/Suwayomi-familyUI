/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export type MetadataCatalogue = 'anilist' | 'openlibrary';
export const METADATA_CATALOGUE_NAMES: Record<MetadataCatalogue, string> = {
    anilist: 'AniList',
    openlibrary: 'Open Library',
};
export type ContributorCategory = 'author' | 'artist' | 'both' | 'unassigned';
export type ImportContributor = {
    key: string;
    name: string;
    roles: string[];
    category: ContributorCategory;
    edited?: boolean;
};
export type CatalogSearchItem = {
    id: number;
    authors?: string[];
    name: string;
    otherTitles?: string[];
    coverUrl?: string;
    yearBegan?: number;
    format?: string;
};
export type CatalogSearchPage = { items: CatalogSearchItem[]; next?: number; previous?: number };

export const getContributorNames = (
    contributors: readonly ImportContributor[],
    category: 'author' | 'artist',
): string[] => [
    ...new Set(
        contributors
            .filter((entry) => entry.category === category || entry.category === 'both')
            .map(({ name }) => name.trim())
            .filter(Boolean),
    ),
];
