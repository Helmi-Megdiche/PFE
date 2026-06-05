import { useSyncExternalStore } from 'react';

type Listener = () => void;

let monitoringActive = false;
const listeners = new Set<Listener>();

export function getMonitoringActive(): boolean {
  return monitoringActive;
}

export function setMonitoringActive(active: boolean): void {
  if (monitoringActive === active) {
    return;
  }
  monitoringActive = active;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeMonitoring(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMonitoringActive(): boolean {
  return useSyncExternalStore(subscribeMonitoring, getMonitoringActive, getMonitoringActive);
}
