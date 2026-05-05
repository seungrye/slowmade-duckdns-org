import { initializeApp, getApps } from 'firebase/app';
import { Analytics, initializeAnalytics, isSupported } from 'firebase/analytics';
import { FirebasePerformance, getPerformance } from 'firebase/performance';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.appId);

if (!isFirebaseConfigured) {
  console.warn('[Firebase] 환경 변수가 설정되지 않아 Firebase 기능이 비활성화됩니다. (NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID 등 확인)');
}

const app = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

let analyticsPromise: Promise<Analytics | null> | null = null;

let performanceInstance: FirebasePerformance | null = null;

export function getFirebasePerformance(): FirebasePerformance | null {
  if (typeof window === 'undefined' || !app) return null;
  if (!performanceInstance) {
    performanceInstance = getPerformance(app);
  }
  return performanceInstance;
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!app) return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) => {
      if (!supported) return null;
      return initializeAnalytics(app, {
        config: {
          debug_mode: process.env.NODE_ENV !== 'production',
        },
      });
    });
  }
  return analyticsPromise;
}
