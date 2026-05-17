import React, { useEffect } from 'react';
import { setupAuthenticatedApi } from './setupApiClient';
import type { GetAccessToken } from '../services/apiClient';

interface AppApiBootstrapProps {
  baseUrl: string;
  /** Plug in your existing JWT provider (e.g. AuthContext.getToken). */
  getAccessToken: GetAccessToken;
  children: React.ReactNode;
}

/**
 * Wrap your app root so all `api.*` calls include `Authorization: Bearer <JWT>`.
 */
export function AppApiBootstrap({ baseUrl, getAccessToken, children }: AppApiBootstrapProps) {
  useEffect(() => {
    setupAuthenticatedApi({ baseUrl, getAccessToken });
  }, [baseUrl, getAccessToken]);

  return <>{children}</>;
}
