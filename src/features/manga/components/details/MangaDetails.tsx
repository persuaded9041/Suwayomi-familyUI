/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { CatalogDetails, MetadataImportButton } from '@/features/customMetadata/CatalogDetails.tsx';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { styled } from '@mui/material/styles';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import ButtonGroup from '@mui/material/ButtonGroup';
import { useLingui } from '@lingui/react/macro';
import { t as translate } from '@lingui/core/macro';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import { FlexWrapButton } from '@/base/components/buttons/FlexWrapButton.tsx';
import { TrackMangaButton } from '@/features/manga/components/TrackMangaButton.tsx';
import { useManageMangaLibraryState } from '@/features/manga/hooks/useManageMangaLibraryState.tsx';
import { Metadata as BaseMetadata } from '@/base/components/texts/Metadata.tsx';
import type { MangaType, SourceType } from '@/lib/graphql/generated/graphql-base.types.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { MANGA_STATUS_TO_TRANSLATION } from '@/features/manga/Manga.constants.ts';
import type {
    MangaArtistInfo,
    MangaAuthorInfo,
    MangaDescriptionInfo,
    MangaGenreInfo,
    MangaIdInfo,
    MangaInLibraryInfo,
    MangaLocationState,
    MangaMetaInfo,
    MangaSourceIdInfo,
    MangaStatusInfo,
    MangaThumbnailInfo,
    MangaTitleInfo,
    MangaTrackRecordInfo,
} from '@/features/manga/Manga.types.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { CustomIconButton } from '@/base/components/buttons/CustomIconButton.tsx';
import { Sources } from '@/features/source/services/Sources.ts';
import { Thumbnail } from '@/features/manga/components/details/Thumbnail.tsx';
import { DescriptionGenre } from '@/features/manga/components/details/DescriptionGenre.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { IconBrowser } from '@/assets/icons/IconBrowser.tsx';
import { IconWebView } from '@/assets/icons/IconWebView.tsx';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';

const DetailsWrapper = styled('div')(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    padding: theme.spacing(1),
    [theme.breakpoints.up('md')]: {
        flexBasis: '40%',
        height: 'calc(100vh - 64px)',
        overflowY: 'auto',
    },
}));

const TopContentWrapper = ({
    url,
    mangaThumbnailBackdrop,
    children,
}: {
    url: string;
    mangaThumbnailBackdrop: boolean;
    children: ReactNode;
}) => (
    <Stack
        sx={{
            position: 'relative',
        }}
    >
        {mangaThumbnailBackdrop && (
            <Stack
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                <SpinnerImage
                    spinnerStyle={{ display: 'none' }}
                    imgStyle={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                    src={url}
                    alt="Manga Thumbnail"
                />
                <Stack
                    sx={{
                        '&::before': (theme) =>
                            applyStyles(mangaThumbnailBackdrop, {
                                position: 'absolute',
                                display: 'inline-block',
                                content: '""',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: `linear-gradient(to top, ${theme.palette.background.default}, transparent 100%, transparent 1px),linear-gradient(to right, ${theme.palette.background.default}, transparent 50%, transparent 1px),linear-gradient(to bottom, ${theme.palette.background.default}, transparent 50%, transparent 1px),linear-gradient(to left, ${theme.palette.background.default}, transparent 50%, transparent 1px)`,
                                backdropFilter: 'blur(4.5px) brightness(0.75)',
                            }),
                    }}
                />
            </Stack>
        )}
        {children}
    </Stack>
);

const ThumbnailMetadataWrapper = styled('div')(({ theme }) => ({
    display: 'flex',
    paddingBottom: theme.spacing(1),
}));

const MetadataContainer = styled('div')(({ theme }) => ({
    zIndex: 1,
    marginLeft: theme.spacing(1),
}));

const Metadata = (props: ComponentProps<typeof BaseMetadata>) => <BaseMetadata {...props} />;

const MangaButtonsContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    gap: theme.spacing(1),
}));

const OpenSourceButton = ({ url }: { url?: string | null }) => {
    const { t } = useLingui();

    return (
        <ButtonGroup>
            <CustomTooltip title={t`Open in browser`} disabled={!url}>
                <CustomIconButton
                    size="medium"
                    disabled={!url}
                    component={Link}
                    href={url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    variant="outlined"
                >
                    <IconBrowser />
                </CustomIconButton>
            </CustomTooltip>
            <CustomTooltip title={t`Open in WebView`} disabled={!url}>
                <CustomIconButton
                    size="medium"
                    disabled={!url}
                    component={Link}
                    href={url ? requestManager.getWebviewUrl(url) : undefined}
                    target="_blank"
                    rel="noreferrer"
                    variant="outlined"
                >
                    <IconWebView />
                </CustomIconButton>
            </CustomTooltip>
        </ButtonGroup>
    );
};

function getSourceName(source?: Pick<SourceType, 'id' | 'displayName'> | null): string {
    if (!source) {
        return translate`Unknown`;
    }

    if (Sources.isLocalSource(source)) {
        return translate`Local source`;
    }

    return source.displayName ?? source.id;
}

export const MangaDetails = ({
    manga,
    mode,
}: {
    manga: Pick<MangaType, 'realUrl'> &
        MangaIdInfo &
        MangaTitleInfo &
        MangaStatusInfo &
        MangaInLibraryInfo &
        MangaAuthorInfo &
        MangaArtistInfo &
        MangaDescriptionInfo &
        MangaGenreInfo &
        MangaThumbnailInfo &
        MangaSourceIdInfo &
        MangaTrackRecordInfo &
        MangaMetaInfo & {
            source?: Pick<SourceType, 'id' | 'displayName'> | null;
        };
    mode: MangaLocationState['mode'];
}) => {
    const { t } = useLingui();

    const {
        settings: { mangaThumbnailBackdrop, mangaDynamicColorSchemes },
    } = useMetadataServerSettings();

    useEffect(() => {
        if (!manga.source) {
            makeToast(t`Could not find source. Check your installed extensions.`, 'error');
        }
    }, [manga.source, t]);

    const { updateLibraryState } = useManageMangaLibraryState(manga);

    return (
        <DetailsWrapper>
            <TopContentWrapper url={Mangas.getThumbnailUrl(manga)} mangaThumbnailBackdrop={mangaThumbnailBackdrop}>
                <ThumbnailMetadataWrapper>
                    <Thumbnail manga={manga} mangaDynamicColorSchemes={mangaDynamicColorSchemes} />
                    <MetadataContainer>
                        <CatalogDetails key={manga.id} work={manga} mode={mode} />
                        <Metadata title={t`Status`} value={t(MANGA_STATUS_TO_TRANSLATION[manga.status])} />
                        <Metadata title={t`Source`} value={getSourceName(manga.source)} />
                        <MetadataImportButton key={manga.id} work={manga} />
                    </MetadataContainer>
                </ThumbnailMetadataWrapper>
                <MangaButtonsContainer>
                    <FlexWrapButton
                        size={MediaQuery.useIsMobileWidth() ? 'small' : 'medium'}
                        onClick={updateLibraryState}
                        variant={manga.inLibrary ? 'contained' : 'outlined'}
                    >
                        {manga.inLibrary ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                        {manga.inLibrary ? t`In Library` : t`Add To Library`}
                    </FlexWrapButton>
                    <TrackMangaButton manga={manga} />
                    <OpenSourceButton url={manga.realUrl} />
                </MangaButtonsContainer>
            </TopContentWrapper>
            <DescriptionGenre manga={manga} mode={mode} />
        </DetailsWrapper>
    );
};
