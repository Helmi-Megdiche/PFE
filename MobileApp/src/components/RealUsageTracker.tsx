import React from 'react';
import { useRealForegroundTracker } from '../hooks/useRealForegroundTracker';
import { useMonitoringActive } from '../state/monitoringState';

interface RealUsageTrackerProps {
  hasToken: boolean;
}

export function RealUsageTracker({ hasToken }: RealUsageTrackerProps): null {
  const isMonitoring = useMonitoringActive();
  useRealForegroundTracker(isMonitoring && hasToken);
  return null;
}
