import AsyncStorage from '@react-native-async-storage/async-storage';

const JWT_STORAGE_KEY = '@pfe/auth/jwt';
const CHILD_ID_STORAGE_KEY = '@pfe/auth/childId';

/**
 * Adapter for your existing JWT auth — replace keys if your app uses different names.
 */
export const tokenStorage = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(JWT_STORAGE_KEY);
  },

  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(JWT_STORAGE_KEY, token);
  },

  async clearToken(): Promise<void> {
    await AsyncStorage.multiRemove([JWT_STORAGE_KEY, CHILD_ID_STORAGE_KEY]);
  },

  async getChildId(): Promise<string | null> {
    return AsyncStorage.getItem(CHILD_ID_STORAGE_KEY);
  },

  async setChildId(childId: string): Promise<void> {
    await AsyncStorage.setItem(CHILD_ID_STORAGE_KEY, childId);
  },
};
