import React from 'react';
import {useForegroundTracker} from '../hooks/useForegroundTracker';

interface UsageTrackerProps {
  enabled: boolean;
}

/** Invisible wrapper so usage tracking hooks run inside AppApiBootstrap. */
export function UsageTracker({enabled}: UsageTrackerProps): null {
  useForegroundTracker(enabled);
  return null;
}
