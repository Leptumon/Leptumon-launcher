/** Home footer: the news panel (when a feed is configured) and the launch card. Links live in the sidebar. */
import React from 'react';

import LaunchButton from './LaunchButton';
import News from './News';

const Footer = () => {
    return (
        <div className="footer">
            <div className="footer-content">
                <News />
                <LaunchButton />
            </div>
        </div>
    );
}

export default Footer;
