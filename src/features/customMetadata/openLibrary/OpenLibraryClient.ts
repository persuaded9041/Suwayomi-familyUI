/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { CatalogSearchItem, CatalogSearchPage } from '@/features/customMetadata/MetadataImportValues.ts';

export class OpenLibraryError extends Error {
    constructor(
        readonly kind: 'network' | 'http' | 'invalid' | 'rate-limit',
        message: string,
        readonly retryAt?: number,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'OpenLibraryError';
    }
}
const ORIGIN = 'https://openlibrary.org';
const PAGE_SIZE = 20;
// Search's analyzed subject field also matches subdivisions (e.g. "… - Superheroes")
// and newer form:manga / form:graphic novel tags. Avoid exact subject_key matching.
// https://openlibrary.org/search/howto#subject-search
const COMICS_SUBJECTS = [
    'Comic books, strips',
    'Comic books',
    'Comic strips',
    'Comic strip',
    'Comics & Graphic Novels',
    'Cartoons and comics',
    'Graphic novels',
    'Graphic novel',
    'Bandes dessinées',
    'Bandes dessinees',
    'Bande dessinée',
    'Bande dessinee',
    'Romans graphiques',
    'Roman graphique',
    'Manga',
    'Mangas',
];
const COMICS_QUERY = `subject:(${COMICS_SUBJECTS.map((subject) => `"${subject}"`).join(' OR ')})`;
const record = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
export const getOpenLibraryWorkKey = (value: unknown): string | undefined =>
    typeof value === 'string' && /^\/works\/OL[1-9]\d*W$/.test(value) ? value : undefined;
export const getOpenLibraryUrl = (id: number): string => `${ORIGIN}/works/OL${id}W`;
export type OpenLibraryWork = { id: number; title: string };

export const parseOpenLibrarySearch = (body: unknown, page: number): CatalogSearchPage => {
    const data = record(body);
    const count = data?.numFound ?? data?.num_found;
    if (!Array.isArray(data?.docs) || typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        throw new OpenLibraryError('invalid', 'Unexpected Open Library search response');
    }
    const items: CatalogSearchItem[] = data.docs.flatMap((value) => {
        const doc = record(value);
        const key = getOpenLibraryWorkKey(doc?.key);
        const id = key ? Number(key.slice(9, -1)) : NaN;
        const name = text(doc?.title);
        if (!key || !Number.isSafeInteger(id) || !name) {
            return [];
        }
        const cover = doc?.cover_i;
        const authors = Array.isArray(doc?.author_name) ? [...new Set(doc.author_name.map(text).filter(Boolean))] : [];
        return [
            {
                id,
                name,
                authors,
                otherTitles: authors,
                ...(typeof doc?.first_publish_year === 'number' && Number.isInteger(doc.first_publish_year)
                    ? { yearBegan: doc.first_publish_year }
                    : {}),
                ...(typeof cover === 'number' && Number.isSafeInteger(cover) && cover > 0
                    ? { coverUrl: `https://covers.openlibrary.org/b/id/${cover}-M.jpg?default=false` }
                    : {}),
            },
        ];
    });
    if (data.docs.length && !items.length) {
        throw new OpenLibraryError('invalid', 'Unusable Open Library search results');
    }
    return {
        items,
        next: page * PAGE_SIZE < count ? page + 1 : undefined,
        previous: page > 1 ? page - 1 : undefined,
    };
};

const wait = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const timer = setTimeout(
            () => {
                signal?.removeEventListener('abort', abort);
                resolve();
            },
            Math.min(milliseconds, 2_147_483_647),
        );
        function abort() {
            clearTimeout(timer);
            reject(signal?.reason);
        }
        signal?.addEventListener('abort', abort, { once: true });
    });

/** Anonymous direct GETs only. No proxy, credentials, linked-page prefetch or automatic retry. */
export class OpenLibraryClient {
    private nextRequestAt = 0;
    private blockedUntil = 0;
    constructor(
        private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
        private readonly now: () => number = Date.now,
        private readonly pause: typeof wait = wait,
    ) {}

    private reserve(signal?: AbortSignal): Promise<void> {
        signal?.throwIfAborted();
        const milliseconds = Math.max(this.nextRequestAt, this.blockedUntil) - this.now();
        if (milliseconds > 0) {
            return this.pause(milliseconds, signal).then(() => this.reserve(signal));
        }
        this.nextRequestAt = this.now() + 1100;
        return Promise.resolve();
    }

    private async request(url: string, signal?: AbortSignal): Promise<unknown> {
        await this.reserve(signal);
        signal?.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new Error('Open Library request timed out')), 20_000);
        try {
            const response = await this.fetcher(url, {
                method: 'GET',
                credentials: 'omit',
                redirect: 'error',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (response.status === 429) {
                const retry = response.headers.get('Retry-After');
                const seconds = retry === null ? NaN : Number(retry);
                let until = this.now() + 60_000;
                if (Number.isFinite(seconds)) {
                    until = this.now() + Math.max(0, seconds) * 1000;
                } else if (Number.isFinite(Date.parse(retry ?? ''))) {
                    until = Date.parse(retry ?? '');
                }
                this.blockedUntil = Math.max(this.blockedUntil, this.now() + 1000, until);
                throw new OpenLibraryError('rate-limit', 'Open Library HTTP 429', this.blockedUntil, 429);
            }
            if (!response.ok) {
                throw new OpenLibraryError('http', `Open Library HTTP ${response.status}`, undefined, response.status);
            }
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                throw new OpenLibraryError('invalid', 'Open Library did not return valid JSON');
            }
            if (!record(body)) {
                throw new OpenLibraryError('invalid', 'Unexpected Open Library response');
            }
            return body;
        } catch (error) {
            if (signal?.aborted) {
                throw signal.reason;
            }
            if (error instanceof OpenLibraryError) {
                throw error;
            }
            throw new OpenLibraryError('network', error instanceof Error ? error.message : String(error));
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }

    async search(query: string, page = 1, signal?: AbortSignal, comicsOnly = true): Promise<CatalogSearchPage> {
        if (!Number.isSafeInteger(page) || page < 1) {
            throw new OpenLibraryError('invalid', 'Invalid Open Library page');
        }
        if (!query.trim()) {
            return { items: [] };
        }
        const parameters = new URLSearchParams({
            title: query.trim(),
            page: String(page),
            limit: String(PAGE_SIZE),
            fields: 'key,title,author_name,cover_i,first_publish_year',
        });
        if (comicsOnly) {
            // Open Library combines q with the separately escaped title parameter.
            // Keep free input out of the Solr expression and pagination on the server.
            parameters.set('q', COMICS_QUERY);
        }
        return parseOpenLibrarySearch(await this.request(`${ORIGIN}/search.json?${parameters}`, signal), page);
    }

    async details(id: number, signal?: AbortSignal): Promise<OpenLibraryWork> {
        if (!Number.isSafeInteger(id) || id < 1) {
            throw new OpenLibraryError('invalid', 'Invalid Open Library work ID');
        }
        const data = record(await this.request(`${getOpenLibraryUrl(id)}.json`, signal));
        const title = text(data?.title);
        if (getOpenLibraryWorkKey(data?.key) !== `/works/OL${id}W` || !title) {
            throw new OpenLibraryError('invalid', 'Invalid Open Library work response');
        }
        return { id, title };
    }
}
export const openLibraryClient = new OpenLibraryClient();
