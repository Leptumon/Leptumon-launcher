/** Login screen: logo, Microsoft sign-in button, and auth-success redirect. */
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import Logo from '../assets/logo.png';
import { useTranslation } from '../contexts/I18nContext';

import Button from './Button';

const authenticateMicrosoft = () => {
    window.electron.authenticateMS();
}

const LoginForm = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    // This hook sets up the listener for the signal from the backend.
    useEffect(() => {
        // This function will be called when the 'auth-success' signal is received.
        const handleAuthSuccess = () => {
            window.electron.log('info', 'Microsoft authentication successful, reloading application...');
            if (location.pathname == '/login') {
                window.location.reload();
                return;
            }
            navigate('/main');
        };

        // Register the listener using the function we exposed in the preload script.
        return window.electron.onAuthSuccess(handleAuthSuccess);
    }, []); // The empty array [] ensures this effect runs only once when the component mounts.

    return (
        <div className="login-form-container">
            <div className="form">
                <div className="logo">
                    <img src={Logo} draggable="false" />
                </div>
                <Button
                    id="ms-auth-btn"
                    variant="secondary"
                    size="lg"
                    onClick={() => authenticateMicrosoft()}
                    icon={
                        <span className="microsoft-logo">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                                <path fill="#f35325" d="M1 1h10v10H1z" />
                                <path fill="#81bc06" d="M12 1h10v10H12z" />
                                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                                <path fill="#ffba08" d="M12 12h10v10H12z" />
                            </svg>
                        </span>
                    }
                >
                    {t('login_ms')}
                </Button>
            </div>
        </div>
    );
}

export default LoginForm;
