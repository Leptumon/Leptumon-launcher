/**
 * React UI entry. Routes: /login, /main (home), /main/settings.
 * All privileged work goes through window.electron / window.config (preload.ts).
 */
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

// Styles
import './styles/main.scss';

// Components
import RouterContainer from './components/RouterContainer';
import { I18nProvider } from './contexts/I18nContext';
import { LaunchProvider } from './contexts/LaunchContext';
import { trackWindowFrame } from './utils/windowFrame';

// Before the first render, so the window never paints with the wrong corners.
trackWindowFrame();

const App = () => {
  return (
    <I18nProvider>
      <LaunchProvider>
        <HashRouter>
          <RouterContainer />
        </HashRouter>
      </LaunchProvider>
    </I18nProvider>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
