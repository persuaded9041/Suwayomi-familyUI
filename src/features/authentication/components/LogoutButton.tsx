/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import LogoutIcon from '@mui/icons-material/Logout';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useLingui } from '@lingui/react/macro';
import { AppInitializer } from '@/base/AppInitializer.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { TypographyMaxLines } from '@/base/components/texts/TypographyMaxLines.tsx';
import { AuthManager } from '@/features/authentication/AuthManager.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';

const logout = () => {
    AppInitializer.stop();
    requestManager.reset();
    // Reload to discard all account-specific in-memory state before another login.
    window.location.reload();
};

export const LogoutButton = ({ collapsed = false }: { collapsed?: boolean }) => {
    const { t } = useLingui();
    const { isAuthRequired, accessToken, refreshToken } = AuthManager.useSession();

    if (!isAuthRequired || (!accessToken && !refreshToken)) {
        return null;
    }

    return (
        <CustomTooltip title={t`Log out`} placement="right">
            <ListItemButton
                component="button"
                onClick={logout}
                sx={{
                    width: '100%',
                    ...(collapsed && { p: 0.5, flexDirection: 'column' }),
                }}
            >
                <ListItemIcon sx={collapsed ? { justifyContent: 'center' } : undefined}>
                    <LogoutIcon />
                </ListItemIcon>
                <ListItemText sx={{ m: 0, maxWidth: '100%' }}>
                    <TypographyMaxLines lines={1} variant={collapsed ? 'caption' : undefined}>
                        {t`Log out`}
                    </TypographyMaxLines>
                </ListItemText>
            </ListItemButton>
        </CustomTooltip>
    );
};
