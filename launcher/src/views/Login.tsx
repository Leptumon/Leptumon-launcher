/** Microsoft sign-in screen. Offline login is intentionally not offered. */
import React from 'react';

// Assets
import Background from '../assets/background.png';
import LoginForm from '../components/LoginForm';
import Titlebar from '../components/Titlebar/Titlebar';

const Login = () => {
    return (
        <div className="container">
            <img src={Background} className="background-image" />
            <Titlebar />
            <LoginForm />
        </div>
    );
}

export default Login;
