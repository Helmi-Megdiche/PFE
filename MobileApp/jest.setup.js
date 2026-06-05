// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock React Native's Image asset resolution
jest.mock('react-native/Libraries/Image/Image', () => ({
  ...jest.requireActual('react-native/Libraries/Image/Image'),
  resolveAssetSource: jest.fn(() => ({ uri: 'mock://image' })),
}));

// Mock ML Kit text recognition (ESM issue)
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  recognize: jest.fn(() => Promise.resolve({ text: 'mock ocr result' })),
}));

// Mock ML Kit image labeling (if used)
jest.mock('@react-native-ml-kit/image-labeling', () => ({
  labelImage: jest.fn(() => Promise.resolve([])),
}));

// Mock React Navigation dependencies (must expose SafeAreaInsetsContext)
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const SafeAreaInsetsContext = React.createContext(insets);
  return {
    SafeAreaInsetsContext,
    SafeAreaProvider: ({ children }) =>
      React.createElement(SafeAreaInsetsContext.Provider, { value: insets }, children),
    useSafeAreaInsets: () => insets,
  };
});

jest.mock('./src/navigation/AppNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    AppNavigator: () => React.createElement(Text, null, 'SafeGuard'),
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  const NavigationContainer = React.forwardRef(({ children, onReady }, _ref) => {
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return children;
  });
  NavigationContainer.displayName = 'NavigationContainer';
  return {
    NavigationContainer,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useFocusEffect: jest.fn(),
    createNavigationContainerRef: () => ({
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      current: null,
    }),
  };
});

// App bootstrap — avoid native/async work during App.test.tsx
jest.mock('./src/services/imageClassifier', () => ({
  preloadImageClassifier: jest.fn(() => Promise.resolve()),
}));

jest.mock('./src/hooks/useMissionOverlayListener', () => ({
  useMissionOverlayListener: jest.fn(),
}));

jest.mock('./src/auth/useDevChildToken', () => ({
  useDevChildToken: () => ({
    ready: true,
    error: null,
    hasToken: true,
    retry: jest.fn(),
  }),
}));

jest.mock('./src/components/RealUsageTracker', () => ({
  RealUsageTracker: () => null,
}));

jest.mock('./src/navigation/pendingMissionNavigation', () => ({
  attachPendingMissionAppStateListener: jest.fn(),
  queueOrNavigateToMissionScreen: jest.fn(),
  flushPendingMissionNavigation: jest.fn(),
}));

// Silence console.warn from React Navigation during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('React Navigation')) return;
  originalWarn(...args);
};
