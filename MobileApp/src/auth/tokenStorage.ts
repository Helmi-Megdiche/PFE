import AsyncStorage from '@react-native-async-storage/async-storage';

const JWT_STORAGE_KEY = '@pfe/auth/jwt';

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
    await AsyncStorage.removeItem(JWT_STORAGE_KEY);
  },
};
