/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogSearchReducer, createCatalogSearchState } from '@/features/customMetadata/CatalogSearchState.ts';

test('each new catalogue panel starts with the comics filter enabled and the first page', () => {
    const initial = createCatalogSearchState('Astérix');
    assert.equal(initial.query, 'Astérix');
    assert.equal(initial.page ?? 1, 1);
    assert.equal(initial.openLibraryComicsOnly, true);
});

test('disabling and re-enabling the filter resets pagination without changing the title', () => {
    let state = createCatalogSearchState('One Piece');
    for (const enabled of [false, true]) {
        state = catalogSearchReducer(state, { type: 'page', page: 4 });
        state = catalogSearchReducer(state, { type: 'openLibraryComicsOnly', enabled });
        assert.equal(state.page ?? 1, 1);
        assert.equal(state.query, 'One Piece');
        assert.equal(state.openLibraryComicsOnly, enabled);
    }
});

test('changing the title resets pagination and preserves a disabled filter', () => {
    let state = createCatalogSearchState('Tintin');
    state = catalogSearchReducer(state, { type: 'openLibraryComicsOnly', enabled: false });
    state = catalogSearchReducer(state, { type: 'page', page: 3 });
    state = catalogSearchReducer(state, { type: 'query', query: 'Nude Model' });
    assert.deepEqual(state, { query: 'Nude Model', openLibraryComicsOnly: false, page: undefined });
});

test('next and previous pages preserve the search criteria', () => {
    let state = createCatalogSearchState('Naruto');
    for (const page of [2, 3, 2, 1]) {
        state = catalogSearchReducer(state, { type: 'page', page });
        assert.deepEqual(state, { query: 'Naruto', openLibraryComicsOnly: true, page });
    }
});
