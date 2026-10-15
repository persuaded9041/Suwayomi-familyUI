/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildCatalogImportUpdates,
    normalizeAlternativeTitles,
    parseAlternativeTitles,
} from '@/features/customMetadata/CatalogMetadataValues.ts';
import type { CatalogImport } from '@/features/customMetadata/CatalogMetadataValues.ts';

test('alternative titles trim, deduplicate Unicode and preserve optional type and source', () => {
    assert.deepEqual(
        normalizeAlternativeTitles([
            { title: ' ＡＢＣ ', type: 'romaji', source: ' AniList ' },
            { title: 'abc', type: 'synonym' },
            { title: ' 日本語 ', type: 'native' },
            { title: '', source: 'Manual' },
            { title: 'Manual title' },
        ]),
        [
            { title: 'ＡＢＣ', type: 'romaji', source: 'AniList' },
            { title: '日本語', type: 'native' },
            { title: 'Manual title' },
        ],
    );
});

for (const value of [undefined, 'broken', 'null', '{}', '[null, 42, {"title": 42}]', '[]']) {
    test(`invalid or empty alternatives ${value} are safe`, () => assert.deepEqual(parseAlternativeTitles(value), []));
}

test('alternative parsing ignores bad entries without losing valid manually typed origins', () => {
    assert.deepEqual(parseAlternativeTitles('[{"title":"Valid","source":"Other catalog"},{"title":"Bad","type":1}]'), [
        { title: 'Valid', source: 'Other catalog' },
    ]);
});

for (const [field, value, key] of [
    ['displayTitle', ' My title ', 'catalog.displayTitle'],
    ['authors', ['ONE'], 'catalog.authors'],
    ['artists', ['Artist'], 'catalog.artists'],
    ['alternativeTitles', [{ title: 'Alternative', type: 'synonym' }], 'catalog.alternativeTitles'],
] as const) {
    test(`selecting only ${field} does not touch any other category`, () => {
        const updates = buildCatalogImportUpdates({ anilistId: 74347, [field]: value } as CatalogImport);
        assert.deepEqual(
            updates.map(([name]) => name),
            [key, 'catalog.anilistId'],
        );
        assert.ok(updates.every(([name]) => name.startsWith('catalog.')));
    });
}

test('multiple categories use one update list and never contain original server fields', () => {
    assert.deepEqual(
        buildCatalogImportUpdates({
            anilistId: 1,
            displayTitle: ' Title ',
            authors: [' ONE ', 'ONE', ''],
            artists: ['Artist'],
            alternativeTitles: [{ title: ' Other ', source: 'AniList' }],
        }),
        [
            ['catalog.displayTitle', 'Title'],
            ['catalog.alternativeTitles', '[{"title":"Other","source":"AniList"}]'],
            ['catalog.authors', '["ONE"]'],
            ['catalog.artists', '["Artist"]'],
            ['catalog.anilistId', '1'],
        ],
    );
});

test('empty selected categories are skipped instead of erasing existing customizations', () => {
    assert.deepEqual(
        buildCatalogImportUpdates({
            anilistId: 1,
            displayTitle: ' ',
            authors: ['', ' '],
            artists: ['Valid'],
            alternativeTitles: [],
        }),
        [
            ['catalog.artists', '["Valid"]'],
            ['catalog.anilistId', '1'],
        ],
    );
    assert.throws(() => buildCatalogImportUpdates({ anilistId: 1, authors: [], artists: [] }), /No usable/);
    assert.throws(() => buildCatalogImportUpdates({ anilistId: 1 }), /No usable/);
});

test('invalid associations cannot be saved', () => {
    for (const anilistId of [0, -1, NaN, 1.5, Infinity]) {
        assert.throws(() => buildCatalogImportUpdates({ anilistId, displayTitle: 'Title' }), /Invalid AniList/);
    }
});

test('Open Library import uses shared formats and preserves other associations', () => {
    assert.deepEqual(
        buildCatalogImportUpdates({
            openLibraryWorkId: 'OL37863343W',
            displayTitle: 'Title',
            authors: ['山口つばさ'],
            alternativeTitles: [],
            artists: [],
        }),
        [
            ['catalog.displayTitle', 'Title'],
            ['catalog.authors', '["山口つばさ"]'],
            ['catalog.openLibraryWorkId', 'OL37863343W'],
        ],
    );
    assert.throws(() => buildCatalogImportUpdates({ openLibraryWorkId: 'OL1W', authors: [] }), /No usable/);
});

test('invalid Open Library work IDs cannot be persisted', () => {
    for (const id of ['', 'OL1M', '/works/OL1W', 'OL0W', 'https://example.org']) {
        assert.throws(
            () => buildCatalogImportUpdates({ openLibraryWorkId: id, displayTitle: 'Title' }),
            /Invalid Open Library/,
        );
    }
});
