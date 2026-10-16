/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useReducer, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';
import type {
    MangaArtistInfo,
    MangaAuthorInfo,
    MangaIdInfo,
    MangaMetaInfo,
    MangaTitleInfo,
} from '@/features/manga/Manga.types.ts';
import type { AlternativeTitleDraft } from '@/features/customMetadata/AlternativeTitles.tsx';
import { AlternativeTitlesEditor, createAlternativeTitleDrafts } from '@/features/customMetadata/AlternativeTitles.tsx';
import {
    getCustomContributors,
    getAlternativeTitles,
    getDisplayTitle,
    importCatalogMetadata,
} from '@/features/customMetadata/CatalogMetadata.ts';
import type { AniListMedia } from '@/features/customMetadata/anilist/AniListClient.ts';
import { aniListClient, AniListError, getAniListUrl } from '@/features/customMetadata/anilist/AniListClient.ts';
import type {
    ImportContributor,
    ContributorCategory,
    MetadataCatalogue,
} from '@/features/customMetadata/MetadataImportValues.ts';
import { getContributorNames, METADATA_CATALOGUE_NAMES } from '@/features/customMetadata/MetadataImportValues.ts';
import {
    mapAniListContributors,
    mapAniListTitles,
    mergeAniListContributors,
} from '@/features/customMetadata/anilist/AniListMapper.ts';
import { useCatalogSearch } from '@/features/customMetadata/useCatalogSearch.ts';
import { catalogSearchReducer, createCatalogSearchState } from '@/features/customMetadata/CatalogSearchState.ts';
import type { OpenLibraryWork } from '@/features/customMetadata/openLibrary/OpenLibraryClient.ts';
import {
    openLibraryClient,
    OpenLibraryError,
    getOpenLibraryUrl,
} from '@/features/customMetadata/openLibrary/OpenLibraryClient.ts';
import { mapOpenLibraryContributors } from '@/features/customMetadata/openLibrary/OpenLibraryMapper.ts';

export type ImportableWork = MangaIdInfo & MangaMetaInfo & MangaTitleInfo & MangaAuthorInfo & MangaArtistInfo;
type ImportSelection = { title: boolean; alternatives: boolean; authors: boolean; artists: boolean };
const EMPTY_SELECTION: ImportSelection = { title: false, alternatives: false, authors: false, artists: false };
let nextManualContributor = 0;

const RequestError = ({
    error,
    retry,
    catalogue,
}: {
    error: unknown;
    retry: () => void;
    catalogue: MetadataCatalogue;
}) => {
    const { t } = useLingui();
    const service = METADATA_CATALOGUE_NAMES[catalogue];
    const catalogueError = error instanceof AniListError || error instanceof OpenLibraryError ? error : undefined;
    let message = t`${service} returned an error`;
    if (catalogueError?.kind === 'rate-limit') {
        message = t`${service} rate limit reached`;
    } else if (catalogueError instanceof OpenLibraryError && catalogueError.status === 403) {
        message = t`${service} access was refused (HTTP 403).`;
    } else if (catalogueError?.kind === 'network') {
        message = t`Could not contact ${service}. Check your connection and browser access.`;
    }
    return (
        <Alert severity="error" action={<Button color="inherit" onClick={retry}>{t`Retry`}</Button>}>
            {message}
            {catalogueError?.retryAt && (
                <Typography variant="body2">
                    {t`Retry after`}: {new Date(catalogueError.retryAt).toLocaleTimeString()}
                </Typography>
            )}
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {getErrorMessage(error)}
            </Typography>
        </Alert>
    );
};

const CatalogImportPanel = ({
    work,
    onClose,
    catalogue,
    onSavingChange,
}: {
    work: ImportableWork;
    onClose: () => void;
    catalogue: MetadataCatalogue;
    onSavingChange: (saving: boolean) => void;
}) => {
    const { t } = useLingui();
    const service = METADATA_CATALOGUE_NAMES[catalogue];
    const [{ query, page, openLibraryComicsOnly }, dispatchSearch] = useReducer(
        catalogSearchReducer,
        getDisplayTitle(work),
        createCatalogSearchState,
    );
    const [selectedId, setSelectedId] = useState<number>();
    const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
    const [openLibraryWork, setOpenLibraryWork] = useState<OpenLibraryWork>();
    const [media, setMedia] = useState<AniListMedia>();
    const [detailPage, setDetailPage] = useState(1);
    const [detailAttempt, setDetailAttempt] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<unknown>();
    const [title, setTitle] = useState('');
    const [alternatives, setAlternatives] = useState<AlternativeTitleDraft[]>([]);
    const [contributors, setContributors] = useState<ImportContributor[]>([]);
    const removedContributorKeys = useRef(new Set<string>());
    const [selection, setSelection] = useState(EMPTY_SELECTION);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<unknown>();
    const search = useCatalogSearch(catalogue, query, page, selectedId === undefined, openLibraryComicsOnly);

    useEffect(() => {
        if (selectedId === undefined) {
            return undefined;
        }
        const controller = new AbortController();
        setDetailLoading(true);
        setDetailError(undefined);
        const load = async () => {
            if (catalogue === 'openlibrary') {
                const selectedWork = await openLibraryClient.details(selectedId, controller.signal);
                if (controller.signal.aborted) {
                    return;
                }
                setOpenLibraryWork(selectedWork);
                setTitle(selectedWork.title);
                setAlternatives([]);
                setContributors(mapOpenLibraryContributors(selectedAuthors));
                setSelection(EMPTY_SELECTION);
                return;
            }
            const data = await aniListClient.details(selectedId, detailPage, controller.signal);
            if (controller.signal.aborted) {
                return;
            }
            setMedia(data);
            const entries = mapAniListTitles(data);
            const staff = mapAniListContributors(Array.isArray(data.staff?.edges) ? data.staff.edges : []);
            if (detailPage === 1) {
                setTitle(entries[0]?.title ?? '');
                setAlternatives(createAlternativeTitleDrafts(entries));
                setContributors(staff);
                setSelection(EMPTY_SELECTION);
            } else {
                setContributors((current) =>
                    mergeAniListContributors(
                        current,
                        staff.filter((entry) => !removedContributorKeys.current.has(entry.key)),
                    ),
                );
            }
        };
        void load()
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setDetailError(error);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setDetailLoading(false);
                }
            });
        return () => controller.abort();
    }, [catalogue, selectedId, selectedAuthors, detailPage, detailAttempt]);

    const availableTitles = media ? mapAniListTitles(media) : [];
    if (openLibraryWork) {
        availableTitles.push({ title: openLibraryWork.title, source: 'Open Library' });
    }
    const authors = getContributorNames(contributors, 'author');
    const artists = getContributorNames(contributors, 'artist');
    const canSave =
        !!(media || openLibraryWork) &&
        !detailLoading &&
        !detailError &&
        !saving &&
        ((selection.title && !!title.trim()) ||
            (selection.alternatives && alternatives.some((entry) => entry.title.trim())) ||
            (selection.authors && !!authors.length) ||
            (selection.artists && !!artists.length));
    const close = () => {
        if (!saving) {
            onClose();
        }
    };
    const confirm = async () => {
        if (!canSave || (!media && !openLibraryWork)) {
            return;
        }
        setSaving(true);
        onSavingChange(true);
        setSaveError(undefined);
        try {
            await importCatalogMetadata(work, {
                ...(openLibraryWork ? { openLibraryWorkId: `OL${openLibraryWork.id}W` } : { anilistId: media!.id }),
                ...(selection.title ? { displayTitle: title } : {}),
                ...(selection.alternatives ? { alternativeTitles: alternatives } : {}),
                ...(selection.authors ? { authors } : {}),
                ...(selection.artists ? { artists } : {}),
            });
            makeToast(t`Metadata imported`, 'success');
            onClose();
        } catch (error) {
            setSaveError(error);
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };
    const categoryChoice = (key: keyof ImportSelection, label: string, available: boolean) => (
        <FormControlLabel
            label={label}
            control={
                <Checkbox
                    checked={selection[key]}
                    disabled={saving || !available}
                    onChange={(_, checked) => setSelection((current) => ({ ...current, [key]: checked }))}
                />
            }
        />
    );
    const currentAuthors = (getCustomContributors(work, 'authors') ?? Mangas.getAuthors(work) ?? [])
        .map((name) => name.trim())
        .filter(Boolean);
    const currentArtists = (getCustomContributors(work, 'artists') ?? Mangas.getArtists(work) ?? [])
        .map((name) => name.trim())
        .filter(Boolean);
    const originalAlternatives = getAlternativeTitles(work);
    const categories: [ContributorCategory, string][] = [
        ['unassigned', t`Unassigned`],
        ['author', t`Author`],
        ['artist', t`Artist`],
        ['both', t`Story and art`],
    ];
    return (
        <>
            <DialogContent dividers>
                {selectedId === undefined ? (
                    <Stack spacing={2}>
                        <TextField
                            autoFocus
                            label={t`Search`}
                            fullWidth
                            value={query}
                            onChange={(event) => dispatchSearch({ type: 'query', query: event.target.value })}
                        />
                        {catalogue === 'openlibrary' && (
                            <Box>
                                <FormControlLabel
                                    label={t`Comics & Graphic Novels`}
                                    control={
                                        <Checkbox
                                            checked={openLibraryComicsOnly}
                                            onChange={(_, checked) =>
                                                dispatchSearch({ type: 'openLibraryComicsOnly', enabled: checked })
                                            }
                                        />
                                    }
                                />
                                <Typography variant="body2" color="text.secondary">
                                    {t`Disable this filter to find books with missing or incorrect categories.`}
                                </Typography>
                            </Box>
                        )}
                        {search.loading && (
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <CircularProgress size={20} />
                                <Typography role="status">{t`Loading…`}</Typography>
                            </Stack>
                        )}
                        {!!search.error && (
                            <RequestError catalogue={catalogue} error={search.error} retry={search.retry} />
                        )}
                        {search.result && !search.result.items.length && (
                            <Alert severity="info">{t`No results found`}</Alert>
                        )}
                        <List sx={{ p: 0 }}>
                            {search.result?.items.map((result) => (
                                <ListItemButton
                                    key={result.id}
                                    component="button"
                                    sx={{ width: '100%', gap: 2, textAlign: 'start' }}
                                    onClick={() => {
                                        removedContributorKeys.current.clear();
                                        setSelectedId(result.id);
                                        setSelectedAuthors(result.authors ?? []);
                                        setDetailPage(1);
                                        setMedia(undefined);
                                        setOpenLibraryWork(undefined);
                                        setSaveError(undefined);
                                    }}
                                >
                                    {(catalogue === 'anilist' || result.coverUrl) && (
                                        <Avatar
                                            variant="rounded"
                                            src={result.coverUrl}
                                            alt=""
                                            sx={{ width: 48, height: 68 }}
                                        />
                                    )}
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ overflowWrap: 'anywhere' }}>{result.name}</Typography>
                                        {!!result.otherTitles?.length && (
                                            <Typography variant="body2" color="text.secondary">
                                                {result.otherTitles.join(' · ')}
                                            </Typography>
                                        )}
                                        <Typography variant="caption">
                                            {result.yearBegan ?? t`Unknown`}
                                            {catalogue === 'anilist' && ` · ${result.format ?? t`Unknown`}`}
                                        </Typography>
                                    </Box>
                                </ListItemButton>
                            ))}
                        </List>
                        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                            <Button
                                disabled={search.loading || search.result?.previous === undefined}
                                onClick={() => dispatchSearch({ type: 'page', page: search.result?.previous })}
                            >{t`Previous`}</Button>
                            <Button
                                disabled={search.loading || search.result?.next === undefined}
                                onClick={() => dispatchSearch({ type: 'page', page: search.result?.next })}
                            >{t`Next`}</Button>
                        </Stack>
                    </Stack>
                ) : (
                    <Stack spacing={2}>
                        <Button
                            disabled={saving}
                            onClick={() => {
                                setSelectedId(undefined);
                                setMedia(undefined);
                                setOpenLibraryWork(undefined);
                            }}
                        >{t`Search results`}</Button>
                        <Link
                            href={catalogue === 'anilist' ? getAniListUrl(selectedId) : getOpenLibraryUrl(selectedId)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {t`Open catalogue page`} (#{selectedId})
                        </Link>
                        {detailLoading && (
                            <Stack direction="row" spacing={1}>
                                <CircularProgress size={20} />
                                <Typography role="status">{t`Loading…`}</Typography>
                            </Stack>
                        )}
                        {!!detailError && (
                            <RequestError
                                catalogue={catalogue}
                                error={detailError}
                                retry={() => setDetailAttempt((value) => value + 1)}
                            />
                        )}
                        {(media || openLibraryWork) && (
                            <>
                                <Alert severity="info">{t`Select the categories to replace. Existing customizations in selected categories will be replaced.`}</Alert>
                                <Box>
                                    {categoryChoice('title', t`Main title`, !!title.trim())}
                                    <Typography variant="body2" color="text.secondary">
                                        {t`Current:`} {getDisplayTitle(work)}
                                    </Typography>
                                    <Autocomplete
                                        freeSolo
                                        options={availableTitles.map((entry) => entry.title)}
                                        inputValue={title}
                                        disabled={saving}
                                        onInputChange={(_, value) => setTitle(value)}
                                        renderInput={(params) => (
                                            <TextField {...params} label={t`Proposed title`} margin="dense" />
                                        )}
                                    />
                                </Box>
                                <Divider />
                                <Box>
                                    {categoryChoice(
                                        'alternatives',
                                        t`Alternative titles`,
                                        alternatives.some((entry) => !!entry.title.trim()),
                                    )}
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        {t`Current:`}{' '}
                                        {originalAlternatives.map((entry) => entry.title).join(', ') || t`Unknown`}
                                    </Typography>
                                    <AlternativeTitlesEditor
                                        value={alternatives}
                                        onChange={setAlternatives}
                                        disabled={saving}
                                    />
                                </Box>
                                <Divider />
                                <Box>
                                    {categoryChoice('authors', t`Author`, !!authors.length)}
                                    <Typography variant="body2" color="text.secondary">
                                        {t`Current:`} {currentAuthors.join(', ') || t`Unknown`}
                                    </Typography>
                                    <Typography variant="body2">
                                        {t`Proposed:`} {authors.join(', ') || t`Unknown`}
                                    </Typography>
                                    {categoryChoice('artists', t`Artist`, !!artists.length)}
                                    <Typography variant="body2" color="text.secondary">
                                        {t`Current:`} {currentArtists.join(', ') || t`Unknown`}
                                    </Typography>
                                    <Typography variant="body2">
                                        {t`Proposed:`} {artists.join(', ') || t`Unknown`}
                                    </Typography>
                                </Box>
                                <Typography variant="subtitle2">{t`Contributors`}</Typography>
                                <Alert severity="info">{t`Check contributor roles. Unassigned contributors will not be imported.`}</Alert>
                                {contributors.map((entry) => (
                                    <Stack
                                        key={entry.key}
                                        spacing={1}
                                        sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}
                                    >
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                            <TextField
                                                label={t`Name`}
                                                fullWidth
                                                value={entry.name}
                                                disabled={saving}
                                                onChange={(event) =>
                                                    setContributors((current) =>
                                                        current.map((item) =>
                                                            item.key === entry.key
                                                                ? { ...item, name: event.target.value, edited: true }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                            />
                                            <TextField
                                                select
                                                label={t`Category`}
                                                value={entry.category}
                                                disabled={saving}
                                                sx={{ minWidth: 160 }}
                                                onChange={(event) =>
                                                    setContributors((current) =>
                                                        current.map((item) =>
                                                            item.key === entry.key
                                                                ? {
                                                                      ...item,
                                                                      category: event.target
                                                                          .value as ContributorCategory,
                                                                      edited: true,
                                                                  }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                            >
                                                {categories.map(([value, label]) => (
                                                    <MenuItem key={value} value={value}>
                                                        {label}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                            <IconButton
                                                aria-label={t`Remove`}
                                                disabled={saving}
                                                onClick={() => {
                                                    removedContributorKeys.current.add(entry.key);
                                                    setContributors((current) =>
                                                        current.filter((item) => item.key !== entry.key),
                                                    );
                                                }}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary">
                                            {entry.roles.join(', ') || t`Unknown`}
                                        </Typography>
                                    </Stack>
                                ))}
                                <Button
                                    disabled={saving}
                                    onClick={() =>
                                        setContributors((current) => [
                                            ...current,
                                            {
                                                key: `manual-${nextManualContributor++}`,
                                                name: '',
                                                roles: [],
                                                category: 'unassigned',
                                            },
                                        ])
                                    }
                                >{t`Add`}</Button>
                                {media?.staff?.pageInfo?.hasNextPage && (
                                    <Alert
                                        severity="warning"
                                        action={
                                            <Button
                                                disabled={detailLoading || saving}
                                                onClick={() => setDetailPage((value) => value + 1)}
                                            >{t`Load more contributors`}</Button>
                                        }
                                    >
                                        {t`More contributors are available on ${service}. This preview is incomplete.`}
                                    </Alert>
                                )}
                            </>
                        )}
                    </Stack>
                )}
                {!!saveError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t`Could not save changes`}: {getErrorMessage(saveError)}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button disabled={saving} onClick={close}>{t`Cancel`}</Button>
                <Button variant="contained" disabled={!canSave} onClick={() => void confirm()}>
                    {saving ? t`Loading…` : t`Confirm import`}
                </Button>
            </DialogActions>
        </>
    );
};

/** Switching catalogue unmounts its panel: requests are canceled and drafts/selection are reset. */
export const MetadataImportDialog = ({ work, onClose }: { work: ImportableWork; onClose: () => void }) => {
    const { t } = useLingui();
    const [catalogue, setCatalogue] = useState<MetadataCatalogue | ''>('');
    const [saving, setSaving] = useState(false);
    return (
        <Dialog
            open
            onClose={() => {
                if (!saving) {
                    onClose();
                }
            }}
            fullWidth
            maxWidth="md"
            fullScreen={MediaQuery.useIsMobileWidth()}
        >
            <DialogTitle>{t`Import metadata`}</DialogTitle>
            <Box sx={{ px: 3, pt: 1, pb: 2, flexShrink: 0 }}>
                <TextField
                    select
                    fullWidth
                    label={t`Catalogue`}
                    slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                    value={catalogue}
                    disabled={saving}
                    onChange={(event) => setCatalogue(event.target.value as MetadataCatalogue | '')}
                >
                    <MenuItem value="">{t`Select a catalogue`}</MenuItem>
                    <MenuItem value="anilist">{METADATA_CATALOGUE_NAMES.anilist}</MenuItem>
                    <MenuItem value="openlibrary">{METADATA_CATALOGUE_NAMES.openlibrary}</MenuItem>
                </TextField>
            </Box>
            {catalogue ? (
                <CatalogImportPanel
                    key={catalogue}
                    catalogue={catalogue}
                    work={work}
                    onClose={onClose}
                    onSavingChange={setSaving}
                />
            ) : (
                <DialogActions>
                    <Button onClick={onClose}>{t`Cancel`}</Button>
                </DialogActions>
            )}
        </Dialog>
    );
};
