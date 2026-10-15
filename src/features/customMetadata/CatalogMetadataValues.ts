/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/** Open strings allow manual entries from other sources without inventing a language. */
export type AlternativeTitle = { title: string; type?: string; source?: string };

export const normalizeAlternativeTitles = (entries: readonly AlternativeTitle[]): AlternativeTitle[] => {
    const seen = new Set<string>();
    return entries.flatMap((entry) => {
        const title = entry.title.trim();
        const key = title.normalize('NFKC').toLowerCase();
        if (!title || seen.has(key)) {
            return [];
        }
        seen.add(key);
        return [
            {
                title,
                ...(entry.type?.trim() ? { type: entry.type.trim() } : {}),
                ...(entry.source?.trim() ? { source: entry.source.trim() } : {}),
            },
        ];
    });
};

export const parseAlternativeTitles = (value: string | undefined): AlternativeTitle[] => {
    try {
        const entries: unknown = JSON.parse(value ?? '[]');
        if (!Array.isArray(entries)) {
            return [];
        }
        return normalizeAlternativeTitles(
            entries.filter(
                (entry): entry is AlternativeTitle =>
                    entry !== null &&
                    typeof entry === 'object' &&
                    typeof entry.title === 'string' &&
                    (entry.type === undefined || typeof entry.type === 'string') &&
                    (entry.source === undefined || typeof entry.source === 'string'),
            ),
        );
    } catch {
        return [];
    }
};

export type CatalogImport = {
    displayTitle?: string;
    alternativeTitles?: AlternativeTitle[];
    authors?: string[];
    artists?: string[];
} & ({ anilistId: number; openLibraryWorkId?: never } | { openLibraryWorkId: string; anilistId?: never });

/** Build only explicitly selected, usable categories. Empty imports never erase existing data. */
export const buildCatalogImportUpdates = (proposal: CatalogImport): [string, string][] => {
    const associations: [string, string][] = [];
    if (proposal.openLibraryWorkId !== undefined) {
        if (!/^OL[1-9]\d*W$/.test(proposal.openLibraryWorkId) || proposal.anilistId !== undefined) {
            throw new Error('Invalid Open Library work ID');
        }
        associations.push(['catalog.openLibraryWorkId', proposal.openLibraryWorkId]);
    } else {
        if (!Number.isSafeInteger(proposal.anilistId) || !proposal.anilistId || proposal.anilistId <= 0) {
            throw new Error('Invalid AniList ID');
        }
        associations.push(['catalog.anilistId', String(proposal.anilistId)]);
    }
    const updates: [string, string][] = [];
    const title = proposal.displayTitle?.trim();
    if (title) {
        updates.push(['catalog.displayTitle', title]);
    }
    if (proposal.alternativeTitles) {
        const titles = normalizeAlternativeTitles(proposal.alternativeTitles);
        if (titles.length) {
            updates.push(['catalog.alternativeTitles', JSON.stringify(titles)]);
        }
    }
    (['authors', 'artists'] as const).forEach((role) => {
        const names = [...new Set(proposal[role]?.map((name) => name.trim()).filter(Boolean) ?? [])];
        if (names.length) {
            updates.push([`catalog.${role}`, JSON.stringify(names)]);
        }
    });
    if (!updates.length) {
        throw new Error('No usable metadata selected');
    }
    return [...updates, ...associations];
};
