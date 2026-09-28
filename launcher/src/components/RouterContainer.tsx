/**
 * App routing and auth gate: redirects unauthenticated users to /login.
 */
import React, { useState, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FadeLoader } from 'react-spinners';

import Login from '../views/Login';
import MainPage from '../views/MainPage';

const RouterContainer = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const account = await window.config.get('auth');
        if (!account) {
          setIsLoggedIn(false);
          return;
        }
        setIsLoggedIn(Boolean(account.username) && Boolean(account.uuid));
      } catch (error) {
        window.electron.log('error', `Failed to get auth config in RouterContainer: ${(error as Error).message}`);
        setIsLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  if (isLoading) {
    return <FadeLoader color="#f5eef6" loading />;
  }

  return (
    <Routes>
      <Route
        path="*"
        element={isLoggedIn ? <Navigate to="/main" /> : <Navigate to="/login" />}
      />
      <Route path="/login" element={isLoggedIn ? <Navigate to="/main" /> : <Login />} />
      <Route path="/main/*" element={isLoggedIn ? <MainPage /> : <Navigate to="/login" />} />
    </Routes>
  );
};

export default RouterContainer;
