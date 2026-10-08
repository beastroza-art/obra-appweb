import { useEffect, useRef } from "react";

/**
 * Hook to request and maintain Screen Wake Lock while `enabled` is true.
 * Prevents tablet/mobile screens from going to sleep while a user is working on a form.
 */
export function useWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let isSubscribed = true;

    async function requestLock() {
      try {
        if (wakeLockRef.current !== null && !wakeLockRef.current.released) {
          return;
        }
        const lock = await navigator.wakeLock.request("screen");
        if (!isSubscribed) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      } catch (err) {
        // Ignored: Wake Lock may fail on low battery or if permissions are restricted
      }
    }

    requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [enabled]);
}
