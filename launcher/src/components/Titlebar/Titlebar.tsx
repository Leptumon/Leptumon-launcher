/**
 * Window titlebar. On macOS it is an empty drag region under the native traffic
 * lights (see main/window.ts); elsewhere it shows the app name and custom controls.
 */
import React from 'react';

import GenericTitlebar from './GenericTitlebar';

const Titlebar = () => {
    if (window.electron.platform === 'darwin') {
        return <div className="titlebar" />;
    }
    return <GenericTitlebar />;
};

export default Titlebar;
