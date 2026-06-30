import { useState, useEffect } from "react";
import ReportForm from "./components/ReportForm";
import CommunityFeed from "./components/CommunityFeed";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import AdminPanel from "./components/AdminPanel";
import FCMProvider from "./components/FCMProvider";
import CityAssistant from "./components/CityAssistant";
import LegalPages from "./components/LegalPages";
import {
  Sparkles,
  BarChart3,
  ListCollapse,
  Settings,
  Building2,
  HelpCircle,
  Compass,
  LogIn,
  LogOut,
  Loader2,
  Sun,
  Moon,
  Bell,
  Check,
  Trash,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, deleteDoc } from "firebase/firestore";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  db,
  handleFirestoreError,
  OperationType,
} from "./firebase";

export default function App() {
  const [activeTab, setActiveTab] = useState("report");
  const [legalView, setLegalView] = useState<"none" | "privacy" | "terms">("none");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signInLoading, setSignInLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Citizen Impact and Reputation state
  const [userReportsCount, setUserReportsCount] = useState(0);
  const [userConfirmationsCount, setUserConfirmationsCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUserReportsCount(0);
      setUserConfirmationsCount(0);
      return;
    }
    const q = query(
      collection(db, "reports"),
      where("reporterId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let confCount = 0;
        snapshot.forEach((docSnap) => {
          confCount += docSnap.data().confirmations || 0;
        });
        setUserReportsCount(snapshot.size);
        setUserConfirmationsCount(confCount);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "reports");
      },
    );
    return () => unsubscribe();
  }, [user]);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    // Query notifications collection where userId == user.uid ordered by createdAt desc
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setNotifications(list);
      },
      (error) => {
        console.warn("Could not load notifications from Firestore (may be index building or rule limitation):", error);
        // Fallback to simpler query without order if index is missing
        const qFallback = query(
          collection(db, "notifications"),
          where("userId", "==", user.uid)
        );
        onSnapshot(qFallback, (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          // Sort in memory
          list.sort((a, b) => {
            const timeA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
            const timeB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
            return timeB - timeA;
          });
          setNotifications(list);
        }, (fallbackError) => {
          console.warn("Notifications fallback query also failed:", fallbackError);
        });
      }
    );
    return () => unsubscribe();
  }, [user]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        read: true,
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const promises = notifications
        .filter((n) => !n.read)
        .map((n) => updateDoc(doc(db, "notifications", n.id), { read: true }));
      await Promise.all(promises);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, "notifications", notificationId));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  // Subscribe to Authentication state change on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Synchronize initial tab state with browser URL pathname
  useEffect(() => {
    const handleUrlRouting = () => {
      const path = window.location.pathname;
      if (path === "/privacy") {
        setLegalView("privacy");
      } else if (path === "/terms") {
        setLegalView("terms");
      } else {
        setLegalView("none");
        if (path === "/admin") {
          setActiveTab("admin");
        } else if (path === "/dashboard" || path === "/analytics") {
          setActiveTab("dashboard");
        } else if (path === "/feed" || path === "/community") {
          setActiveTab("feed");
        } else if (path === "/assistant" || path === "/guide") {
          setActiveTab("assistant");
        } else {
          setActiveTab("report");
        }
      }
    };

    handleUrlRouting();

    // Listen for browser back/forward buttons
    window.addEventListener("popstate", handleUrlRouting);
    return () => window.removeEventListener("popstate", handleUrlRouting);
  }, []);

  const handleTabChange = (tab: string) => {
    setLegalView("none");
    setActiveTab(tab);
    let path = "/";
    if (tab === "admin") path = "/admin";
    else if (tab === "dashboard") path = "/dashboard";
    else if (tab === "feed") path = "/feed";
    else if (tab === "assistant") path = "/assistant";

    window.history.pushState({}, "", path);
  };

  const handleLegalChange = (view: "none" | "privacy" | "terms") => {
    setLegalView(view);
    const path = view === "none" ? "/" : `/${view}`;
    window.history.pushState({}, "", path);
  };

  const handleGoogleSignIn = async () => {
    setSignInLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const { GoogleAuthProvider } = await import("firebase/auth");
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        localStorage.setItem("google_access_token", credential.accessToken);
      }
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user") {
        console.warn("Sign-in popup closed by user.");
      } else {
        console.error("Sign-in error: ", err);
        setAuthError(
          err.message || "Failed to complete Google Sign-in. Please try again.",
        );
      }
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error("Sign-out error: ", err);
    }
  };

  // If initial auth is running, render a professional loading state
  if (authLoading) {
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4"
        id="app-auth-loading"
      >
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-xs flex flex-col items-center justify-center gap-3 max-w-sm text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Verifying City Portal Authorization
          </h4>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Please wait while we establish a secure session with Firebase
            Auth...
          </p>
        </div>
      </div>
    );
  }

  // Render public legal documents (Privacy, Terms) without requiring login
  if (legalView !== "none") {
    return (
      <LegalPages
        view={legalView}
        onBack={() => handleLegalChange("none")}
        isDarkMode={isDarkMode}
      />
    );
  }

  // If user is not authenticated, require login
  if (!user) {
    return (
      <div
        className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 transition-colors duration-200"
        id="app-login-screen"
      >
        {/* City Portal Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2.5 rounded-lg text-white font-bold text-lg shadow-sm">
                  CP
                </div>
                <div>
                  <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                    CivicPulse{" "}
                    <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30 uppercase tracking-wider">
                      AI
                    </span>
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest hidden sm:block">
                    Intelligent Urban Governance
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsDarkMode((prev) => !prev)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                  title="Toggle Theme"
                >
                  {isDarkMode ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Authorization Required
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Login Main Container */}
        <main className="max-w-md mx-auto px-4 py-16 flex-1 flex flex-col justify-center w-full">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-md space-y-6 text-center relative"
          >
            <div className="mx-auto w-16 h-16 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-900/30 shadow-3xs">
              <Building2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Secure Municipal Portal
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                CivicPulse uses secure Google Identity verification. Sign in to
                submit geolocated reports, explore real-time analytics, and
                access live Maps-grounded services.
              </p>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
              <button
                onClick={handleGoogleSignIn}
                disabled={signInLoading}
                className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                id="google-signin-btn"
              >
                {signInLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1c-6.207 0-11.24 5.033-11.24 11.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.74-.08-1.303-.178-1.859H12.24z" />
                  </svg>
                )}
                {signInLoading
                  ? "Connecting Secure Server..."
                  : "Sign in with Google"}
              </button>
            </div>

            {authError && (
              <div className="text-[10px] text-red-600 font-bold bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-2.5">
                ✕ {authError}
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 text-left space-y-2">
              <h3 className="text-[10px] font-bold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Application Purpose
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                <strong>CivicPulse AI</strong> is a community-driven smart city infrastructure reporting platform that connects local citizens with municipal utility and maintenance teams. Citizens use the application to log real-time visual reports of potholes, public lighting failures, and pipeline leaks. Our built-in artificial intelligence models (powered by Google Gemini) automatically categorize, evaluate gravity, and draft action plans to accelerate repair workflows.
              </p>
            </div>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-800 py-6">
          <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-2 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              &copy; 2026 CivicPulse AI • Empowering Communities securely
            </p>
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <button
                onClick={() => handleLegalChange("privacy")}
                className="hover:text-indigo-400 transition cursor-pointer"
              >
                Privacy Policy
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={() => handleLegalChange("terms")}
                className="hover:text-indigo-400 transition cursor-pointer"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 transition-colors duration-200"
      id="app-authorized-screen"
    >
      <FCMProvider />
      {/* City Portal Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo Group */}
            <div
              className="flex items-center gap-2 md:gap-3 cursor-pointer shrink-0"
              onClick={() => handleTabChange("report")}
            >
              <div className="bg-indigo-600 p-2 md:p-2.5 rounded-lg text-white font-bold text-base md:text-lg shadow-sm">
                CP
              </div>
              <div>
                <span className="font-extrabold text-base md:text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                  CivicPulse{" "}
                  <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30 uppercase tracking-wider">
                    AI
                  </span>
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest hidden md:block">
                  Intelligent Urban Governance
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex space-x-1 sm:space-x-1.5 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-100 dark:border-slate-800 overflow-x-auto max-w-[50%] sm:max-w-none">
              <button
                onClick={() => handleTabChange("report")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === "report"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Report Issue</span>
              </button>

              <button
                onClick={() => handleTabChange("feed")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === "feed"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <ListCollapse className="w-3.5 h-3.5" />
                <span>Feed</span>
              </button>

              <button
                onClick={() => handleTabChange("dashboard")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === "dashboard"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Analytics</span>
              </button>

              <button
                onClick={() => handleTabChange("assistant")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === "assistant"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>City Guide</span>
              </button>

              <button
                onClick={() => handleTabChange("admin")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === "admin"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/50 dark:border-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </nav>

            {/* User Profile / Auth Action */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div className="flex items-center gap-1.5 md:gap-2 border-r border-slate-200 dark:border-slate-800 pr-2 md:pr-3">
                <div className="relative shrink-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-indigo-200 dark:border-indigo-900"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center text-xs border border-indigo-200 dark:border-indigo-900">
                      {user.displayName
                        ? user.displayName[0].toUpperCase()
                        : "U"}
                    </div>
                  )}
                  {userReportsCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-500 text-white font-extrabold text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-2xs">
                      {userReportsCount}
                    </span>
                  )}
                </div>
                <div className="hidden sm:block text-left">
                  {(() => {
                    const score =
                      userReportsCount * 10 + userConfirmationsCount;
                    let levelName = "Civic Observer";
                    let minScore = 0;
                    let maxScore = 50;

                    if (score >= 301) {
                      levelName = "City Champion";
                      minScore = 301;
                      maxScore = 1000;
                    } else if (score >= 151) {
                      levelName = "Community Guardian";
                      minScore = 151;
                      maxScore = 300;
                    } else if (score >= 51) {
                      levelName = "Active Citizen";
                      minScore = 51;
                      maxScore = 150;
                    } else {
                      levelName = "Civic Observer";
                      minScore = 0;
                      maxScore = 50;
                    }

                    const progressPercent = Math.min(
                      100,
                      Math.max(
                        0,
                        ((score - minScore) / (maxScore - minScore)) * 100,
                      ),
                    );

                    return (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="block text-xs font-bold text-slate-900 dark:text-white leading-none truncate max-w-[80px] md:max-w-[100px]">
                            {user.displayName || "Civic User"}
                          </span>
                          <span
                            className="text-[8px] md:text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30 px-1.5 py-0.5 rounded-md leading-none flex items-center gap-0.5"
                            title={`Citizen Contribution Score: ${score} points`}
                          >
                            ★ {score}
                          </span>
                          <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 px-1 py-0.5 rounded-md leading-none uppercase tracking-wide">
                            {levelName}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-semibold whitespace-nowrap leading-none">
                            {userReportsCount} reports ·{" "}
                            {userConfirmationsCount} upvotes
                          </span>
                          {levelName !== "City Champion" && (
                            <div
                              className="w-12 h-1 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden shrink-0"
                              title={`Progress to next level: ${Math.round(progressPercent)}%`}
                            >
                              <div
                                className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              {/* Durable Notification Center Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowNotificationsDropdown((prev) => !prev)}
                  className="p-1.5 md:p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer relative"
                  title="In-App Notification Center"
                >
                  <Bell className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  {notifications.filter((n) => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-800 shadow-2xs animate-pulse">
                      {notifications.filter((n) => !n.read).length}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotificationsDropdown && (
                    <>
                      {/* Click overlay to close */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowNotificationsDropdown(false)}
                      />
                      
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden"
                      >
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Citizen Updates</h3>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Durable notification sync center</p>
                          </div>
                          {notifications.filter((n) => !n.read).length > 0 && (
                            <button
                              onClick={() => {
                                handleMarkAllAsRead();
                                setShowNotificationsDropdown(false);
                              }}
                              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              Mark all as read
                            </button>
                          )}
                        </div>

                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                          {notifications.length === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
                              <div className="p-2 bg-indigo-50 dark:bg-slate-800 rounded-full text-indigo-600 dark:text-indigo-400">
                                <Bell className="w-5 h-5 text-indigo-400" />
                              </div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">All caught up!</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">No new alerts or status updates currently logged.</p>
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                className={`p-4 transition-all flex gap-3 items-start relative ${
                                  !n.read
                                    ? "bg-indigo-50/40 dark:bg-indigo-950/25"
                                    : "hover:bg-slate-50/80 dark:hover:bg-slate-850/20"
                                }`}
                              >
                                {!n.read && (
                                  <div className="absolute top-4 left-2 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                                )}
                                <div className="flex-1 space-y-1 pl-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className={`text-xs font-bold text-slate-900 dark:text-white ${!n.read ? "text-indigo-900 dark:text-indigo-300" : ""}`}>
                                      {n.title}
                                    </h4>
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 font-mono">
                                      {n.createdAt ? new Date(n.createdAt.seconds ? n.createdAt.seconds * 1000 : n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                                    {n.body}
                                  </p>
                                  <div className="flex items-center gap-3 pt-1">
                                    {!n.read && (
                                      <button
                                        onClick={() => handleMarkAsRead(n.id)}
                                        className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <Check className="w-2.5 h-2.5" /> Mark read
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteNotification(n.id)}
                                      className="text-[9px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-0.5 cursor-pointer"
                                    >
                                      <Trash className="w-2.5 h-2.5" /> Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="p-1.5 md:p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                title="Toggle Theme"
              >
                {isDarkMode ? (
                  <Sun className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                ) : (
                  <Moon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                )}
              </button>
              <button
                onClick={handleSignOut}
                className="p-1.5 md:p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-red-100 dark:hover:border-red-900 transition cursor-pointer"
                title="Sign Out"
                id="signout-btn"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 flex-1 w-full pb-24 md:pb-12 min-h-[calc(100vh-14rem)] flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="w-full flex-1"
          >
            {activeTab === "report" && (
              <ReportForm
                onSuccess={() => handleTabChange("feed")}
                user={user}
              />
            )}
            {activeTab === "feed" && <CommunityFeed />}
            {activeTab === "dashboard" && <AnalyticsDashboard />}
            {activeTab === "assistant" && <CityAssistant />}
            {activeTab === "admin" && <AdminPanel />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 pb-24 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 md:gap-6 justify-center md:justify-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Engine:{" "}
              <span className="text-slate-300 italic">
                Gemini 3.5 Flash &amp; Maps
              </span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Storage:{" "}
              <span className="text-slate-300 italic">
                Firebase Firestore &amp; Auth
              </span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
              Status: <span className="text-emerald-400">● Live Streaming</span>
            </span>
          </div>
          <div className="flex flex-col md:flex-row items-center md:items-end gap-2 text-right">
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 justify-center md:justify-end">
              <button
                onClick={() => handleLegalChange("privacy")}
                className="hover:text-indigo-400 transition cursor-pointer text-[9px]"
              >
                Privacy Policy
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={() => handleLegalChange("terms")}
                className="hover:text-indigo-400 transition cursor-pointer text-[9px]"
              >
                Terms of Service
              </button>
            </div>
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
              &copy; 2026 CivicPulse AI • Empowering Communities • {user?.email}
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-2 flex justify-around items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
        <button
          onClick={() => handleTabChange("report")}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-extrabold transition cursor-pointer rounded-lg ${
            activeTab === "report"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Sparkles className="w-4.5 h-4.5" />
          <span>Report</span>
        </button>
        <button
          onClick={() => handleTabChange("feed")}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-extrabold transition cursor-pointer rounded-lg ${
            activeTab === "feed"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <ListCollapse className="w-4.5 h-4.5" />
          <span>Feed</span>
        </button>
        <button
          onClick={() => handleTabChange("dashboard")}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-extrabold transition cursor-pointer rounded-lg ${
            activeTab === "dashboard"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <BarChart3 className="w-4.5 h-4.5" />
          <span>Analytics</span>
        </button>
        <button
          onClick={() => handleTabChange("assistant")}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-extrabold transition cursor-pointer rounded-lg ${
            activeTab === "assistant"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Compass className="w-4.5 h-4.5" />
          <span>Guide</span>
        </button>
        <button
          onClick={() => handleTabChange("admin")}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-extrabold transition cursor-pointer rounded-lg ${
            activeTab === "admin"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
          <span>Admin</span>
        </button>
      </nav>
    </div>
  );
}
