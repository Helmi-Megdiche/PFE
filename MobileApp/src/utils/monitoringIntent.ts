import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_INTENT_KEY = '@pfe/monitoring/intent';

/** Persist user intent so monitoring can resume after MediaProjection consent reloads the Activity. */
export async function setMonitoringIntent(wanted: boolean): Promise<void> {
  if (wanted) {
    await AsyncStorage.setItem(MONITORING_INTENT_KEY, '1');
    return;
  }
  await AsyncStorage.removeItem(MONITORING_INTENT_KEY);
}

export async function getMonitoringIntent(): Promise<boolean> {
  return (await AsyncStorage.getItem(MONITORING_INTENT_KEY)) === '1';
}
