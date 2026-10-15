/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { AniListMedia, AniListStaffEdge } from '@/features/customMetadata/anilist/AniListClient.ts';
import type { AlternativeTitle } from '@/features/customMetadata/CatalogMetadataValues.ts';
import { normalizeAlternativeTitles } from '@/features/customMetadata/CatalogMetadataValues.ts';

import type { ContributorCategory, ImportContributor } from '@/features/customMetadata/MetadataImportValues.ts';
const cleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const classifyAniListRole = (role: string): ContributorCategory => {
    const normalized = role.normalize('NFKC').toLowerCase().trim().replaceAll(/\s+/g, ' ');
    if (/^(story|scenario|script|writer|writing)$/.test(normalized)) {
        return 'author';
    }
    if (/^(art|illustration|illustrations|illustrator|drawing)$/.test(normalized)) {
        return 'artist';
    }
    if (/^(story|writing|script)\s*(?:&|and|\/|\+|,)\s*(art|illustration|illustrations)$/.test(normalized)) {
        return 'both';
    }
    return 'unassigned';
};

export const mapAniListTitles = (media: AniListMedia): AlternativeTitle[] =>
    normalizeAlternativeTitles([
        ...(['romaji', 'english', 'native'] as const).map((type) => ({
            title: cleanText(media.title?.[type]),
            type,
            source: 'AniList',
        })),
        ...(Array.isArray(media.synonyms) ? media.synonyms : []).map((title) => ({
            title: cleanText(title),
            type: 'synonym',
            source: 'AniList',
        })),
    ]);

/** Unknown roles remain explicitly unassigned; they are never inferred by substring. */
export const mapAniListContributors = (edges: readonly (AniListStaffEdge | null)[]): ImportContributor[] => {
    const contributors = new Map<string, ImportContributor>();
    edges.forEach((edge) => {
        const name = cleanText(edge?.node?.name?.full) || cleanText(edge?.node?.name?.native);
        if (!name) {
            return;
        }
        const key = edge?.node?.id ? `staff-${edge.node.id}` : `name-${name.normalize('NFKC').toLowerCase()}`;
        const role = cleanText(edge?.role);
        const category = classifyAniListRole(role);
        const existing = contributors.get(key);
        if (existing) {
            if (role && !existing.roles.includes(role)) {
                existing.roles.push(role);
            }
            if (category !== 'unassigned') {
                existing.category =
                    existing.category === 'unassigned' || existing.category === category ? category : 'both';
            }
        } else {
            contributors.set(key, { key, name, roles: role ? [role] : [], category });
        }
    });
    return [...contributors.values()];
};

/** Loading another staff page must preserve manual corrections in the preview. */
export const mergeAniListContributors = (
    current: readonly ImportContributor[],
    incoming: readonly ImportContributor[],
): ImportContributor[] => {
    const merged = new Map(current.map((entry) => [entry.key, entry]));
    incoming.forEach((entry) => {
        const previous = merged.get(entry.key);
        if (!previous) {
            merged.set(entry.key, entry);
            return;
        }
        let { category } = previous;
        if (entry.category !== 'unassigned' && entry.category !== previous.category) {
            category = previous.category === 'unassigned' ? entry.category : 'both';
        }
        merged.set(entry.key, {
            ...previous,
            roles: [...new Set([...previous.roles, ...entry.roles])],
            category: previous.edited ? previous.category : category,
        });
    });
    return [...merged.values()];
};
