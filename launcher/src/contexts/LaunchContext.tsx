/**
 * Launch and game-running state shared across the home screen UI.
 *
 * Sync strategy:
 *  - Polls get-game-state every second (survives reloads)
 *  - Listens to launch-progress IPC for smooth in-session updates
 */
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type StatusObject = { key: string; params?: Record<string, string> };

interface LaunchState {
  isRunning: boolean;
  isLaunching: boolean;
  progress: number;
  status: string | StatusObject;
}

interface LaunchContextType extends LaunchState {
  /** Message from the most recent failed launch, shown until the next attempt. */
  lastError: string | null;
  clearError: () => void;
  launch: () => Promise<void>;
  abortLaunch: () => void;
  stopGame: () => Promise<void>;
}

const LaunchContext = createContext<LaunchContextType | undefined>(undefined);

export const useLaunch = () => {
  const context = useContext(LaunchContext);
  if (!context) {
    throw new Error('useLaunch must be used within a LaunchProvider');
  }
  return context;
};

interface LaunchProviderProps {
  children: ReactNode;
}

export const LaunchProvider: React.FC<LaunchProviderProps> = ({ children }) => {
  const [state, setState] = useState<LaunchState>({
    isRunning: false,
    isLaunching: false,
    progress: 0,
    status: '',
  });

  // Poll backend so launch state survives renderer reloads.
  useEffect(() => {
    let mounted = true;

    const checkState = async () => {
      try {
        const backendState = await window.electron.getGameState();
        if (!mounted) return;

        setState((prev) => {
          const statusChanged = JSON.stringify(prev.status) !== JSON.stringify(backendState.status ?? '');
          if (
            prev.isRunning === backendState.isRunning &&
            prev.isLaunching === (backendState.isLaunching ?? false) &&
            Math.abs(prev.progress - (backendState.progress ?? 0)) < 0.1 &&
            !statusChanged
          ) {
            return prev;
          }

          return {
            isRunning: backendState.isRunning,
            isLaunching: backendState.isLaunching ?? false,
            progress: backendState.progress ?? 0,
            status: backendState.status ?? '',
          };
        });
      } catch (err) {
        window.electron.log('error', `Failed to poll game state: ${(err as Error).message}`);
      }
    };

    checkState();
    const intervalId = setInterval(checkState, 1000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = () => setLastError(null);

  // Real-time progress while a launch is in flight. isLaunching is owned by the
  // backend poll (and launch/abort/stop). Deriving it from percent here races
  // the poll and makes the button flicker, so only carry progress + status.
  useEffect(() => {
    const unsubscribe = window.electron.onProgress((data) => {
      // The backend resets its status right after a failure, so capture the
      // error here or the player would never see why Play did nothing.
      if (typeof data.status === 'object' && data.status?.key === 'launch.error') {
        setLastError(data.status.params?.message ?? null);
      }
      setState((prev) => ({
        ...prev,
        progress: data.percent,
        status: data.status,
      }));
    });
    return unsubscribe;
  }, []);

  const launch = async () => {
    setLastError(null);
    setState((prev) => ({
      ...prev,
      isLaunching: true,
      progress: 0,
      status: { key: 'launch.initializing' },
    }));
    window.electron.installAndLaunchMC();
  };

  const abortLaunch = () => {
    window.electron.cancelLaunch();
    setState((prev) => ({ ...prev, isLaunching: false, status: { key: 'launch.cancelled' } }));
  };

  const stopGame = async () => {
    await window.electron.stopGame();
    setState((prev) => ({ ...prev, isRunning: false }));
  };

  return (
    <LaunchContext.Provider value={{ ...state, lastError, clearError, launch, abortLaunch, stopGame }}>
      {children}
    </LaunchContext.Provider>
  );
};
