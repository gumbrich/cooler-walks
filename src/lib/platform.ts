import { Capacitor } from '@capacitor/core';
import type { Point } from './types';

export const isNativeApp = Capacitor.isNativePlatform();

/** Called only by the explicit location button. No background location tracking. */
export async function currentLocation(): Promise<Point> {
  if (isNativeApp) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted')
      throw new Error('Location permission was not granted');
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
    return [position.coords.longitude, position.coords.latitude];
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}
