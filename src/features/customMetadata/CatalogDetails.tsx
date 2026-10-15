/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AuthManager } from '@/features/authentication/AuthManager.ts';
import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import type { ImportableWork } from '@/features/customMetadata/MetadataImportDialog.tsx';
import { MetadataImportDialog } from '@/features/customMetadata/MetadataImportDialog.tsx';

import type { MangaLocationState, MangaSourceIdInfo } from '@/features/manga/Manga.types.ts';
import type { SourceIdInfo } from '@/features/source/Source.types.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';
import { DisplayTitle } from '@/features/customMetadata/DisplayTitle.tsx';
import { Contributors } from '@/features/customMetadata/Contributors.tsx';
import { AlternativeTitles } from '@/features/customMetadata/AlternativeTitles.tsx';

/** Keep the official details component independent of the individual custom rows. */
export const CatalogDetails = ({
    work,
    mode,
}: {
    work: ImportableWork & MangaSourceIdInfo & { source?: SourceIdInfo | null };
    mode: MangaLocationState['mode'];
}) => (
    <>
        <DisplayTitle work={work} />
        <Contributors
            work={work}
            contributorRole="authors"
            originalNames={Mangas.getAuthors(work)}
            sourceId={work.source?.id}
            mode={mode}
        />
        <Contributors
            work={work}
            contributorRole="artists"
            originalNames={Mangas.getArtists(work)}
            sourceId={work.source?.id}
            mode={mode}
        />
        <AlternativeTitles work={work} />
    </>
);

/** Discreet entry point for metadata imports; providers remain inside the dialog. */
export const MetadataImportButton = ({ work }: { work: ImportableWork }) => {
    const { t } = useLingui();
    const [open, setOpen] = useState(false);
    const isAdmin = AuthManager.useIsAdmin();
    if (!isAdmin) {
        return null;
    }
    return (
        <>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
                <Button size="small" onClick={() => setOpen(true)}>{t`Import metadata`}</Button>
            </Stack>
            {open && <MetadataImportDialog work={work} onClose={() => setOpen(false)} />}
        </>
    );
};
