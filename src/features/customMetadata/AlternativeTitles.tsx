/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AdminOnly } from '@/features/authentication/components/AdminOnly.tsx';
import { Fragment, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { Metadata } from '@/base/components/texts/Metadata.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import type { MangaIdInfo, MangaMetaInfo } from '@/features/manga/Manga.types.ts';
import type { AlternativeTitle } from '@/features/customMetadata/CatalogMetadataValues.ts';
import { getAlternativeTitles, updateAlternativeTitles } from '@/features/customMetadata/CatalogMetadata.ts';

export type AlternativeTitleDraft = AlternativeTitle & { key: number };
let nextKey = 0;
export const createAlternativeTitleDrafts = (titles: readonly AlternativeTitle[]): AlternativeTitleDraft[] =>
    titles.map((title) => ({ ...title, key: nextKey++ }));

const useTitleTypeLabels = (): Record<string, string> => {
    const { t } = useLingui();
    return { romaji: t`Romaji`, english: t`English`, native: t`Original/native`, synonym: t`Synonym` };
};

/** Shared by manual editing and import preview. Type/origin stay editable and optional. */
export const AlternativeTitlesEditor = ({
    value,
    onChange,
    disabled = false,
}: {
    value: AlternativeTitleDraft[];
    onChange: (value: AlternativeTitleDraft[]) => void;
    disabled?: boolean;
}) => {
    const { t } = useLingui();
    const typeLabels = useTitleTypeLabels();
    return (
        <Stack spacing={1}>
            {value.map((entry) => (
                <Stack key={entry.key} spacing={1} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                            label={t`Alternative title`}
                            value={entry.title}
                            fullWidth
                            disabled={disabled}
                            onChange={(event) =>
                                onChange(
                                    value.map((item) =>
                                        item.key === entry.key ? { ...item, title: event.target.value } : item,
                                    ),
                                )
                            }
                        />
                        <IconButton
                            aria-label={t`Remove`}
                            disabled={disabled}
                            onClick={() => onChange(value.filter((item) => item.key !== entry.key))}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Autocomplete
                            freeSolo
                            fullWidth
                            options={Object.keys(typeLabels)}
                            getOptionLabel={(option) => typeLabels[option] ?? option}
                            value={entry.type ?? ''}
                            disabled={disabled}
                            onChange={(_, type) =>
                                onChange(
                                    value.map((item) =>
                                        item.key === entry.key ? { ...item, type: type ?? '' } : item,
                                    ),
                                )
                            }
                            onInputChange={(_, type, reason) => {
                                if (reason === 'input') {
                                    onChange(value.map((item) => (item.key === entry.key ? { ...item, type } : item)));
                                }
                            }}
                            renderInput={(params) => <TextField {...params} label={t`Title type`} />}
                        />
                        <TextField
                            label={t`Source`}
                            value={entry.source ?? ''}
                            fullWidth
                            disabled={disabled}
                            onChange={(event) =>
                                onChange(
                                    value.map((item) =>
                                        item.key === entry.key ? { ...item, source: event.target.value } : item,
                                    ),
                                )
                            }
                        />
                    </Stack>
                </Stack>
            ))}
            <Button
                disabled={disabled}
                onClick={() => onChange([...value, ...createAlternativeTitleDrafts([{ title: '' }])])}
            >{t`Add`}</Button>
        </Stack>
    );
};

export const AlternativeTitles = ({ work }: { work: MangaIdInfo & MangaMetaInfo }) => {
    const { t } = useLingui();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<AlternativeTitleDraft[]>([]);
    const [saving, setSaving] = useState(false);
    const titles = getAlternativeTitles(work);
    const close = () => {
        if (!saving) {
            setOpen(false);
        }
    };
    const save = async (values: AlternativeTitle[] | undefined) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await updateAlternativeTitles(work, values);
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
                title={t`Alternative titles`}
                value={
                    <>
                        {titles.length
                            ? titles.map((entry, index) => (
                                  <Fragment key={entry.title}>
                                      {index > 0 && ', '}
                                      {entry.title}
                                  </Fragment>
                              ))
                            : t`Unknown`}
                        <AdminOnly>
                            <CustomTooltip title={t`Edit alternative titles`}>
                                <IconButton
                                    size="small"
                                    aria-label={t`Edit alternative titles`}
                                    onClick={() => {
                                        setDraft(createAlternativeTitleDrafts(titles));
                                        setOpen(true);
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </CustomTooltip>
                        </AdminOnly>
                    </>
                }
            />
            <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save(draft);
                    }}
                >
                    <DialogTitle>{t`Edit alternative titles`}</DialogTitle>
                    <DialogContent sx={{ pt: 1 }}>
                        <AlternativeTitlesEditor value={draft} onChange={setDraft} disabled={saving} />
                    </DialogContent>
                    <DialogActions>
                        <Button
                            disabled={saving || !titles.length}
                            onClick={() => void save(undefined)}
                        >{t`Restore`}</Button>
                        <Button disabled={saving} onClick={close}>{t`Cancel`}</Button>
                        <Button type="submit" variant="contained" disabled={saving}>{t`Save`}</Button>
                    </DialogActions>
                </form>
            </Dialog>
        </>
    );
};
