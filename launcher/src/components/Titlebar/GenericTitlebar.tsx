/** Windows/Linux custom titlebar: app logo + name, then minimize, maximize, and close. */
import React from 'react';

import Logo from '../../assets/logo.png';
import { LAUNCHER_DISPLAY_NAME } from '../../constants/launcher';

const GenericTitlebar = () => {
  return (
    <div className="titlebar">
      <div className="app-info">
        <div className="logo">
          <img src={Logo} />
        </div>
        <span className="app-name">{LAUNCHER_DISPLAY_NAME}</span>
      </div>
      <div className="generic-controls">
        <div className="button" id="minimize" onClick={() => window.electron.minimize()}>
          <svg
            width={20}
            height={2}
            viewBox="0 0 20 2"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1.83337 1H18.1667"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="button" id="maximize" onClick={() => window.electron.maximize()}>
          <svg
            width={20}
            height={20}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 1H5.8C4.11984 1 3.27976 1 2.63803 1.32698C2.07354 1.6146 1.6146 2.07354 1.32698 2.63803C1 3.27976 1 4.11984 1 5.8V6M6 19H5.8C4.11984 19 3.27976 19 2.63803 18.673C2.07354 18.3854 1.6146 17.9265 1.32698 17.362C1 16.7202 1 15.8802 1 14.2V14M19 6V5.8C19 4.11984 19 3.27976 18.673 2.63803C18.3854 2.07354 17.9265 1.6146 17.362 1.32698C16.7202 1 15.8802 1 14.2 1H14M19 14V14.2C19 15.8802 19 16.7202 18.673 17.362C18.3854 17.9265 17.9265 18.3854 17.362 18.673C16.7202 19 15.8802 19 14.2 19H14"
              stroke="currentColor"
              strokeOpacity="0.9"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="button" id="close" onClick={() => window.electron.close()}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15 1L1 15M1 1L15 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default GenericTitlebar;
