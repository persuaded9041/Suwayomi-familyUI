/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AppRoutes } from '@/base/AppRoute.constants.ts';

/** UI policy only: server permissions remain responsible for API authorization. */
export const isAdministrator = (authRequired: boolean | null, roles: readonly string[]): boolean =>
    authRequired === false || roles.includes('ADMIN');

const ADMIN_PATHS = [
    AppRoutes.about.path,
    AppRoutes.browse.path(),
    AppRoutes.sources.path,
    AppRoutes.extension.path,
    AppRoutes.downloads.path,
    AppRoutes.migrate.path,
    AppRoutes.tracker.path,
    AppRoutes.settings.children.categories.path,
    AppRoutes.settings.children.library.path,
    AppRoutes.settings.children.download.path,
    AppRoutes.settings.children.images.path,
    AppRoutes.settings.children.backup.path,
    AppRoutes.settings.children.server.path,
    AppRoutes.settings.children.webui.path,
    AppRoutes.settings.children.browse.path,
    AppRoutes.settings.children.tracking.path,
];

export const isAdminPath = (path: string): boolean => {
    const [rawPathname] = path.split(/[?#]/);
    let pathname: string;
    try {
        // React Router also accepts encoded segments and case-insensitive paths.
        pathname = decodeURIComponent(rawPathname).toLowerCase();
    } catch {
        return true;
    }
    return ADMIN_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};
