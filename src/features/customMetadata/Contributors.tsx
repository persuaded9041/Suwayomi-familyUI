/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Fragment, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { Metadata } from '@/base/components/texts/Metadata.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import type { MangaIdInfo, MangaLocationState, MangaMetaInfo } from '@/features/manga/Manga.types.ts';
import type { SourceIdInfo } from '@/features/source/Source.types.ts';
import type { ContributorRole } from '@/features/customMetadata/CatalogMetadata.ts';
import { getCustomContributors, updateContributors } from '@/features/customMetadata/CatalogMetadata.ts';
import { SearchLink } from '@/features/manga/components/details/SearchLink.tsx';

export const Contributors = ({
    work,
    contributorRole,
    originalNames,
    sourceId,
    mode,
}: {
    work: MangaIdInfo & MangaMetaInfo;
    contributorRole: ContributorRole;
    originalNames: string[] | undefined;
    sourceId: SourceIdInfo['id'] | undefined;
    mode: MangaLocationState['mode'];
}) => {
    const { t } = useLingui();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<{ id: number; name: string }[]>([]);
    const nextId = useRef(0);
    const [saving, setSaving] = useState(false);
    const customNames = getCustomContributors(work, contributorRole);
    const sourceNames = originalNames?.map((name) => name.trim()).filter(Boolean) ?? [];
    const names = customNames ?? sourceNames;
    const label = contributorRole === 'authors' ? t`Author` : t`Artist`;
    const editLabel = contributorRole === 'authors' ? t`Edit authors` : t`Edit artists`;

    const close = () => {
        if (!saving) {
            setOpen(false);
        }
    };

    const save = async (values: string[] | undefined) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await updateContributors(work, contributorRole, values);
            setOpen(false);
        } catch (error) {
            makeToast(t`Could not save changes`, 'error', getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Metadata
                title={label}
                value={
                    <>
                        {names.length
                            ? [...new Set(names)].map((name, index) => (
                                  <Fragment key={name}>
                                      {index > 0 && ', '}
                                      <SearchLink query={name} sourceId={sourceId} mode={mode} />
                                  </Fragment>
                              ))
                            : t`Unknown`}
                        <CustomTooltip title={editLabel}>
                            <IconButton
                                size="small"
                                aria-label={editLabel}
                                onClick={() => {
                                    setDraft(names.map((name) => ({ id: nextId.current++, name })));
                                    setOpen(true);
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </CustomTooltip>
                    </>
                }
            />
            <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save(draft.map(({ name }) => name));
                    }}
                >
                    <DialogTitle>{editLabel}</DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {t`Source`}: {sourceNames.join(', ') || t`Unknown`}
                        </Typography>
                        {draft.map(({ id, name }, index) => (
                            <Stack key={id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <TextField
                                    autoFocus={index === 0}
                                    fullWidth
                                    margin="dense"
                                    label={label}
                                    value={name}
                                    onChange={(event) =>
                                        setDraft((current) =>
                                            current.map((entry) =>
                                                entry.id === id ? { ...entry, name: event.target.value } : entry,
                                            ),
                                        )
                                    }
                                    disabled={saving}
                                />
                                <CustomTooltip title={t`Remove`}>
                                    <IconButton
                                        aria-label={t`Remove`}
                                        disabled={saving}
                                        onClick={() =>
                                            setDraft((current) => current.filter((entry) => entry.id !== id))
                                        }
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </CustomTooltip>
                            </Stack>
                        ))}
                        <Button
                            disabled={saving}
                            onClick={() => {
                                const entry = { id: nextId.current++, name: '' };
                                setDraft((current) => [...current, entry]);
                            }}
                        >{t`Add`}</Button>
                    </DialogContent>
                    <DialogActions sx={{ flexWrap: 'wrap' }}>
                        <Button disabled={saving || customNames === undefined} onClick={() => void save(undefined)}>
                            {t`Restore source information`}
                        </Button>
                        <Button disabled={saving} onClick={close}>{t`Cancel`}</Button>
                        <Button type="submit" variant="contained" disabled={saving}>{t`Save`}</Button>
                    </DialogActions>
                </form>
            </Dialog>
        </>
    );
};
