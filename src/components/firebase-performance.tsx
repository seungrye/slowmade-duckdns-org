'use client';

import { useEffect } from 'react';
import { getFirebasePerformance } from '@/lib/firebase';

export default function FirebasePerformance() {
  useEffect(() => {
    getFirebasePerformance();
  }, []);

  return null;
}
