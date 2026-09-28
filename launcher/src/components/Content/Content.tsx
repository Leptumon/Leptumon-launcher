/** Home hero: the backdrop with the glowing logo centred on top. */
import React from 'react';

import Logo from '../../assets/logo.png';
import Background from '../../assets/background.png';

const Content = () => {
    return (
        <div className="content">
            <div className="content-image">
                <div className="image-container">
                    <img src={Logo} draggable="false" />
                    <img src={Logo} className="glow" draggable="false" />
                    <img src={Logo} className="logo-blur" draggable="false" />
                </div>
                <img src={Background} className='bg-image' />
            </div>
        </div>
    );
}

export default Content;
