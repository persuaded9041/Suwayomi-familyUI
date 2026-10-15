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
    classifyAniListRole,
    mapAniListContributors,
    mapAniListTitles,
    mergeAniListContributors,
} from '@/features/customMetadata/anilist/AniListMapper.ts';
import { getContributorNames } from '@/features/customMetadata/MetadataImportValues.ts';
import type { AniListStaffEdge } from '@/features/customMetadata/anilist/AniListClient.ts';

const edge = (id: number, name: string, role: string): AniListStaffEdge => ({
    role,
    node: { id, name: { full: name } },
});

test('romaji, English, native and synonyms retain their provenance without invented languages', () => {
    assert.deepEqual(
        mapAniListTitles({
            id: 1,
            title: { romaji: 'Wanpanman', english: 'One-Punch Man', native: 'ワンパンマン' },
            synonyms: [' OPM ', 'OPM', null, ''],
        }),
        [
            { title: 'Wanpanman', type: 'romaji', source: 'AniList' },
            { title: 'One-Punch Man', type: 'english', source: 'AniList' },
            { title: 'ワンパンマン', type: 'native', source: 'AniList' },
            { title: 'OPM', type: 'synonym', source: 'AniList' },
        ],
    );
});

test('missing titles and null synonyms are safe', () => {
    assert.deepEqual(mapAniListTitles({ id: 1 }), []);
    assert.deepEqual(mapAniListTitles({ id: 1, title: { romaji: 'Same', english: 'Same' }, synonyms: null }), [
        { title: 'Same', type: 'romaji', source: 'AniList' },
    ]);
});

for (const [role, category] of [
    ['Story', 'author'],
    [' SCRIPT ', 'author'],
    ['Art', 'artist'],
    ['Illustration', 'artist'],
    ['Story & Art', 'both'],
    ['Story and Art', 'both'],
    ['Story/Art', 'both'],
    ['Story Assistant', 'unassigned'],
    ['Original Creator', 'unassigned'],
    ['Character Design', 'unassigned'],
    ['Editor', 'unassigned'],
    ['', 'unassigned'],
    ['Some Unknown Role', 'unassigned'],
] as const) {
    test(`role ${role || '(empty)'} maps conservatively to ${category}`, () =>
        assert.equal(classifyAniListRole(role), category));
}

test('multiple people and multiple roles deduplicate; unknown staff remains unassigned', () => {
    const result = mapAniListContributors([
        edge(1, 'ONE', 'Story'),
        edge(2, 'Yuusuke Murata', 'Art'),
        edge(3, 'Second Artist', 'Art'),
        edge(4, 'Second Writer', 'Story'),
        edge(1, 'ONE', 'Art'),
        edge(5, 'Unknown Role Person', 'Assistant'),
        null,
        { node: null },
    ]);
    assert.deepEqual(getContributorNames(result, 'author'), ['ONE', 'Second Writer']);
    assert.deepEqual(getContributorNames(result, 'artist'), ['ONE', 'Yuusuke Murata', 'Second Artist']);
    assert.equal(result.find((person) => person.name === 'Unknown Role Person')?.category, 'unassigned');
});

test('native names and story/art credits work with incomplete staff data', () => {
    const result = mapAniListContributors([{ role: 'Story & Art', node: { name: { native: '井上雄彦' } } }]);
    assert.deepEqual(getContributorNames(result, 'author'), ['井上雄彦']);
    assert.deepEqual(getContributorNames(result, 'artist'), ['井上雄彦']);
});

test('loading another staff page combines roles while preserving manual corrections', () => {
    const current = mapAniListContributors([edge(1, 'ONE', 'Story')]);
    const incoming = mapAniListContributors([edge(1, 'ONE', 'Art'), edge(2, 'Writer', 'Story')]);
    assert.equal(mergeAniListContributors(current, incoming)[0].category, 'both');
    const corrected = [{ ...current[0], edited: true, name: 'Corrected', category: 'unassigned' as const }];
    const merged = mergeAniListContributors(corrected, incoming);
    assert.equal(merged[0].name, 'Corrected');
    assert.equal(merged[0].category, 'unassigned');
    assert.deepEqual(merged[0].roles, ['Story', 'Art']);
});
