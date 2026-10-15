/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AdminOnly } from '@/features/authentication/components/AdminOnly.tsx';
import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { ClipBoardGuard } from '@/base/components/guard/ClipBoardGuard.tsx';
import { SearchLink } from '@/features/manga/components/details/SearchLink.tsx';
import EditIcon from '@mui/icons-material/Edit';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { copyToClipboard, getErrorMessage } from '@/lib/HelperFunctions.ts';
import type { MangaIdInfo, MangaMetaInfo, MangaSourceIdInfo, MangaTitleInfo } from '@/features/manga/Manga.types.ts';
import {
    getCustomDisplayTitle,
    getDisplayTitle,
    updateDisplayTitle,
} from '@/features/customMetadata/CatalogMetadata.ts';

export const DisplayTitleButton = ({ work }: { work: MangaIdInfo & MangaMetaInfo & MangaTitleInfo }) => {
    const { t } = useLingui();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const customTitle = getCustomDisplayTitle(work);

    const close = () => {
        if (!saving) {
            setOpen(false);
        }
    };

    const save = async (title: string) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await updateDisplayTitle(work, title);
            setOpen(false);
        } catch (error) {
            makeToast(t`Could not save display title`, 'error', getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <CustomTooltip title={t`Edit display title`}>
                <IconButton
                    size="small"
                    aria-label={t`Edit display title`}
                    onClick={() => {
                        setDraft(customTitle ?? work.title);
                        setOpen(true);
                    }}
                >
                    <EditIcon fontSize="small" />
                </IconButton>
            </CustomTooltip>
            <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.trim()) {
                            void save(draft);
                        }
                    }}
                >
                    <DialogTitle>{t`Edit display title`}</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            fullWidth
                            margin="dense"
                            label={t`Display title`}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            disabled={saving}
                            helperText={t`Original title: ${work.title}`}
                        />
                    </DialogContent>
                    <DialogActions sx={{ flexWrap: 'wrap' }}>
                        <Button disabled={saving || !customTitle} onClick={() => void save('')}>
                            {t`Restore original title`}
                        </Button>
                        <Button disabled={saving} onClick={close}>{t`Cancel`}</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={saving || !draft.trim() || draft.trim() === customTitle}
                        >
                            {t`Save`}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </>
    );
};

/** Keep the title, source search, clipboard action and editor together at the details integration point. */
export const DisplayTitle = ({ work }: { work: MangaIdInfo & MangaMetaInfo & MangaTitleInfo & MangaSourceIdInfo }) => {
    const { t } = useLingui();
    const displayTitle = getDisplayTitle(work);
    return (
        <Stack sx={{ flexDirection: 'row', gap: 1, alignItems: 'flex-start', mb: 1 }}>
            <SearchLink query={work.title} sourceId={work.sourceId} mode="source.global-search">
                <Typography variant="h5" component="h2" sx={{ wordBreak: 'break-word' }}>
                    {displayTitle}
                </Typography>
            </SearchLink>
            <AdminOnly>
                <DisplayTitleButton key={work.id} work={work} />
            </AdminOnly>
            <ClipBoardGuard>
                <CustomTooltip title={t`Copy`}>
                    <IconButton onClick={() => copyToClipboard(displayTitle)} color="inherit">
                        <ContentCopyIcon fontSize="small" />
                    </IconButton>
                </CustomTooltip>
            </ClipBoardGuard>
        </Stack>
    );
};
