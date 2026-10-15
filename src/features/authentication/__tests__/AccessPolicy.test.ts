/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdministrator, isAdminPath } from '@/features/authentication/AccessPolicy.ts';

test('native ADMIN role controls management access independently of account name or other roles', () => {
    assert.equal(isAdministrator(true, ['ADMIN']), true);
    assert.equal(isAdministrator(true, ['USER', 'ADMIN']), true);
    assert.equal(isAdministrator(true, ['USER']), false);
    assert.equal(isAdministrator(true, ['VISITOR']), false);
    assert.equal(isAdministrator(true, []), false);
    assert.equal(isAdministrator(true, ['admin']), false);
});

test('startup without a role fails closed and unauthenticated server mode keeps existing functionality', () => {
    assert.equal(isAdministrator(null, []), false);
    assert.equal(isAdministrator(false, []), true);
});

test('management pages and nested direct URLs require an admin', () => {
    for (const path of [
        '/about',
        '/browse',
        '/browse?tab=extensions',
        '/sources/123?query=Monster',
        '/sources/all/search',
        '/sources/123/configure',
        '/extension/package.name',
        '/downloads',
        '/migrate/manual-search/1',
        '/tracker/login/oauth',
        '/settings/categories',
        '/settings/library/duplicates',
        '/settings/download/conversions',
        '/settings/images/processing/serve',
        '/settings/backup',
        '/settings/server',
        '/SETTINGS/SERVER',
        '/settings/%73erver',
        '/settings/webui',
        '/settings/browse/extension-stores',
        '/settings/tracking',
    ]) {
        assert.equal(isAdminPath(path), true, path);
    }
});

test('reading, personal settings and library search remain accessible', () => {
    for (const path of [
        '/library',
        '/library?query=Monster',
        '/manga/1',
        '/manga/1/chapter/1',
        '/updates',
        '/history',
        '/more',
        '/settings',
        '/settings/appearance',
        '/settings/reader',
        '/settings/history',
        '/settings/device',
    ]) {
        assert.equal(isAdminPath(path), false, path);
    }
});

test('restricted paths match complete segments instead of unrelated prefixes or search parameters', () => {
    assert.equal(isAdminPath('/downloads-other'), false);
    assert.equal(isAdminPath('/library?query=/settings/server'), false);
    assert.equal(isAdminPath('/library#downloads'), false);
    assert.equal(isAdminPath('/settings/server/'), true);
    assert.equal(isAdminPath('/settings/%invalid'), true);
});
