/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

type CatalogSearchState = { query: string; page?: number; openLibraryComicsOnly: boolean };
type CatalogSearchAction =
    | { type: 'query'; query: string }
    | { type: 'page'; page: number | undefined }
    | { type: 'openLibraryComicsOnly'; enabled: boolean };

export const createCatalogSearchState = (query: string): CatalogSearchState => ({
    query,
    openLibraryComicsOnly: true,
});

/** Criteria and page change together so a new search always starts on its first page. */
export const catalogSearchReducer = (state: CatalogSearchState, action: CatalogSearchAction): CatalogSearchState => {
    switch (action.type) {
        case 'query':
            return { ...state, query: action.query, page: undefined };
        case 'openLibraryComicsOnly':
            return { ...state, openLibraryComicsOnly: action.enabled, page: undefined };
        case 'page':
            return { ...state, page: action.page };
        default:
            return state;
    }
};
