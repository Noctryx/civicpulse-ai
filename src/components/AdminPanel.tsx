import { useState, useEffect, MouseEvent } from "react";
import { collection, doc, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Report } from "../types";
import { Search, Filter, CheckCircle2, MapPin, Loader2, AlertTriangle, ArrowUpDown, Calendar, HelpCircle, FileText, Eye, Bell, ShieldAlert, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReportDetailModal from "./ReportDetailModal";
import { Skeleton } from "./Skeleton";

export default function AdminPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Verified" | "Assigned" | "In Progress" | "Resolved">("All");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Selected report ID for detailed modal view
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // AI Dispatch Briefing states
  const [dispatchBrief, setDispatchBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState<boolean>(false);
  const [isBriefModalOpen, setIsBriefModalOpen] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const handleGenerateDispatchBrief = async () => {
    setIsBriefModalOpen(true);
    if (dispatchBrief) return; // already loaded

    setBriefLoading(true);
    try {
      // Pass only unresolved (pending or in-progress) reports to the dispatch briefing endpoint
      const activePendingReports = reports.filter(r => r.status !== "Resolved");
      const response = await fetch("/api/reports/dispatch-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports: activePendingReports }),
      });

      if (!response.ok) {
        throw new Error("Failed to load dispatch brief.");
      }

      const data = await response.json();
      setDispatchBrief(data.brief);
    } catch (err) {
      console.error(err);
      setDispatchBrief("### System Alert\n\nFailed to generate today's dispatch brief automatically. Please check if your connection is active and try again.\n\n* **Root Cause**: Gemini model connection or network interruption.");
    } finally {
      setBriefLoading(false);
    }
  };

  const handleCopy = () => {
    if (!dispatchBrief) return;
    navigator.clipboard.writeText(dispatchBrief);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const renderBoldText = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-extrabold text-slate-900 dark:text-slate-100">{part}</strong> : part);
  };

  const renderBriefingLine = (line: string, index: number) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" />;
    
    if (trimmed.startsWith("###")) {
      return (
        <h4 key={index} className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mt-5 mb-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {trimmed.replace("###", "").trim()}
        </h4>
      );
    }
    if (trimmed.startsWith("##")) {
      return (
        <h3 key={index} className="text-sm font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider mt-6 mb-3">
          {trimmed.replace("##", "").trim()}
        </h3>
      );
    }
    if (trimmed.startsWith("#")) {
      return (
        <h2 key={index} className="text-base font-black text-slate-900 dark:text-white mt-8 mb-4 border-l-4 border-indigo-600 pl-2">
          {trimmed.replace("#", "").trim()}
        </h2>
      );
    }
    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      let content = trimmed.substring(1).trim();
      if (content.startsWith("**")) {
        // Strip leading markdown bullet if redundant
        content = content.replace(/^\*\*/, "**");
      }
      return (
        <li key={index} className="text-xs text-slate-600 dark:text-slate-300 ml-4 list-disc space-y-1 py-1">
          {renderBoldText(content)}
        </li>
      );
    }
    return (
      <p key={index} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed my-2">
        {renderBoldText(trimmed)}
      </p>
    );
  };

  // Reactively lookup active report from real-time snapshot reports array
  const selectedReport = reports.find((r) => r.id === selectedReportId) || null;

  // Sync reports collection in real-time
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
          } as Report);
        });

        setReports(loadedReports);
        setLoading(false);
      },
      (err) => {
        setError("Unable to stream admin reports feed.");
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    // Stream alerts in real-time
    const qAlerts = query(collection(db, "alerts"), orderBy("createdAt", "desc"));
    const unsubscribeAlerts = onSnapshot(
      qAlerts,
      (snapshot) => {
        const loadedAlerts: any[] = [];
        snapshot.forEach((docSnap) => {
          loadedAlerts.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAlerts(loadedAlerts);
      },
      (err: any) => {
        if (!String(err).includes("Quota limit exceeded")) {
          console.error("Failed to stream autonomous system alerts:", err);
        }
        handleFirestoreError(err, OperationType.LIST, "alerts");
      }
    );

    return () => {
      unsubscribe();
      unsubscribeAlerts();
    };
  }, []);

  // Action: Mark an issue as Resolved in Firestore
  const handleResolve = async (reportId: string, event: MouseEvent) => {
    event.preventDefault();
    setResolvingId(reportId);

    const collectionPath = `reports`;
    try {
      const docRef = doc(db, collectionPath, reportId);
      
      // Update status and progressStage to 'Resolved', and set resolvedAt timestamp
      await updateDoc(docRef, {
        status: "Resolved",
        progressStage: "Resolved",
        resolvedAt: new Date().toISOString()
      });

      // Notify the original reporter via FCM
      const targetReport = reports.find(r => r.id === reportId);
      if (targetReport && targetReport.reporterId) {
        fetch("/api/fcm/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: targetReport.reporterId,
            title: "Report Resolved",
            body: `Your report for "${targetReport.category}" has been marked as resolved by an administrator.`
          })
        }).catch(err => console.log("FCM trigger failed:", err));
      }
    } catch (err: unknown) {
      alert("Failed to resolve report. Check connection or quota limit.");
      handleFirestoreError(err, OperationType.UPDATE, `${collectionPath}/${reportId}`);
    } finally {
      setResolvingId(null);
    }
  };

  // Metrics calculations
  const totalReports = reports.length;
  const pendingReports = reports.filter((r) => r.status !== "Resolved").length;
  const resolvedReports = reports.filter((r) => r.status === "Resolved").length;
  const highSeverityReports = reports.filter((r) => r.severity === "High").length;

  // Most Urgent Issues list (top 3 highest priority score reports still pending)
  const urgentReports = [...reports]
    .filter((r) => r.status !== "Resolved")
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 3);

  // In-memory searching & filtering
  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "All" || report.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6" id="admin-panel-container">
      {/* Admin Dashboard Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {loading ? (
          <>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-6 w-12" />
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-6 w-12" />
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-6 w-12" />
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-6 w-12" />
            </div>
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Filed Complaints</p>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{totalReports}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Awaiting Attention</p>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{pendingReports}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Resolved Cases</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{resolvedReports}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Critical Road Hazards</p>
              <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">{highSeverityReports}</p>
            </div>
          </>
        )}
      </div>

      {/* Grid of Urgent Pending Issues & Autonomous AI System Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Most Urgent Pending Issues banner (Lg: 7cols) */}
        <div className="p-5 rounded-2xl space-y-3 lg:col-span-7 bg-red-50/70 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping shrink-0" />
            <h3 className="text-sm font-bold text-red-800 dark:text-red-400 uppercase tracking-wider">Most Urgent Incidents Awaiting Resolution</h3>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100/60 dark:border-red-900/30 shadow-3xs space-y-2 h-[120px]">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100/60 dark:border-red-900/30 shadow-3xs space-y-2 h-[120px]">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ) : urgentReports.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">All reports are successfully resolved!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {urgentReports.map((report) => {
                const daysOpen = report.createdAt ? Math.floor((Date.now() - (typeof report.createdAt.toDate === "function" ? report.createdAt.toDate().getTime() : new Date(report.createdAt).getTime())) / 86400000) : 0;
                return (
                  <div key={report.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100/60 dark:border-red-900/30 shadow-3xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-100 dark:border-red-900/30">
                          Score: {report.priorityScore}
                        </span>
                        {daysOpen > 7 ? (
                          <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/30 px-1.5 py-0.5 rounded animate-pulse">
                            ⚠ SLA Breach ({daysOpen}d)
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                            Confirmations: {report.confirmations}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-gray-900 dark:text-slate-100 text-xs md:text-sm mt-1 line-clamp-1">{report.summary}</h4>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-2 mt-1">{report.description}</p>
                    </div>
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500">{report.category}</span>
                      <button
                        onClick={(e) => handleResolve(report.id, e)}
                        disabled={resolvingId === report.id}
                        className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded shadow-3xs cursor-pointer transition flex items-center gap-1"
                      >
                        {resolvingId === report.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Resolve"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Autonomous AI System Alerts Feed (Lg: 5cols) */}
        <div className="lg:col-span-5 bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/20 p-5 rounded-2xl flex flex-col justify-between">
          <div className="w-full">
            <div className="flex items-center justify-between border-b border-indigo-100/40 dark:border-indigo-950/30 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Live Autonomous AI Alerts
                </h3>
              </div>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
            </div>

            <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-3">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100/60 dark:border-indigo-950/40 shadow-4xs space-y-2 relative overflow-hidden pl-4">
                    <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 dark:bg-slate-700" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100/60 dark:border-indigo-950/40 shadow-4xs space-y-2 relative overflow-hidden pl-4">
                    <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 dark:bg-slate-700" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-6 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="p-2 bg-indigo-100/55 dark:bg-slate-800/80 rounded-full text-indigo-600 dark:text-indigo-400">
                    <Zap className="w-4 h-4 text-indigo-400 dark:text-indigo-500" />
                  </div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">All Systems Clean</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">No active systemic failure recurring alerts currently generated.</p>
                </div>
              ) : (
                alerts.map((alertItem) => (
                  <div
                    key={alertItem.id}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100/60 dark:border-indigo-950/40 shadow-4xs space-y-1.5 relative overflow-hidden pl-4"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        {alertItem.category}
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                        {alertItem.createdAt ? new Date(alertItem.createdAt.seconds ? alertItem.createdAt.seconds * 1000 : alertItem.createdAt).toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white line-clamp-1">{alertItem.summary}</p>
                    <p className="text-[10px] text-red-600 dark:text-red-400 font-medium leading-normal bg-red-50/50 dark:bg-red-950/20 p-1.5 rounded border border-red-100/40 dark:border-red-900/20">
                      <strong>System Pattern</strong>: {alertItem.repeatedFailureMessage}
                    </p>
                    {alertItem.repeatedFailureRecommendation && (
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-mono leading-relaxed italic">
                        🛠 {alertItem.repeatedFailureRecommendation}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live management tables and searches */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Civil Management Terminal</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Review user submissions, verify geolocations, and mark resolved actions.</p>
          </div>

          {/* Search and Filters box */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Daily Brief Button */}
            <button
              onClick={handleGenerateDispatchBrief}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3.5 py-2 rounded-xl border border-indigo-500 dark:border-indigo-400 shadow-3xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <FileText className="w-3.5 h-3.5" /> Daily Dispatch Brief (AI)
            </button>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 dark:text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category, details..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Status Dropdown */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 dark:text-slate-500">
                <Filter className="w-3.5 h-3.5" />
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="pl-9 pr-8 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Reported (Pending)</option>
                <option value="Verified">Verified</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved Cases</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live List rendering */}
        {loading ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-800 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="pt-6 first:pt-0 flex flex-col lg:flex-row gap-6 justify-between items-start">
                <div className="flex-1 flex flex-col sm:flex-row gap-5 items-start">
                  <Skeleton className="w-full sm:w-36 h-28 rounded-xl shrink-0" />
                  <div className="space-y-3 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </div>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </div>
                <div className="w-full lg:w-48 space-y-3 shrink-0">
                  <Skeleton className="h-8 w-full rounded-xl" />
                  <Skeleton className="h-8 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-xl text-center text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-slate-500 border border-dashed border-gray-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center">
            <HelpCircle className="w-10 h-10 text-gray-200 dark:text-slate-800 mb-2" />
            <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">No Matching Incidents Found</p>
            <p className="text-xs text-gray-300 dark:text-slate-600 mt-0.5">Try modifying your search text or status filter selection.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800 space-y-6">
            <AnimatePresence mode="popLayout">
              {filteredReports.map((report) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pt-6 first:pt-0 flex flex-col lg:flex-row gap-6 justify-between items-start"
                >
                  {/* Left Column: Image & Details */}
                  <div className="flex-1 flex flex-col sm:flex-row gap-5 items-start">
                    {report.imageUrl ? (
                      <div className="w-full sm:w-36 h-28 rounded-xl overflow-hidden bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 shrink-0">
                        <img
                          src={report.imageUrl}
                          alt={report.summary}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full sm:w-36 h-28 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-gray-300 dark:text-slate-700 shrink-0">
                        <FileText className="w-8 h-8 text-gray-200 dark:text-slate-800 mb-1" />
                        <span className="text-[10px] font-bold">No Attachment</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-700">
                          {report.category}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            report.severity === "High"
                              ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30"
                              : report.severity === "Moderate"
                              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30"
                              : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
                          }`}
                        >
                          {report.severity} Severity
                        </span>
                        {report.status === "Resolved" ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/30 px-2 py-0.5 rounded-full">
                            Resolved
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 px-2 py-0.5 rounded-full animate-pulse">
                            Pending Review
                          </span>
                        )}
                        {report.status !== "Resolved" && report.createdAt && (() => {
                          const daysOpen = Math.floor((Date.now() - (typeof report.createdAt.toDate === "function" ? report.createdAt.toDate().getTime() : new Date(report.createdAt).getTime())) / 86400000);
                          return daysOpen > 7 ? (
                            <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/30 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                              ⚠ SLA Breach ({daysOpen}d)
                            </span>
                          ) : null;
                        })()}
                      </div>

                      <h3 
                        className="font-bold text-gray-950 dark:text-slate-100 text-base leading-snug cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        {report.summary}
                      </h3>
                      <p 
                        className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 rounded-lg border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        Original Complaint: <span className="text-gray-700 dark:text-slate-300">{report.description}</span>
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 font-mono flex items-center gap-1.5 pt-1">
                        <Calendar className="w-3 h-3" />
                        Logged on: {report.createdAt ? new Date(typeof report.createdAt.toDate === "function" ? report.createdAt.toDate() : report.createdAt).toLocaleString() : "Just now"} • Confirmations: {report.confirmations} • Priority Score: {report.priorityScore}
                      </p>

                      {/* Display suggested AI Action */}
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-100/45 dark:border-indigo-900/30 text-xs font-medium text-indigo-900 dark:text-indigo-200 space-y-0.5 max-w-xl">
                        <p className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">AI Suggested Resolution Action</p>
                        <p className="text-slate-600 dark:text-slate-400 leading-normal">{report.suggestedAction}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Location & CTA Action */}
                  <div className="w-full lg:w-48 shrink-0 flex flex-row lg:flex-col justify-between items-center lg:items-end gap-4 border-t border-gray-50 lg:border-t-0 dark:border-slate-800 pt-4 lg:pt-0">
                    <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 space-y-1 w-full">
                      <p className="flex items-center gap-1 text-left lg:text-right justify-start lg:justify-end">
                        <MapPin className="w-3.5 h-3.5 text-red-500" /> Geolocation Info
                      </p>
                      <p className="font-mono text-gray-600 dark:text-slate-300 text-[10px] text-left lg:text-right">
                        Lat: {report.latitude.toFixed(5)}
                      </p>
                      <p className="font-mono text-gray-600 dark:text-slate-300 text-[10px] text-left lg:text-right">
                        Long: {report.longitude.toFixed(5)}
                      </p>
                      <button
                        onClick={() => setSelectedReportId(report.id)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline block mt-1 text-[11px] font-bold text-left lg:text-right w-full cursor-pointer"
                      >
                        View Details & Map ↗
                      </button>
                    </div>

                    {report.status !== "Resolved" ? (
                      <button
                        onClick={(e) => handleResolve(report.id, e)}
                        disabled={resolvingId === report.id}
                        className="w-full sm:w-auto lg:w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-xl text-xs font-bold shadow-3xs cursor-pointer transition flex items-center justify-center gap-1.5"
                      >
                        {resolvingId === report.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Resolving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Resolved
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/30 py-2 px-4 rounded-xl text-xs font-bold inline-block text-center w-full">
                        ✓ Case Resolved
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReportId(null)}
          onConfirm={async (id, e) => {
            if (e) e.preventDefault();
            try {
              const docRef = doc(db, "reports", id);
              // increment confirmations
              await updateDoc(docRef, {
                confirmations: (selectedReport.confirmations || 0) + 1
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, `reports/${selectedReport.id}`);
            }
          }}
          isConfirmed={false}
        />
      )}

      {/* Dispatch Brief Modal */}
      <AnimatePresence>
        {isBriefModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBriefModalOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
              className="relative bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 md:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4 shrink-0">
                <div className="space-y-1">
                  <span className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 px-2 py-0.5 rounded uppercase tracking-wider">
                    Administrative dispatcher
                  </span>
                  <h3 className="font-extrabold text-slate-950 dark:text-white text-base md:text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" /> Daily Dispatch Routing Brief
                  </h3>
                </div>
                <button
                  onClick={() => setIsBriefModalOpen(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200/50 dark:border-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans text-slate-700 dark:text-slate-300">
                {briefLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 animate-pulse">Running Spatial Routing Algorithms...</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[280px]">
                      Gemini is compiling unresolved high-priority complaints, calculating geographic vectors, and formatting crew logistics instructions.
                    </p>
                  </div>
                ) : dispatchBrief ? (
                  <div className="space-y-1 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 font-sans shadow-inner selection:bg-indigo-100 dark:selection:bg-indigo-950">
                    {dispatchBrief.split("\n").map((line, index) => renderBriefingLine(line, index))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-10">No active dispatch data found.</p>
                )}
              </div>

              {/* Footer CTA */}
              {!briefLoading && dispatchBrief && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {copySuccess ? "✓ Copied to Clipboard" : "📋 Copy Dispatch Text"}
                  </button>
                  <button
                    onClick={() => setIsBriefModalOpen(false)}
                    className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2 rounded-xl border border-indigo-500 dark:border-indigo-400 shadow-3xs transition cursor-pointer"
                  >
                    Confirm & Deploy crews
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
