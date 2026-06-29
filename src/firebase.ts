import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with Database ID from the config
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Initialize Messaging
export const messaging = async () => {
  if (await isSupported()) {
    return getMessaging(app);
  }
  return null;
};

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
googleProvider.addScope(
  "https://www.googleapis.com/auth/drive.metadata.readonly",
);

export type { User };
export { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider };

// Operation types as required by the Firebase Integration skill guidelines
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

/**
 * Handles Firestore exceptions and throws a standardized JSON error string
 * as required by the Firebase Integration skill guidelines.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };

  if (
    errorMessage.toLowerCase().includes("permission") ||
    errorMessage.toLowerCase().includes("missing or insufficient permissions")
  ) {
    console.error("Firestore Security Error: ", JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  } else {
    console.error("Firestore Error: ", errorMessage);
    // Do not throw for non-security errors like quota limits to prevent app crashes
  }
}

/**
 * Validates the Firestore connection on startup.
 */
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("✅ Firestore connection validated successfully.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error(
        "❌ Please check your Firebase configuration or network status.",
      );
    }
  }
}

testConnection();
