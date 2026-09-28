/** Signed-in shell: backdrop, titlebar, sidebar, and the routed page (home or settings). */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Background from '../assets/background.png';
import MiniProgressPill from '../components/MiniProgressPill';
import Sidebar from '../components/Sidebar';
import Titlebar from '../components/Titlebar/Titlebar';
import UpdatePrompt from '../components/UpdatePrompt';
import { DURATION, PAGE_TRANSITION } from '../constants/motion';

import HomePage from './pages/HomePage';
import Settings from './pages/Settings';

const MainPage = () => {
    const location = useLocation();
    const reduceMotion = useReducedMotion();
    const pageKey = location.pathname.replace(/\/+$/, '');

    return (
        <div className="container">
            <img src={Background} className="background-image" />
            <div className="blur">
                <Titlebar />
                <Sidebar />
                <div className="layout">
                    {/* Short crossfade between pages; the old page leaves a little faster than the new one arrives. */}
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={pageKey}
                            className="page"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: reduceMotion ? { duration: 0 } : PAGE_TRANSITION }}
                            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : DURATION.fast } }}
                        >
                            <Routes location={location}>
                                <Route path="/" element={<HomePage />} />
                                <Route path="settings" element={<Settings />} />
                            </Routes>
                        </motion.div>
                    </AnimatePresence>
                </div>
                <MiniProgressPill />
                <UpdatePrompt />
            </div>
        </div>
    );
};

export default MainPage;
