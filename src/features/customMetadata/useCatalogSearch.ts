/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useState } from 'react';
import type { CatalogSearchPage, MetadataCatalogue } from '@/features/customMetadata/MetadataImportValues.ts';
import { aniListClient } from '@/features/customMetadata/anilist/AniListClient.ts';
import { mapAniListTitles } from '@/features/customMetadata/anilist/AniListMapper.ts';
import { openLibraryClient } from '@/features/customMetadata/openLibrary/OpenLibraryClient.ts';

/** Two explicit catalogues share debounce/cancellation, not their wire formats or persistence. */
export const useCatalogSearch = (
    catalogue: MetadataCatalogue,
    query: string,
    page: number | undefined,
    enabled: boolean,
) => {
    const term = query.trim();
    const [result, setResult] = useState<CatalogSearchPage>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setResult(undefined);
        setError(undefined);
        setLoading(enabled && !!term);
        if (!enabled || !term) {
            return () => controller.abort();
        }
        const load = async (): Promise<CatalogSearchPage> => {
            if (catalogue === 'openlibrary') {
                return openLibraryClient.search(term, page ?? 1, controller.signal);
            }
            const currentPage = page ?? 1;
            const data = await aniListClient.search(term, currentPage, controller.signal);
            return {
                items: data.media.map((media) => {
                    const titles = mapAniListTitles(media).map((entry) => entry.title);
                    return {
                        id: media.id,
                        name: titles[0] ?? `#${media.id}`,
                        otherTitles: titles.slice(1),
                        coverUrl: media.coverImage?.medium ?? undefined,
                        yearBegan: media.startDate?.year ?? undefined,
                        format: media.format?.replaceAll('_', ' ') ?? undefined,
                    };
                }),
                next: data.hasNextPage ? currentPage + 1 : undefined,
                previous: currentPage > 1 ? currentPage - 1 : undefined,
            };
        };
        const timer = setTimeout(() => {
            void load()
                .then((data) => {
                    if (!controller.signal.aborted) {
                        setResult(data);
                    }
                })
                .catch((reason: unknown) => {
                    if (!controller.signal.aborted) {
                        setError(reason);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setLoading(false);
                    }
                });
        }, 500);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [catalogue, term, page, enabled, attempt]);
    return { result, loading, error, retry: () => setAttempt((value) => value + 1) };
};
