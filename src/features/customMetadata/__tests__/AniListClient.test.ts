/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AniListClient, AniListError } from '@/features/customMetadata/anilist/AniListClient.ts';

const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });
const createClient = (responses: (Response | Error)[]) => {
    let time = 1_800_000_000_000;
    const calls: RequestInit[] = [];
    const waits: number[] = [];
    const client = new AniListClient(
        async (_, init) => {
            calls.push(init ?? {});
            const result = responses.shift();
            if (result instanceof Error) {
                throw result;
            }
            assert.ok(result, 'unexpected extra fetch');
            return result;
        },
        () => time,
        async (milliseconds, signal) => {
            signal?.throwIfAborted();
            waits.push(milliseconds);
            time += milliseconds;
        },
    );
    return { client, calls, waits, now: () => time };
};

test('default fetch retains the global receiver required by browsers', async (context) => {
    context.mock.method(
        globalThis,
        'fetch',
        function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
            assert.equal(
                this,
                globalThis,
                'fetch must be called on the browser global, not the AniListClient instance',
            );
            assert.equal(input, 'https://graphql.anilist.co');
            assert.equal(init?.method, 'POST');
            assert.equal(init?.credentials, 'omit');
            return Promise.resolve(response({ data: { Page: { media: [{ id: 1, type: 'MANGA' }] } } }));
        },
    );
    const client = new AniListClient();
    assert.deepEqual(await client.search('Manga'), { media: [{ id: 1, type: 'MANGA' }], hasNextPage: false });
});

test('search is MANGA-only, paginated and public, and filters incomplete/foreign records', async () => {
    const { client, calls } = createClient([
        response({
            data: {
                Page: {
                    pageInfo: { hasNextPage: true },
                    media: [{ id: 1, type: 'MANGA' }, null, { id: 2, type: 'ANIME' }, { title: null }],
                },
            },
        }),
    ]);
    const result = await client.search(' One Punch Man ', 2);
    assert.deepEqual(result, { media: [{ id: 1, type: 'MANGA' }], hasNextPage: true });
    const body = JSON.parse(String(calls[0].body));
    assert.deepEqual(body.variables, { search: 'One Punch Man', page: 2 });
    assert.match(body.query, /type: MANGA/);
    assert.match(body.query, /perPage: 10/);
    assert.equal(calls[0].credentials, 'omit');
    assert.equal((calls[0].headers as Record<string, string>).Authorization, undefined);
});

test('empty search and no results do not trigger unnecessary fetches', async () => {
    const { client, calls } = createClient([response({ data: { Page: { media: [] } } })]);
    assert.deepEqual(await client.search(' '), { media: [], hasNextPage: false });
    assert.equal(calls.length, 0);
    assert.deepEqual(await client.search('Nothing'), { media: [], hasNextPage: false });
});

test('detail reads only the selected manga and a bounded staff page', async () => {
    const { client, calls } = createClient([
        response({ data: { Media: { id: 74347, type: 'MANGA', title: null, synonyms: null, staff: null } } }),
    ]);
    assert.equal((await client.details(74347, 2)).id, 74347);
    const body = JSON.parse(String(calls[0].body));
    assert.deepEqual(body.variables, { id: 74347, page: 2 });
    assert.match(body.query, /perPage: 25/);
});

for (const [body, kind] of [
    [{ errors: [{ message: 'Bad query' }], data: { Page: { media: [] } } }, 'graphql'],
    [{ data: null }, 'invalid'],
    [{ data: { Page: null } }, 'invalid'],
] as const) {
    test(`bad GraphQL body is reported as ${kind}, even with partial data`, async () => {
        const { client } = createClient([response(body)]);
        await assert.rejects(client.search('Manga'), (error) => error instanceof AniListError && error.kind === kind);
    });
}

test('network and HTTP failures are explicit', async () => {
    const { client } = createClient([new TypeError('offline'), response({}, 503)]);
    await assert.rejects(client.search('Manga'), (error) => error instanceof AniListError && error.kind === 'network');
    await assert.rejects(client.search('Manga'), /HTTP 503/);
});

test('mismatched or non-MANGA selection is rejected', async () => {
    const { client } = createClient([response({ data: { Media: { id: 2, type: 'MANGA' } } })]);
    await assert.rejects(client.details(1), /not found/);
});

test('consecutive calls are spaced for the documented 30/minute limit', async () => {
    const { client, waits } = createClient([
        response({ data: { Page: { media: [] } } }),
        response({ data: { Page: { media: [] } } }),
    ]);
    await client.search('First');
    await client.search('Second');
    assert.deepEqual(waits, [2100]);
});

for (const [headers, expected] of [
    [{ 'Retry-After': '15' }, 15_000],
    [{ 'Retry-After': new Date(1_800_000_020_000).toUTCString() }, 20_000],
    [{ 'X-RateLimit-Reset': '1800000025' }, 25_000],
    [{}, 60_000],
] as const) {
    test(`429 honors cooldown ${expected}ms and retries only on another explicit call`, async () => {
        const { client, calls, waits, now } = createClient([
            response({}, 429, headers),
            response({ data: { Page: { media: [] } } }),
        ]);
        const start = now();
        await assert.rejects(
            client.search('First'),
            (error) =>
                error instanceof AniListError && error.kind === 'rate-limit' && error.retryAt === start + expected,
        );
        assert.equal(calls.length, 1);
        await client.search('Second');
        assert.deepEqual(waits, [expected]);
    });
}

test('GraphQL 429 and exhausted remaining budget also block subsequent calls', async () => {
    const { client, waits } = createClient([
        response({ errors: [{ status: 429, message: 'Too Many Requests' }] }),
        response({ data: { Page: { media: [] } } }, 200, { 'X-RateLimit-Remaining': '0' }),
        response({ data: { Page: { media: [] } } }),
    ]);
    await assert.rejects(
        client.search('First'),
        (error) => error instanceof AniListError && error.kind === 'rate-limit',
    );
    await client.search('Second');
    await client.search('Third');
    assert.deepEqual(waits, [60_000, 60_000]);
});

test('an already obsolete request never reaches the network', async () => {
    const { client, calls } = createClient([]);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(client.search('Manga', 1, controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, 0);
});

test('cancellation is forwarded to an in-flight fetch', async () => {
    const { promise: ready, resolve: started } = Promise.withResolvers<void>();
    const client = new AniListClient(
        async (_, init) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
                started();
            }),
    );
    const controller = new AbortController();
    const request = client.search('Manga', 1, controller.signal);
    await ready;
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
});
