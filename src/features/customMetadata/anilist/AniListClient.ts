/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export type AniListMedia = {
    id: number;
    type?: string | null;
    siteUrl?: string | null;
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
    synonyms?: (string | null)[] | null;
    coverImage?: { medium?: string | null } | null;
    startDate?: { year?: number | null } | null;
    format?: string | null;
    staff?: { edges?: (AniListStaffEdge | null)[] | null; pageInfo?: { hasNextPage?: boolean | null } | null } | null;
};

export type AniListStaffEdge = {
    role?: string | null;
    node?: { id?: number; name?: { full?: string | null; native?: string | null } | null } | null;
};

export type AniListSearchPage = { media: AniListMedia[]; hasNextPage: boolean };
export type AniListErrorKind = 'network' | 'http' | 'graphql' | 'rate-limit' | 'invalid';
export class AniListError extends Error {
    constructor(
        public readonly kind: AniListErrorKind,
        message: string,
        public readonly retryAt?: number,
    ) {
        super(message);
        this.name = 'AniListError';
    }
}

const SUMMARY_FIELDS = `id type siteUrl title { romaji english native } coverImage { medium } startDate { year } format`;
const SEARCH_QUERY = `query SearchManga($search: String!, $page: Int!) {
    Page(page: $page, perPage: 10) {
        pageInfo { hasNextPage }
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) { ${SUMMARY_FIELDS} }
    }
}`;
const DETAILS_QUERY = `query MangaMetadata($id: Int!, $page: Int!) {
    Media(id: $id, type: MANGA) {
        ${SUMMARY_FIELDS}
        synonyms
        staff(page: $page, perPage: 25) {
            pageInfo { hasNextPage }
            edges { role node { id name { full native } } }
        }
    }
}`;

const delay = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, milliseconds);
        function abort() {
            clearTimeout(timer);
            reject(signal?.reason);
        }
        signal?.addEventListener('abort', abort, { once: true });
    });

const isMedia = (media: AniListMedia | null | undefined): media is AniListMedia =>
    !!media && Number.isSafeInteger(media.id) && media.id > 0 && media.type === 'MANGA';

/** Isolated public client: no Suwayomi authentication, cookies, cache or Apollo configuration. */
export class AniListClient {
    private nextRequestAt = 0;
    private blockedUntil = 0;

    constructor(
        private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
        private readonly now: () => number = Date.now,
        private readonly wait: typeof delay = delay,
    ) {}

    private reserveRequest(signal?: AbortSignal): Promise<void> {
        signal?.throwIfAborted();
        const waitFor = Math.max(this.nextRequestAt, this.blockedUntil) - this.now();
        if (waitFor > 0) {
            return this.wait(waitFor, signal).then(() => this.reserveRequest(signal));
        }
        // Currently documented degraded limit: 30/minute, plus a burst limiter.
        this.nextRequestAt = this.now() + 2100;
        return Promise.resolve();
    }

    private retryTime(headers: Headers): number {
        const retry = headers.get('Retry-After');
        const seconds = retry === null ? NaN : Number(retry);
        const retryAt = Number.isFinite(seconds) ? this.now() + Math.max(0, seconds) * 1000 : Date.parse(retry ?? '');
        const reset = Number(headers.get('X-RateLimit-Reset')) * 1000;
        let until = this.now() + 60_000;
        if (Number.isFinite(retryAt)) {
            until = retryAt;
        } else if (reset > this.now()) {
            until = reset;
        }
        return Math.max(this.now() + 1000, until);
    }

    private async request<T>(
        query: string,
        variables: Record<string, string | number>,
        signal?: AbortSignal,
    ): Promise<T> {
        await this.reserveRequest(signal);
        signal?.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(() => controller.abort(new Error('AniList request timed out')), 20_000);
        try {
            const response = await this.fetcher('https://graphql.anilist.co', {
                method: 'POST',
                credentials: 'omit',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query, variables }),
            });
            if (response.status === 429 || response.headers.get('X-RateLimit-Remaining') === '0') {
                this.blockedUntil = Math.max(this.blockedUntil, this.retryTime(response.headers));
            }
            if (response.status === 429) {
                throw new AniListError('rate-limit', 'AniList HTTP 429', this.blockedUntil);
            }
            if (!response.ok) {
                throw new AniListError('http', `AniList HTTP ${response.status}`);
            }
            const body = (await response.json()) as {
                data?: T | null;
                errors?: { message?: string; status?: number }[];
            };
            if (body?.errors?.length) {
                const limited = body.errors.some((error) => error.status === 429);
                if (limited) {
                    this.blockedUntil = Math.max(this.blockedUntil, this.retryTime(response.headers));
                }
                throw new AniListError(
                    limited ? 'rate-limit' : 'graphql',
                    body.errors.map((error) => error.message || 'GraphQL error').join('; '),
                    limited ? this.blockedUntil : undefined,
                );
            }
            if (!body?.data || typeof body.data !== 'object') {
                throw new AniListError('invalid', 'Invalid AniList response');
            }
            return body.data;
        } catch (error) {
            if (signal?.aborted) {
                throw signal.reason;
            }
            if (error instanceof AniListError) {
                throw error;
            }
            throw new AniListError('network', error instanceof Error ? error.message : String(error));
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
        }
    }

    async search(search: string, page = 1, signal?: AbortSignal): Promise<AniListSearchPage> {
        const term = search.trim();
        if (!term) {
            return { media: [], hasNextPage: false };
        }
        const data = await this.request<{
            Page?: { media?: (AniListMedia | null)[] | null; pageInfo?: { hasNextPage?: boolean } };
        }>(SEARCH_QUERY, { search: term, page }, signal);
        if (!Array.isArray(data.Page?.media)) {
            throw new AniListError('invalid', 'Missing AniList results');
        }
        return { media: data.Page.media.filter(isMedia), hasNextPage: data.Page.pageInfo?.hasNextPage === true };
    }

    async details(id: number, page = 1, signal?: AbortSignal): Promise<AniListMedia> {
        const data = await this.request<{ Media?: AniListMedia | null }>(DETAILS_QUERY, { id, page }, signal);
        if (!isMedia(data.Media) || data.Media.id !== id) {
            throw new AniListError('invalid', 'AniList manga not found');
        }
        return data.Media;
    }
}

export const aniListClient = new AniListClient();
export const getAniListUrl = (id: number): string => `https://anilist.co/manga/${id}`;
