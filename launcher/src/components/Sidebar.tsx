/**
 * Left navigation: Home, the Discord/Store links, Settings, and the player's head.
 * The active page is marked by a pill that slides between items (shared layoutId).
 */
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { SPRING_SNAPPY } from '../constants/motion';
import { useTranslation } from '../contexts/I18nContext';
import { useAvatar } from '../utils/useAvatar';

import { HomeIcon, SettingsIcon } from './SidebarIcons';
import SocialMediaLinks from './SocialMediaLinks';

type NavItemProps = {
    to: string;
    label: string;
    active: boolean;
    children: React.ReactNode;
};

const NavItem = ({ to, label, active, children }: NavItemProps) => {
    const reduceMotion = useReducedMotion();

    return (
        <NavLink
            to={to}
            end
            draggable="false"
            className={`sidebar-item${active ? ' is-active' : ''}`}
            aria-label={label}
            title={label}
        >
            {active && (
                <motion.span
                    layoutId="sidebar-active"
                    className="sidebar-item__marker"
                    transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY}
                />
            )}
            <span className="sidebar-item__icon">{children}</span>
        </NavLink>
    );
};

const Sidebar = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const avatarUrl = useAvatar();
    const path = pathname.replace(/\/+$/, '');

    return (
        <nav className="sidebar">
            <LayoutGroup>
                <div className="sidebar__group">
                    <NavItem to="/main" label={t('home')} active={path === '/main'}>
                        <HomeIcon />
                    </NavItem>
                    <SocialMediaLinks />
                </div>
                <div className="sidebar__group sidebar__group--bottom">
                    <NavItem to="/main/settings" label={t('settings')} active={path === '/main/settings'}>
                        <SettingsIcon />
                    </NavItem>
                    <img className="sidebar__avatar" src={avatarUrl} alt="" draggable="false" />
                </div>
            </LayoutGroup>
        </nav>
    );
};

export default Sidebar;
