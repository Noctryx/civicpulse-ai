import { useState, useEffect, MouseEvent } from "react";
import { collection, doc, updateDoc, increment, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, auth, onAuthStateChanged } from "../firebase";
import { MapPin, ThumbsUp, Calendar, CheckCircle, Clock, AlertTriangle, Eye, ArrowUpDown, Tag, Loader2, Trophy, Medal, Crown, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Report, SeverityType } from "../types";
import ReportDetailModal from "./ReportDetailModal";

import { Skeleton } from "./Skeleton";

const FeedCardSkeleton = () => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 md:p-6 space-y-4">
    <Skeleton className="w-full h-40 rounded-xl" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
    <div className="flex justify-between items-center pt-2">
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-14 rounded-full" />
    </div>
  </div>
);

const LeaderboardSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-850/20">
        <div className="flex items-center gap-3 w-2/3">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-7 h-7 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
        <Skeleton className="w-8 h-4 rounded" />
      </div>
    ))}
  </div>
);

export default function CommunityFeed() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Sorting state
  const [sortBy, setSortBy] = useState<"recent" | "priority">("recent");
  
  // Track reports confirmed in the current browser session
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);

  // Track the logged-in citizen reactively
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  // Selected report ID for detailed modal view
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  
  // Reactively lookup active report from real-time snapshot reports array
  const selectedReport = reports.find((r) => r.id === selectedReportId) || null;

  // Load session confirmations on mount
  useEffect(() => {
    const saved = localStorage.getItem("civicpulse_confirmed_reports");
    if (saved) {
      try {
        setConfirmedIds(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse local storage confirmations", e);
      }
    }
  }, []);

  // Real-time listener for Firestore collection
  useEffect(() => {
    const path = "reports";
    setLoading(true);
    
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedReports: Report[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          
          // Calculate Priority Score
          // High = 50, Moderate = 30, Low = 10
          // confirmations = count * 5
          let severityWeight = 10;
          if (data.severity === "High") severityWeight = 50;
          else if (data.severity === "Moderate") severityWeight = 30;

          const confirmationCount = data.confirmations || 0;
          const priorityScore = severityWeight + (confirmationCount * 5);

          loadedReports.push({
            ...data,
            id: docSnap.id,
            category: data.category || "General",
            severity: data.severity || "Low",
            summary: data.summary || "No summary provided",
            description: data.description || "No description provided",
            imageUrl: data.imageUrl || null,
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            status: data.status || "Pending",
            confirmations: confirmationCount,
            createdAt: data.createdAt,
            suggestedAction: data.suggestedAction || "",
            priorityScore,
            reporterId: data.reporterId || "",
            reporterName: data.reporterName || "",
            reporterEmail: data.reporterEmail || "",
            reporterPhoto: data.reporterPhoto || "",
          } as Report);
        });

        setReports(loadedReports);
        setLoading(false);
      },
      (err) => {
        setError("Unable to stream civic reports. Checking Firebase credentials.");
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleConfirm = async (reportId: string, event: MouseEvent) => {
    event.preventDefault();
    if (confirmedIds.includes(reportId)) return; // Already confirmed

    const collectionPath = `reports`;
    try {
      const docRef = doc(db, collectionPath, reportId);
      
      // Atomic increment confirmations by 1
      await updateDoc(docRef, {
        confirmations: increment(1),
      });

      // Update local tracking
      const newConfirmed = [...confirmedIds, reportId];
      setConfirmedIds(newConfirmed);
      localStorage.setItem("civicpulse_confirmed_reports", JSON.stringify(newConfirmed));

      // Notify the original reporter via FCM
      const targetReport = reports.find(r => r.id === reportId);
      if (targetReport && targetReport.reporterId && auth.currentUser && targetReport.reporterId !== auth.currentUser.uid) {
        fetch("/api/fcm/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: targetReport.reporterId,
            title: "Community Confirmation",
            body: `Your report for "${targetReport.category}" just received a community confirmation.`
          })
        }).catch(err => console.warn("FCM trigger failed:", err));
      }
    } catch (err: unknown) {
      alert("Failed to confirm report. Check connection or quota limit.");
      handleFirestoreError(err, OperationType.UPDATE, `${collectionPath}/${reportId}`);
    }
  };

  // Sort reports depending on selected criterion
  const sortedReports = [...reports].sort((a, b) => {
    if (sortBy === "priority") {
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    }
    // Default: Sort by createdAt descending (newest first)
    const timeA = a.createdAt ? (typeof a.createdAt.toDate === "function" ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
    const timeB = b.createdAt ? (typeof b.createdAt.toDate === "function" ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
    return timeB - timeA;
  });

  const getSeverityBadge = (severity: SeverityType) => {
    switch (severity) {
      case "High":
        return "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30";
      case "Moderate":
        return "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30";
      case "Low":
        return "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30";
      default:
        return "bg-gray-50 dark:bg-gray-850 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800";
    }
  };

  const getStatusBadge = (status: "Pending" | "Resolved") => {
    if (status === "Resolved") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/40 shadow-3xs">
          <CheckCircle className="w-3.5 h-3.5" /> Resolved
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-900/40 shadow-3xs">
        <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending Review
      </span>
    );
  };

  // Calculate City Heroes Leaderboard dynamically from the real-time reports stream
  const leaderboard = (() => {
    const userMap: { [key: string]: { id: string; name: string; photo: string; email: string; count: number; confirmations: number } } = {};
    
    reports.forEach((r) => {
      if (!r.reporterId) return;
      if (!userMap[r.reporterId]) {
        userMap[r.reporterId] = {
          id: r.reporterId,
          name: r.reporterName || "Civic Citizen",
          photo: r.reporterPhoto || "",
          email: r.reporterEmail || "",
          count: 0,
          confirmations: 0,
        };
      }
      userMap[r.reporterId].count += 1;
      userMap[r.reporterId].confirmations += (r.confirmations || 0);
    });
    
    return Object.values(userMap)
      .map((u) => {
        const score = u.count * 10 + u.confirmations;
        let levelName = "Civic Observer";
        if (score >= 301) levelName = "City Champion";
        else if (score >= 151) levelName = "Community Guardian";
        else if (score >= 51) levelName = "Active Citizen";
        
        return { ...u, score, levelName };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5
  })();

  return (
    <div className="space-y-6" id="community-feed-container">
      {/* Header Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-950 dark:text-white">Community Issues Registry</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Real-time public registry of logged civic concerns.</p>
        </div>
        
        {/* Toggle Sorting */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort By:
          </span>
          <div className="inline-flex bg-gray-50 dark:bg-slate-800/60 p-1 rounded-xl border border-gray-100 dark:border-slate-800">
            <button
              onClick={() => setSortBy("recent")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                sortBy === "recent"
                  ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
              }`}
            >
              Recent Reports
            </button>
            <button
              onClick={() => setSortBy("priority")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                sortBy === "priority"
                  ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
              }`}
            >
              Priority Score
            </button>
          </div>
        </div>
      </div>

      {/* Loading & Empty states */}
      {error ? (
        <div className="bg-red-50 dark:bg-red-950/20 p-6 rounded-2xl border border-red-100 dark:border-red-900/30 text-center text-red-600 max-w-md mx-auto flex flex-col items-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mb-2" />
          <p className="font-bold">Stream Failed</p>
          <p className="text-xs text-red-400 mt-1">{error}</p>
        </div>
      ) : !loading && sortedReports.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-12 text-center text-gray-500 flex flex-col items-center justify-center min-h-[300px]">
          <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-full text-gray-400 dark:text-slate-500 mb-4">
            <CheckCircle className="w-10 h-10 text-gray-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No Active Reports</h3>
          <p className="text-sm text-gray-400 dark:text-slate-400 max-w-sm">
            All quiet in your neighborhood. There are currently no public hazard reports filed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Report Cards (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {loading ? (
                <>
                  <FeedCardSkeleton />
                  <FeedCardSkeleton />
                  <FeedCardSkeleton />
                  <FeedCardSkeleton />
                </>
              ) : (
                <AnimatePresence mode="popLayout">
                {sortedReports.map((report) => (
                  <motion.div
                    key={report.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ type: "spring", damping: 20, stiffness: 120 }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100/90 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between hover:-translate-y-[2px] hover:shadow-lg transition-all relative animate-fade-in"
                  >
                    {/* Citizen Closure Loop - Green Resolution Banner */}
                    {currentUser && report.reporterId === currentUser.uid && report.status === "Resolved" && (
                      <div className="bg-emerald-500/10 dark:bg-emerald-950/20 border-b border-emerald-100/40 dark:border-emerald-900/30 px-5 py-3 flex items-center gap-2 text-emerald-850 dark:text-emerald-400 font-bold text-xs">
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>✓ Your report was successfully resolved by the city! Thank you for your contribution.</span>
                      </div>
                    )}

                    {/* Image display */}
                    {report.imageUrl && (
                      <div 
                        className="w-full h-48 overflow-hidden bg-gray-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800 relative cursor-pointer"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <img
                          src={report.imageUrl}
                          alt={report.summary}
                          className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60" />
                      </div>
                    )}

                    {/* Body Details */}
                    <div className="p-5 md:p-6 flex-1 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 px-2.5 py-1 rounded-full shadow-3xs">
                          <Tag className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
                          {report.category}
                        </span>
                        
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-3xs ${getSeverityBadge(report.severity)}`}>
                          {report.severity} Severity
                        </span>
                      </div>

                      <div className="space-y-1 cursor-pointer" onClick={() => setSelectedReportId(report.id)}>
                        <h3 className="font-bold text-gray-950 dark:text-white text-base md:text-lg leading-tight hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          {report.summary}
                        </h3>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {report.createdAt ? (
                            new Date(typeof report.createdAt.toDate === "function" ? report.createdAt.toDate() : report.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          ) : (
                            "Just now"
                          )}
                        </p>
                      </div>

                      {report.reporterName && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-bold bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/40 dark:border-indigo-900/30 rounded-lg px-2.5 py-1.5 shadow-3xs">
                          {report.reporterPhoto ? (
                            <img src={report.reporterPhoto} alt={report.reporterName} className="w-4 h-4 rounded-full border border-indigo-200 dark:border-indigo-800" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center text-[8px] border border-indigo-200 dark:border-indigo-800">
                              {report.reporterName[0].toUpperCase()}
                            </div>
                          )}
                          <span className="truncate">Reported securely by: <span className="text-indigo-700 dark:text-indigo-400 font-bold">{report.reporterName}</span></span>
                        </div>
                      )}

                      <p 
                        className="text-xs text-gray-600 dark:text-slate-300 line-clamp-3 bg-gray-50/50 dark:bg-slate-800 p-3 rounded-lg border border-gray-100 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        {report.description}
                      </p>

                      {/* Geotag and Map view */}
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-slate-400 border-t border-gray-100/60 dark:border-slate-800 pt-3">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-red-500" />
                          Lat: {report.latitude.toFixed(4)}, Long: {report.longitude.toFixed(4)}
                        </span>
                        <button
                          onClick={() => setSelectedReportId(report.id)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Details & Map
                        </button>
                      </div>
                    </div>

                    {/* Footer Controls */}
                    <div className="px-5 py-4 bg-gray-50/60 dark:bg-slate-900/60 border-t border-gray-100/80 dark:border-slate-800 flex items-center justify-between gap-4 rounded-b-2xl">
                      {getStatusBadge(report.status)}

                      <div className="flex items-center gap-3">
                        {/* Priority score display */}
                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500 bg-gray-100/80 dark:bg-slate-800 px-2 py-1 rounded-lg border border-gray-200/50 dark:border-slate-700">
                          Score: <span className="text-gray-800 dark:text-slate-200">{report.priorityScore}</span>
                        </span>
                        
                        {/* Confirmation CTA */}
                        <div className="relative group">
                          <button
                            onClick={(e) => handleConfirm(report.id, e)}
                            disabled={confirmedIds.includes(report.id) || report.status === "Resolved"}
                            className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 shadow-3xs cursor-pointer ${
                              confirmedIds.includes(report.id)
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : report.status === "Resolved"
                                ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                                : "bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 hover:border-indigo-300 dark:hover:border-indigo-600"
                            }`}
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${confirmedIds.includes(report.id) ? "fill-emerald-600" : ""}`} />
                            {confirmedIds.includes(report.id) 
                              ? `Confirmed (${report.confirmations})` 
                              : `Confirm (${report.confirmations})`
                            }
                          </button>

                          {/* Educational Tooltip */}
                          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2.5 bg-slate-900 text-[10px] text-white rounded-lg shadow-md z-30 pointer-events-none transition-all duration-200">
                            <div className="font-bold mb-0.5 text-indigo-300">Boost Priority Score!</div>
                            Upvoting or confirming this issue adds <span className="text-emerald-400 font-bold">+5 points</span> to the priority score to escalate it to municipal services sooner.
                            <div className="absolute top-full right-6 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right Column: Leaderboard Panel (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    City Heroes Leaderboard
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-850 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                  Active Stats
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Citizen contribution metrics computed dynamically based on filed reports (+10 pts) and upvote confirmations (+1 pt). Join in and claim your badge!
              </p>

              <div className="space-y-3">
                {loading ? (
                  <LeaderboardSkeleton />
                ) : leaderboard.length === 0 ? (
                  <p className="text-xs text-slate-450 italic text-center py-6">No contribution data yet.</p>
                ) : (
                  leaderboard.map((userItem, index) => {
                    const isTop1 = index === 0;
                    const isTop2 = index === 1;
                    const isTop3 = index === 2;

                    return (
                      <div
                        key={userItem.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          currentUser?.uid === userItem.id
                            ? "bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-200 dark:border-indigo-850 shadow-3xs"
                            : "bg-slate-50/45 dark:bg-slate-850/30 border-slate-100/80 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Rank Icon or Number */}
                          <div className="shrink-0 flex items-center justify-center w-5">
                            {isTop1 ? (
                              <Crown className="w-4.5 h-4.5 text-amber-500 drop-shadow-xs" />
                            ) : isTop2 ? (
                              <Medal className="w-4 h-4 text-slate-400" />
                            ) : isTop3 ? (
                              <Medal className="w-4 h-4 text-amber-700 dark:text-amber-650" />
                            ) : (
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 font-mono">
                                #{index + 1}
                              </span>
                            )}
                          </div>

                          {/* Profile Photo */}
                          {userItem.photo ? (
                            <img
                              src={userItem.photo}
                              alt={userItem.name}
                              className="w-7 h-7 rounded-full border border-indigo-100 dark:border-indigo-900 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-black flex items-center justify-center text-[10px] border border-indigo-200 dark:border-indigo-900">
                              {userItem.name[0].toUpperCase()}
                            </div>
                          )}

                          {/* Details */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate block max-w-[80px] md:max-w-[100px]">
                                {userItem.name}
                              </span>
                              {currentUser?.uid === userItem.id && (
                                <span className="text-[8px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200/50 px-1 rounded uppercase tracking-wider leading-none py-0.5">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold whitespace-nowrap">
                                {userItem.count} {userItem.count === 1 ? "report" : "reports"}
                              </span>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">•</span>
                              <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1 rounded-md uppercase tracking-wider leading-none py-0.5 whitespace-nowrap">
                                {userItem.levelName}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Score Badge */}
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/20 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 shadow-4xs">
                            ★{userItem.score}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Citizen Contribution Tip Card */}
              <div className="p-4 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl space-y-2 relative overflow-hidden shadow-xs">
                <div className="absolute right-0 bottom-0 w-16 h-16 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-100">
                    Leaderboard Rewards
                  </span>
                </div>
                <p className="text-[9px] leading-relaxed font-medium text-indigo-150">
                  Gain point badges to climb high and gain municipal recognition. Active **Community Guardians** and **City Champions** receive expedited SLA priority routing on all future reported cases!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReportId(null)}
          onConfirm={(id, e) => {
            handleConfirm(id, e);
          }}
          isConfirmed={confirmedIds.includes(selectedReport.id)}
        />
      )}
    </div>
  );
}
