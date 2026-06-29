import { useEffect } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { messaging, db, auth } from "../firebase";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import toast, { Toaster } from "react-hot-toast";

export default function FCMProvider() {
  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const m = await messaging();
          if (m && auth.currentUser) {
            let vapidKey = (import.meta as any).env.VITE_FCM_VAPID_KEY;
            if (!vapidKey || vapidKey.trim().length === 0) {
              console.log("FCM is inactive because VITE_FCM_VAPID_KEY is not defined. Set it in your secrets to enable Push Notifications.");
              return;
            }
            
            // Clean up surrounding quotes or whitespace in VAPID key
            vapidKey = vapidKey.trim().replace(/^['"]|['"]$/g, '');

            try {
              // Register the service worker manually to ensure it is scope-aligned and robust
              let registration;
              if ('serviceWorker' in navigator) {
                registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                console.log("Firebase Messaging Service Worker registered successfully:", registration.scope);
                
                // Ensure service worker is fully ready and active to prevent "no active Service Worker" subscription failure
                await navigator.serviceWorker.ready;
                
                // Additional safeguard: wait a tiny bit if active is still not set
                if (!registration.active) {
                  await new Promise((resolve) => {
                    const worker = registration.installing || registration.waiting;
                    if (worker) {
                      const stateListener = () => {
                        if (worker.state === 'activated') {
                          worker.removeEventListener('statechange', stateListener);
                          resolve(null);
                        }
                      };
                      worker.addEventListener('statechange', stateListener);
                    } else {
                      setTimeout(resolve, 500);
                    }
                  });
                }
              }

              const token = await getToken(m, { 
                vapidKey,
                ...(registration ? { serviceWorkerRegistration: registration } : {})
              });

              if (token) {
                const userRef = doc(db, "users", auth.currentUser.uid);
                try {
                  // Use setDoc with merge to ensure the document is created if it doesn't exist
                  await setDoc(userRef, {
                    fcmTokens: arrayUnion(token),
                  }, { merge: true });
                } catch (e) {
                  console.warn("Error updating FCM token:", e);
                }
              }
            } catch (getTokenError: any) {
              console.warn(
                "Could not get FCM token. Note: VITE_FCM_VAPID_KEY must be a valid, URL-safe base64url encoded VAPID Public Key (from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates).\n" +
                "Error details:", getTokenError.message
              );
            }
          }
        }
      } catch (error) {
        console.warn("Failed to set up FCM:", error);
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        requestNotificationPermission();
      }
    });

    const setupOnMessage = async () => {
      const m = await messaging();
      if (m) {
        onMessage(m, (payload) => {
          toast(
            (t) => (
              <div className="flex flex-col gap-1">
                <span className="font-bold text-sm text-slate-800">
                  {payload.notification?.title || "New Update"}
                </span>
                <span className="text-sm text-slate-600">
                  {payload.notification?.body || ""}
                </span>
              </div>
            ),
            {
              duration: 5000,
              icon: "🔔",
            }
          );
        });
      }
    };

    setupOnMessage();

    return () => {
      unsubscribeAuth();
    };
  }, []);

  return <Toaster position="top-right" />;
}
