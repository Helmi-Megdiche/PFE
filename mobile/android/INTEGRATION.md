# Intégration — voir NATIVE_SETUP.md

La configuration complète (permissions, Gradle, MainApplication, MainActivity, tests) est dans :

**[NATIVE_SETUP.md](./NATIVE_SETUP.md)**

## JWT (inchangé)

```tsx
import { AppApiBootstrap } from '../src/auth/AppApiBootstrap';
import { ScreenMonitor } from '../src/components/ScreenMonitor';

<AppApiBootstrap baseUrl="https://api.example.com" getAccessToken={() => tokenStorage.getToken()}>
  <ScreenMonitor consentGranted={userConsented} intervalMs={30000} />
</AppApiBootstrap>
```
