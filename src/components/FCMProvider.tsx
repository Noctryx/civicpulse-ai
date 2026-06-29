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
            // VAPID key would ideally be in env vars
            const token = await getToken(m, {
              vapidKey: (import.meta as any).env.VITE_FCM_VAPID_KEY || undefined,
            });
            if (token) {
              const userRef = doc(db, "users", auth.currentUser.uid);
              try {
                // Use setDoc with merge to ensure the document is created if it doesn't exist
                await setDoc(userRef, {
                  fcmTokens: arrayUnion(token),
                }, { merge: true });
              } catch (e) {
                console.log("Error updating FCM token:", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to set up FCM:", error);
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
          console.log("Received foreground message:", payload);
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
