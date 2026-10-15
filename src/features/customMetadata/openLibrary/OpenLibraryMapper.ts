/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ImportContributor } from '@/features/customMetadata/MetadataImportValues.ts';

/** Search exposes authors without reliable illustration roles. Never infer artists. */
export const mapOpenLibraryContributors = (names: readonly string[]): ImportContributor[] =>
    [...new Set(names.map((name) => name.trim()).filter(Boolean))].map((name) => ({
        key: `openlibrary:${name}`,
        name,
        roles: ['Open Library'],
        category: 'author',
    }));
