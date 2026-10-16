/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    OpenLibraryClient,
    OpenLibraryError,
    parseOpenLibrarySearch,
} from '@/features/customMetadata/openLibrary/OpenLibraryClient.ts';
import { mapOpenLibraryContributors } from '@/features/customMetadata/openLibrary/OpenLibraryMapper.ts';
import { catalogSearchReducer, createCatalogSearchState } from '@/features/customMetadata/CatalogSearchState.ts';

const searchFixture: unknown = JSON.parse(
    readFileSync(new URL('./fixtures/openlibrary-search.json', import.meta.url), 'utf8'),
);
const workFixture: unknown = JSON.parse(
    readFileSync(new URL('./fixtures/openlibrary-work.json', import.meta.url), 'utf8'),
);
const response = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(value), { status, headers });
const setup = (responses: (Response | Error)[]) => {
    let time = 1_800_000_000_000;
    const calls: { url: string; init: RequestInit }[] = [];
    const waits: number[] = [];
    const client = new OpenLibraryClient(
        async (input, init) => {
            calls.push({ url: String(input), init: init ?? {} });
            const next = responses.shift();
            if (next instanceof Error) {
                throw next;
            }
            assert.ok(next, 'unexpected extra fetch');
            return next;
        },
        () => time,
        async (milliseconds, signal) => {
            signal?.throwIfAborted();
            waits.push(milliseconds);
            time += milliseconds;
        },
    );
    return { client, calls, waits };
};

test('real search fixture preserves Unicode author names and validated work IDs', () => {
    const page = parseOpenLibrarySearch(searchFixture, 1);
    assert.equal(page.items.length, 5);
    const work = page.items.find((entry) => entry.id === 37863343);
    assert.equal(work?.name, 'Nude Model and Other Stories');
    assert.deepEqual(work?.authors, ['山口つばさ']);
    assert.equal(work?.coverUrl, 'https://covers.openlibrary.org/b/id/15096823-M.jpg?default=false');
    assert.equal(page.next, 2);
    assert.equal(page.previous, undefined);
});

test('search encodes free input and fetches only the explicitly requested page', async () => {
    const { client, calls, waits } = setup([response(searchFixture), response({ docs: [], numFound: 32 })]);
    await client.search('Été & 漫画');
    const url = new URL(calls[0].url);
    assert.equal(url.origin, 'https://openlibrary.org');
    assert.equal(url.searchParams.get('title'), 'Été & 漫画');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(calls.length, 1);
    const page = await client.search('Été & 漫画', 2);
    assert.equal(new URL(calls[1].url).searchParams.get('page'), '2');
    assert.equal(page.previous, 1);
    assert.equal(page.next, undefined);
    assert.deepEqual(waits, [1100]);
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.method, 'GET');
});

test('the default filter combines title with OR subjects on Open Library, including category variants', async () => {
    const { client, calls } = setup([response(searchFixture)]);
    const result = await client.search('  Batman ") OR subject:* & 漫画  ');
    const parameters = new URL(calls[0].url).searchParams;
    const query = parameters.get('q');
    assert.equal(parameters.get('title'), 'Batman ") OR subject:* & 漫画');
    assert.ok(query);
    assert.ok(query.startsWith('subject:('));
    assert.ok(query.endsWith(')'));
    assert.ok(!query.includes('Batman'));
    assert.ok(!query.includes('subject_key'));
    for (const subject of [
        'Comic books, strips',
        'Comic books',
        'Comic strips',
        'Cartoons and comics',
        'Comics & Graphic Novels',
        'Graphic novels',
        'Graphic novel',
        'Bandes dessinées',
        'Bandes dessinees',
        'Bande dessinée',
        'Romans graphiques',
        'Roman graphique',
        'Manga',
    ]) {
        assert.ok(
            query.split(' OR ').some((clause) => clause.includes(`"${subject}"`)),
            subject,
        );
    }
    assert.equal(parameters.get('fields'), 'key,title,author_name,cover_i,first_publish_year');
    // Subjects are deliberately not requested; every usable server result must survive.
    assert.deepEqual(result, parseOpenLibrarySearch(searchFixture, 1));
});

test('toggling the filter restarts the server page and recovers uncategorized works', async () => {
    const { client, calls } = setup([
        response({ docs: [], numFound: 0 }),
        response(searchFixture),
        response({ docs: [], numFound: 0 }),
    ]);
    let state = createCatalogSearchState('Nude Model');
    const search = () => client.search(state.query, state.page, undefined, state.openLibraryComicsOnly);
    assert.deepEqual((await search()).items, []);
    state = catalogSearchReducer(state, { type: 'page', page: 3 });
    state = catalogSearchReducer(state, { type: 'openLibraryComicsOnly', enabled: false });
    assert.ok((await search()).items.some((work) => work.id === 37863343));
    const unfiltered = new URL(calls[1].url).searchParams;
    assert.equal(unfiltered.has('q'), false);
    assert.equal(unfiltered.has('subject'), false);
    assert.equal(unfiltered.get('title'), 'Nude Model');
    assert.equal(unfiltered.get('page'), '1');
    state = catalogSearchReducer(state, { type: 'page', page: 2 });
    state = catalogSearchReducer(state, { type: 'openLibraryComicsOnly', enabled: true });
    await search();
    assert.equal(new URL(calls[2].url).searchParams.get('q'), new URL(calls[0].url).searchParams.get('q'));
    assert.equal(new URL(calls[2].url).searchParams.get('page'), '1');
});

test('filtered pagination uses the server total, including full last pages and partial next pages', async () => {
    const docs = [{ key: '/works/OL1W', title: 'Comic without returned subjects' }];
    const { client, calls } = setup([
        response({ docs, numFound: 40 }),
        response({ docs, numFound: 41 }),
        response({ docs, numFound: 41 }),
    ]);
    assert.deepEqual(await client.search('Comic', 2), {
        items: parseOpenLibrarySearch({ docs, numFound: 40 }, 2).items,
        previous: 1,
        next: undefined,
    });
    assert.equal((await client.search('Comic', 2)).next, 3);
    const last = await client.search('Comic', 3);
    assert.equal(last.next, undefined);
    assert.equal(last.previous, 2);
    const queries = calls.map((call) => new URL(call.url).searchParams.get('q'));
    assert.ok(queries[0]);
    assert.ok(queries.every((query) => query === queries[0]));
    assert.deepEqual(
        calls.map((call) => new URL(call.url).searchParams.get('page')),
        ['2', '2', '3'],
    );
});

test('selected work fetches one detail with no author or edition fan-out', async () => {
    const { client, calls } = setup([response(workFixture)]);
    assert.deepEqual(await client.details(37863343), { id: 37863343, title: 'Nude Model and Other Stories' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://openlibrary.org/works/OL37863343W.json');
});

test('missing optional data and empty results are usable; invalid responses are explicit errors', () => {
    assert.deepEqual(parseOpenLibrarySearch({ docs: [], numFound: 0 }, 1).items, []);
    assert.deepEqual(
        parseOpenLibrarySearch({ docs: [{ key: '/works/OL1W', title: 'Title' }], num_found: 1 }, 1).items,
        [{ id: 1, name: 'Title', authors: [], otherTitles: [] }],
    );
    for (const body of [
        null,
        {},
        [],
        { docs: [], numFound: '1' },
        { docs: [{ key: '/books/OL1M', title: 'Edition' }], numFound: 1 },
    ]) {
        assert.throws(() => parseOpenLibrarySearch(body, 1), OpenLibraryError);
    }
});

test('invalid or mismatched work details and IDs cannot be selected', async () => {
    const { client, calls } = setup([response({ key: '/works/OL2W', title: 'Wrong work' })]);
    await assert.rejects(client.details(1), /Invalid Open Library work response/);
    await Promise.all(
        [0, -1, NaN, 0.5, Infinity].flatMap((id) => [
            assert.rejects(client.details(id), /Invalid Open Library work ID/),
            assert.rejects(client.search('Title', id), /Invalid Open Library page/),
        ]),
    );
    assert.equal(calls.length, 1);
});

test('contributors preserve complete names, deduplicate, and never infer illustrators', () => {
    assert.deepEqual(mapOpenLibraryContributors([' 山口つばさ ', '山口つばさ', 'Jean & Marie', '']), [
        { key: 'openlibrary:山口つばさ', name: '山口つばさ', roles: ['Open Library'], category: 'author' },
        { key: 'openlibrary:Jean & Marie', name: 'Jean & Marie', roles: ['Open Library'], category: 'author' },
    ]);
    assert.deepEqual(mapOpenLibraryContributors([]), []);
});

for (const [header, delay] of [
    ['8', 8000],
    [new Date(1_800_000_012_000).toUTCString(), 12000],
    ['', 60000],
] as const) {
    test(`HTTP 429 respects Retry-After (${header || 'absent'}) without automatic retry`, async () => {
        const { client, calls, waits } = setup([
            response({}, 429, header ? { 'Retry-After': header } : {}),
            response({ docs: [], numFound: 0 }),
        ]);
        await assert.rejects(
            client.search('Title'),
            (error: unknown) => error instanceof OpenLibraryError && error.kind === 'rate-limit' && !!error.retryAt,
        );
        assert.equal(calls.length, 1);
        await client.search('Title');
        assert.deepEqual(waits, [delay]);
    });
}

for (const status of [403, 500]) {
    test(`HTTP ${status} is reported with its status`, async () => {
        const { client } = setup([response({}, status)]);
        await assert.rejects(
            client.search('Title'),
            (error: unknown) => error instanceof OpenLibraryError && error.status === status,
        );
    });
}

test('network failures and malformed JSON are distinguished', async () => {
    const { client } = setup([new TypeError('Failed to fetch'), new Response('<html>not JSON</html>')]);
    await assert.rejects(
        client.search('Title'),
        (error: unknown) => error instanceof OpenLibraryError && error.kind === 'network',
    );
    await assert.rejects(
        client.search('Title'),
        (error: unknown) => error instanceof OpenLibraryError && error.kind === 'invalid',
    );
});

test('aborted and empty searches make no request', async () => {
    const { client, calls } = setup([]);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(client.search('Title', 1, controller.signal));
    assert.deepEqual(await client.search('  '), { items: [] });
    assert.equal(calls.length, 0);
});

test('cancellation reaches an in-flight fetch', async () => {
    const controller = new AbortController();
    const client = new OpenLibraryClient(async (_input, init) => {
        assert.ok(init?.signal);
        return new Promise<Response>((_, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
            controller.abort();
        });
    });
    await assert.rejects(client.details(1, controller.signal), { name: 'AbortError' });
});
