import { useState, useEffect, MouseEvent, useRef } from "react";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Report } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from "recharts";
import { BarChart3, AlertTriangle, CheckCircle, Clock, ShieldAlert, Sparkles, TrendingUp, HelpCircle, Globe, MapPin, Eye, Filter, Info, Navigation, Loader2, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { Map as PigeonMap, Marker as PigeonMarker } from "pigeon-maps";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { AnimatedCounter } from "./AnimatedCounter";
import ReportDetailModal from "./ReportDetailModal";
import { Skeleton } from "./Skeleton";

import firebaseConfig from "../../firebase-applet-config.json";

const API_KEY =
  (
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    firebaseConfig.apiKey ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
    ""
  ).trim();

const hasValidKey =
  Boolean(API_KEY) &&
  API_KEY.startsWith("AIza") &&
  API_KEY.length >= 30 &&
  !API_KEY.includes("YOUR_");

export default function AnalyticsDashboard() {
  const diagnosticsRef = useRef<HTMLDivElement>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map Filter and Selection States
  const [mapCategoryFilter, setMapCategoryFilter] = useState<string>("All");
  const [mapSeverityFilter, setMapSeverityFilter] = useState<string>("All");
  const [mapStatusFilter, setMapStatusFilter] = useState<string>("All");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  
  // Proximity-based Neighborhood Pulse state
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [areaSummaryLoading, setAreaSummaryLoading] = useState<boolean>(false);
  const [areaSummaries, setAreaSummaries] = useState<{ [clusterId: string]: any }>({});
  const [areaForecasts, setAreaForecasts] = useState<{ [clusterId: string]: any }>({});
  const [areaForecastLoading, setAreaForecastLoading] = useState<boolean>(false);
  const [areaSummaryError, setAreaSummaryError] = useState<string | null>(null);

  // Reactively lookup active report from real-time snapshot reports array
  const selectedReport = reports.find((r) => r.id === selectedReportId) || null;
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Helper for computing distance in km
  const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Compute geographical clusters reactively based on currently loaded reports
  const clusters = (() => {
    const validReports = reports.filter(r => r.latitude !== 0 && r.longitude !== 0);
    const result: {
      id: string;
      center: { lat: number; lng: number };
      reports: Report[];
      topCategory: string;
      avgSeverity: string;
    }[] = [];
    const assigned = new Set<string>();

    validReports.forEach((report) => {
      if (assigned.has(report.id)) return;

      const clusterReports: Report[] = [report];
      assigned.add(report.id);

      // Group reports within 1.5 km
      validReports.forEach((other) => {
        if (assigned.has(other.id)) return;
        const dist = getDistanceInKm(report.latitude, report.longitude, other.latitude, other.longitude);
        if (dist <= 1.5) {
          clusterReports.push(other);
          assigned.add(other.id);
        }
      });

      // Compute average center coordinates
      const totalLat = clusterReports.reduce((sum, r) => sum + r.latitude, 0);
      const totalLng = clusterReports.reduce((sum, r) => sum + r.longitude, 0);
      const center = {
        lat: totalLat / clusterReports.length,
        lng: totalLng / clusterReports.length,
      };

      // Find top category in this cluster
      const catCounts: { [key: string]: number } = {};
      clusterReports.forEach(r => {
        catCounts[r.category] = (catCounts[r.category] || 0) + 1;
      });
      const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "General";

      // Find most critical severity
      let avgSeverity = "Low";
      if (clusterReports.some(r => r.severity === "High")) avgSeverity = "High";
      else if (clusterReports.some(r => r.severity === "Moderate")) avgSeverity = "Moderate";

      result.push({
        id: `cluster-${report.id}`,
        center,
        reports: clusterReports,
        topCategory,
        avgSeverity,
      });
    });

    // Sort clusters by number of reports descending
    return result.sort((a, b) => b.reports.length - a.reports.length);
  })();

  const activeCluster = clusters.find(c => c.id === selectedClusterId) || null;

  const fetchAreaSummary = async (clusterId: string, clusterReports: Report[]) => {
    if (areaSummaries[clusterId] && areaForecasts[clusterId]) return; // already cached

    setAreaSummaryLoading(true);
    setAreaForecastLoading(true);
    setAreaSummaryError(null);

    try {
      const [summaryRes, forecastRes] = await Promise.all([
        fetch("/api/reports/area-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reports: clusterReports }),
        }),
        fetch("/api/reports/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reports: clusterReports }),
        })
      ]);

      if (!summaryRes.ok) {
        throw new Error("Failed to generate summary from server.");
      }

      const summaryData = await summaryRes.json();
      setAreaSummaries(prev => ({
        ...prev,
        [clusterId]: summaryData,
      }));

      if (forecastRes.ok) {
        const forecastData = await forecastRes.json();
        setAreaForecasts(prev => ({
          ...prev,
          [clusterId]: forecastData,
        }));
      }
    } catch (err: any) {
      console.error("Area summary/forecast error:", err);
      setAreaSummaryError(err.message || "Something went wrong generating the area diagnostics.");
    } finally {
      setAreaSummaryLoading(false);
      setAreaForecastLoading(false);
    }
  };

  const handleSelectCluster = (cluster: typeof clusters[0]) => {
    setSelectedClusterId(cluster.id);
    fetchAreaSummary(cluster.id, cluster.reports);
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        diagnosticsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  // Sync confirmed list on mount
  useEffect(() => {
    const saved = localStorage.getItem("civicpulse_confirmed_reports");
    if (saved) {
      try {
        setConfirmedIds(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Set default center once reports are loaded
  useEffect(() => {
    if (reports.length > 0 && !center) {
      const validReports = reports.filter(r => r.latitude !== 0 && r.longitude !== 0);
      if (validReports.length > 0) {
        setCenter({ lat: validReports[0].latitude, lng: validReports[0].longitude });
      }
    }
  }, [reports]);

  useEffect(() => {
    const path = "reports";
    const q = query(collection(db, path));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedReports: Report[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          
          // Calculate priority score:
          // High Severity = 50, Moderate = 30, Low = 10
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
        setError("Unable to load analytics. Please try again later.");
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, []);

  // Handlers
  const handleConfirm = async (reportId: string, event: MouseEvent) => {
    if (event) event.stopPropagation();
    if (confirmedIds.includes(reportId)) return;

    try {
      const docRef = doc(db, "reports", reportId);
      const currentReport = reports.find(r => r.id === reportId);
      const currentConfirmations = currentReport ? currentReport.confirmations : 0;
      
      await updateDoc(docRef, {
        confirmations: currentConfirmations + 1,
      });

      const updated = [...confirmedIds, reportId];
      setConfirmedIds(updated);
      localStorage.setItem("civicpulse_confirmed_reports", JSON.stringify(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
    }
  };

  // Filtered reports specifically for the Map
  const filteredReportsForMap = reports.filter((report) => {
    if (report.latitude == null || report.longitude == null) return false;
    const matchStatus = mapStatusFilter === "All" || report.status === mapStatusFilter;
    const matchSeverity = mapSeverityFilter === "All" || report.severity === mapSeverityFilter;
    const matchCategory = mapCategoryFilter === "All" || report.category === mapCategoryFilter;
    return matchStatus && matchSeverity && matchCategory;
  });

  // Calculate coordinates bounds for Fallback SVG Plotter
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  filteredReportsForMap.forEach(r => {
    if (r.latitude < minLat) minLat = r.latitude;
    if (r.latitude > maxLat) maxLat = r.latitude;
    if (r.longitude < minLng) minLng = r.longitude;
    if (r.longitude > maxLng) maxLng = r.longitude;
  });

  if (minLat === maxLat) { minLat -= 0.05; maxLat += 0.05; }
  if (minLng === maxLng) { minLng -= 0.05; maxLng += 0.05; }

  const getSvgCoords = (lat: number, lng: number) => {
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    const x = 10 + 80 * (lng - minLng) / (lngRange || 1);
    const y = 90 - 80 * (lat - minLat) / (latRange || 1);
    return { x, y };
  };

  // Compute metrics
  const totalReports = reports.length;
  const pendingReports = reports.filter((r) => r.status === "Pending").length;
  const resolvedReports = reports.filter((r) => r.status === "Resolved").length;
  const highSeverityReports = reports.filter((r) => r.severity === "High").length;

  // Average Resolution Time (SLA Analytics)
  const resolvedWithTimestamps = reports.filter(r => r.createdAt && r.resolvedAt);
  let avgResolutionDays = 0;
  if (resolvedWithTimestamps.length > 0) {
    let totalMs = 0;
    resolvedWithTimestamps.forEach(r => {
      const createdDate = typeof r.createdAt.toDate === "function" ? r.createdAt.toDate() : new Date(r.createdAt);
      const resolvedDate = new Date(r.resolvedAt!);
      totalMs += (resolvedDate.getTime() - createdDate.getTime());
    });
    const avgDays = totalMs / (1000 * 60 * 60 * 24);
    avgResolutionDays = Math.max(0.1, Math.round(avgDays * 10) / 10);
  }

  // Pie chart data: Status Distribution
  const statusData = [
    { name: "Pending Review", value: pendingReports, color: "#f59e0b" }, // Amber
    { name: "Resolved Issues", value: resolvedReports, color: "#10b981" }, // Emerald
  ].filter((item) => item.value > 0); // Hide empty slices

  // Bar chart data: Category Breakdown
  const categoryCounts = reports.reduce((acc: { [key: string]: number }, cur) => {
    acc[cur.category] = (acc[cur.category] || 0) + 1;
    return acc;
  }, {});

  const categoryData = Object.keys(categoryCounts).map((key) => ({
    name: key,
    count: categoryCounts[key],
  })).sort((a, b) => b.count - a.count);

  // Weekly resolved vs filed trend computation (last 6 weeks)
  const weeklyTrendData = (() => {
    const weeks: { name: string; startMs: number; endMs: number; filed: number; resolved: number }[] = [];
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;

    for (let i = 5; i >= 0; i--) {
      const endMs = now - i * oneWeekMs;
      const startMs = endMs - oneWeekMs;
      const startDateStr = new Date(startMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endDateStr = new Date(endMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      weeks.push({
        name: `${startDateStr} - ${endDateStr}`,
        startMs,
        endMs,
        filed: 0,
        resolved: 0,
      });
    }

    reports.forEach((r) => {
      let createdMs = 0;
      if (r.createdAt) {
        if (typeof r.createdAt.toDate === "function") {
          createdMs = r.createdAt.toDate().getTime();
        } else if (r.createdAt.seconds) {
          createdMs = r.createdAt.seconds * 1000;
        } else {
          createdMs = new Date(r.createdAt).getTime();
        }
      }

      let resolvedMs = r.resolvedAt ? new Date(r.resolvedAt).getTime() : null;

      weeks.forEach((wk) => {
        if (createdMs >= wk.startMs && createdMs < wk.endMs) {
          wk.filed += 1;
        }
        if (resolvedMs && resolvedMs >= wk.startMs && resolvedMs < wk.endMs) {
          wk.resolved += 1;
        }
      });
    });

    return weeks;
  })();

  const weeklyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950 dark:bg-slate-900 text-slate-100 p-3 border border-slate-800 dark:border-slate-800 shadow-md rounded-xl text-xs space-y-1.5">
          <p className="text-slate-400 dark:text-slate-500 font-bold">{payload[0].payload.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <p className="font-semibold text-slate-200">Filed: <span className="font-mono text-indigo-300">{payload[0].value}</span></p>
          </div>
          {payload[1] && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <p className="font-semibold text-slate-200">Resolved: <span className="font-mono text-emerald-300">{payload[1].value}</span></p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Sorted reports for AI Priority Panel
  const priorityReports = [...reports]
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 5); // top 5 most urgent issues

  // Tooltip custom styling
  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-900 px-3 py-2 border border-gray-100 dark:border-slate-800 shadow-md rounded-xl text-xs font-semibold">
          <p className="text-gray-500 dark:text-slate-400 font-bold">{payload[0].name}</p>
          <p className="text-blue-600 dark:text-indigo-400 font-mono mt-0.5">Value: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  // Dynamic City Health Score Calculation
  const cityHealthScore = (() => {
    if (reports.length === 0) return 100;
    
    // Start with 100
    // Deduct points based on pending issues, severity, and confirmations
    let deductions = 0;
    reports.forEach((r) => {
      if (r.status !== "Resolved") {
        let weight = r.severity === "High" ? 5 : r.severity === "Moderate" ? 2.5 : 1;
        // Escalations (confirmations) increase weight slightly
        weight += Math.min(5, (r.confirmations || 0) * 0.25);
        deductions += weight;
      }
    });
    
    // Reward points for high resolved ratio
    const resolvedPercentage = (resolvedReports / totalReports) * 100;
    const recoveryBonus = resolvedPercentage * 0.15; // up to +15 points
    
    let score = 100 - deductions + recoveryBonus;
    return Math.max(15, Math.min(100, Math.round(score)));
  })();

  return (
    <div className="space-y-6" id="analytics-dashboard-container">
      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-6">
        {/* City Health Score Card - Double Width */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md md:col-span-2 flex flex-col justify-between relative overflow-hidden"
        >
          {/* Decorative background glow */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl"></div>
          
          <div className="flex justify-between items-start z-10">
            <div>
              <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest bg-indigo-950/60 border border-indigo-900 px-2.5 py-1 rounded-full">
                AI City Health Index
              </span>
              <h3 className="text-sm font-bold text-slate-300 mt-3">Metropolitan Civic Health</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Based on active reports density, resolution rate, and upvote weight.</p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-3xl font-black text-white"><AnimatedCounter value={cityHealthScore} /><span className="text-xs text-slate-500">/100</span></span>
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full mt-1.5 flex items-center gap-1 ${
                cityHealthScore >= 80 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : cityHealthScore >= 55
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}>
                ● {cityHealthScore >= 80 ? "Optimal" : cityHealthScore >= 55 ? "Inspections Pending" : "Critical State"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between z-10 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              Trend Status: 
              <strong className={`font-extrabold uppercase tracking-wide ${
                cityHealthScore >= 75 ? "text-emerald-400" : cityHealthScore >= 50 ? "text-amber-400" : "text-red-400"
              }`}>
                {cityHealthScore >= 75 ? "📈 Improving" : cityHealthScore >= 50 ? "➡️ Stable" : "📉 Declining"}
              </strong>
            </span>
            <span className="text-[10px] font-mono text-indigo-400">Scan frequency: 30s</span>
          </div>
        </motion.div>

        {/* Total card */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1">
            <Skeleton className="w-12 h-12 rounded-xl hidden sm:block" />
            <div className="space-y-2">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-10 h-6" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1"
          >
            <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 hidden sm:block border border-indigo-100 dark:border-indigo-900/30">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Reports</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1"><AnimatedCounter value={totalReports} /></h3>
            </div>
          </motion.div>
        )}

        {/* Pending card */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1">
            <Skeleton className="w-12 h-12 rounded-xl hidden sm:block" />
            <div className="space-y-2">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-10 h-6" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1"
          >
            <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl text-amber-600 dark:text-amber-400 hidden sm:block border border-amber-100 dark:border-amber-900/30">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pending Issues</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1"><AnimatedCounter value={pendingReports} /></h3>
            </div>
          </motion.div>
        )}

        {/* Resolved card */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1">
            <Skeleton className="w-12 h-12 rounded-xl hidden sm:block" />
            <div className="space-y-2">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-10 h-6" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1"
          >
            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl text-emerald-600 dark:text-emerald-400 hidden sm:block border border-emerald-100 dark:border-emerald-900/30">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Resolved</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1"><AnimatedCounter value={resolvedReports} /></h3>
            </div>
          </motion.div>
        )}

        {/* Critical card */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1">
            <Skeleton className="w-12 h-12 rounded-xl hidden sm:block" />
            <div className="space-y-2">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-10 h-6" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1"
          >
            <div className="bg-red-50 dark:bg-red-950/40 p-3 rounded-xl text-red-600 dark:text-red-400 hidden sm:block border border-red-100 dark:border-red-900/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">High Severity</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1"><AnimatedCounter value={highSeverityReports} /></h3>
            </div>
          </motion.div>
        )}

        {/* Avg Resolution card */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1">
            <Skeleton className="w-12 h-12 rounded-xl hidden sm:block" />
            <div className="space-y-2">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-10 h-6" />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs flex items-center gap-4 lg:col-span-1 animate-pulse hover:animate-none"
          >
            <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 hidden sm:block border border-indigo-100 dark:border-indigo-900/30">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Avg Resolution</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {avgResolutionDays > 0 ? <AnimatedCounter value={`${avgResolutionDays}d`} /> : "N/A"}
              </h3>
            </div>
          </motion.div>
        )}
      </div>

      {/* Centralized Interactive Map Component */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-600 animate-pulse" /> Centralized Incident Map
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Geospatial index tracking all active and resolved community complaints in real-time.
            </p>
          </div>

          {/* Map Filtering Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Category selector */}
            <div className="relative">
              <select
                value={mapCategoryFilter}
                onChange={(e) => setMapCategoryFilter(e.target.value)}
                className="pl-3 pr-8 py-1.5 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
              >
                <option value="All">All Categories</option>
                <option value="Road Infrastructure">Roads</option>
                <option value="Water & Sanitation">Water & Sanitation</option>
                <option value="Public Safety & Hazards">Safety</option>
                <option value="Sanitation & Waste">Sanitation & Waste</option>
                <option value="Power & Lighting">Power & Lighting</option>
                <option value="Vandalism & Property">Vandalism</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Severity selector */}
            <div className="relative">
              <select
                value={mapSeverityFilter}
                onChange={(e) => setMapSeverityFilter(e.target.value)}
                className="pl-3 pr-8 py-1.5 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
              >
                <option value="All">All Severities</option>
                <option value="High">High Severity</option>
                <option value="Moderate">Moderate Severity</option>
                <option value="Low">Low Severity</option>
              </select>
            </div>

            {/* Status selector */}
            <div className="relative">
              <select
                value={mapStatusFilter}
                onChange={(e) => setMapStatusFilter(e.target.value)}
                className="pl-3 pr-8 py-1.5 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending Review</option>
                <option value="Resolved">Resolved Cases</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 relative overflow-hidden h-[450px]">
            <Skeleton className="absolute inset-0 w-full h-full" />
            <div className="z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Loading geospatial references...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map Canvas Frame */}
            <div className="lg:col-span-2 h-[380px] md:h-[450px] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative bg-slate-50 dark:bg-slate-950 shadow-inner flex flex-col">
              {hasValidKey ? (
                <APIProvider apiKey={API_KEY} version="weekly">
                  <GoogleMap
                    center={center || (filteredReportsForMap.length > 0 ? { lat: filteredReportsForMap[0].latitude, lng: filteredReportsForMap[0].longitude } : { lat: 37.7749, lng: -122.4194 })}
                    zoom={mapZoom}
                    onCenterChanged={(ev) => {
                      if (ev.detail.center) {
                        setCenter(ev.detail.center);
                      }
                    }}
                    onZoomChanged={(ev) => {
                      if (typeof ev.detail.zoom === "number") {
                        setMapZoom(ev.detail.zoom);
                      }
                    }}
                    mapId="CENTRAL_DASHBOARD_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: "100%", height: "100%" }}
                  >
                    {filteredReportsForMap.map((report) => (
                      <AdvancedMarker
                        key={report.id}
                        position={{ lat: report.latitude, lng: report.longitude }}
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <Pin
                          background={
                            report.status === "Resolved"
                              ? "#10b981"
                              : report.severity === "High"
                              ? "#ef4444"
                              : report.severity === "Moderate"
                              ? "#f59e0b"
                              : "#6366f1"
                          }
                          glyphColor="#ffffff"
                          borderColor="#ffffff"
                        />
                      </AdvancedMarker>
                    ))}
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="relative w-full h-full min-h-[380px] md:min-h-[450px]">
                  <PigeonMap
                    center={center ? [center.lat, center.lng] : (filteredReportsForMap.length > 0 ? [filteredReportsForMap[0].latitude, filteredReportsForMap[0].longitude] : [37.7749, -122.4194])}
                    zoom={mapZoom}
                    onBoundsChanged={({ center: newCenter, zoom: newZoom }) => {
                      setCenter({ lat: newCenter[0], lng: newCenter[1] });
                      setMapZoom(newZoom);
                    }}
                    height={450}
                  >
                    {filteredReportsForMap.map((report) => {
                      const markerProps: any = {
                        anchor: [report.latitude, report.longitude],
                        color:
                          report.status === "Resolved"
                            ? "#10b981"
                            : report.severity === "High"
                            ? "#ef4444"
                            : report.severity === "Moderate"
                            ? "#f59e0b"
                            : "#6366f1",
                        onClick: () => setSelectedReportId(report.id)
                      };
                      return (
                        <PigeonMarker
                          key={report.id}
                          {...markerProps}
                        />
                      );
                    })}
                  </PigeonMap>
                  <div className="absolute bottom-2 left-2 right-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between shadow-xs z-10 pointer-events-auto">
                    <span className="truncate font-medium text-slate-600 dark:text-slate-300">Showing Standard Interactive Map</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">Provide Google Maps Key for Satellite View</span>
                  </div>
                </div>
              )}

              {/* Floating Map Detail Overlay (Click marker -> interactive municipal response panel) */}
              {(() => {
                const selectedReport = reports.find(r => r.id === selectedReportId);
                if (!selectedReport) return null;

                // Calculate nearby count within 100 meters
                const selectedReportNearbyCount = reports.filter((other) => {
                  if (other.id === selectedReport.id || other.status === "Resolved") return false;
                  const dist = getDistanceInKm(selectedReport.latitude, selectedReport.longitude, other.latitude, other.longitude);
                  return dist <= 0.1; // 100 meters
                }).length;

                return (
                  <div className="absolute bottom-12 left-3 right-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-4 space-y-3 z-20 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          selectedReport.status === "Resolved"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
                            : selectedReport.severity === "High"
                            ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30"
                            : selectedReport.severity === "Moderate"
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30"
                            : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/30"
                        }`}>
                          {selectedReport.status === "Resolved" ? "Resolved" : selectedReport.severity}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase truncate">
                          {selectedReport.category}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedReportId("")}
                        className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 font-extrabold text-[10px] bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-0.5 rounded-lg shrink-0 transition"
                      >
                        ✕ Close
                      </button>
                    </div>

                    <div className="flex gap-3">
                      {selectedReport.imageUrl ? (
                        <img
                          src={selectedReport.imageUrl}
                          alt={selectedReport.summary}
                          className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-100 dark:border-slate-800 shadow-3xs"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-slate-50 dark:bg-slate-950 text-slate-300 dark:text-slate-700 rounded-lg shrink-0 flex items-center justify-center border border-slate-100 dark:border-slate-800">
                          <BarChart3 className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-snug">{selectedReport.summary}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                          Reported {selectedReport.createdAt ? new Date(typeof selectedReport.createdAt.toDate === "function" ? selectedReport.createdAt.toDate() : selectedReport.createdAt).toLocaleDateString() : "recently"} • {selectedReport.confirmations || 0} confirmations
                        </p>
                      </div>
                    </div>

                    {/* Proximity Warning Alert (Command Center Escalation) */}
                    {selectedReportNearbyCount >= 1 && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 p-2.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
                        <span>🔥</span>
                        <span>
                          <strong>{selectedReportNearbyCount + 1} reports</strong> within 100m! Possible road collapse/systemic break.
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={(e) => {
                          handleConfirm(selectedReport.id, e);
                        }}
                        disabled={confirmedIds.includes(selectedReport.id) || selectedReport.status === "Resolved"}
                        className={`flex-1 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 transition ${
                          confirmedIds.includes(selectedReport.id)
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : selectedReport.status === "Resolved"
                            ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-3xs"
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        {confirmedIds.includes(selectedReport.id) ? "Upvoted" : "Upvote (+5 priority)"}
                      </button>

                      {selectedReport.status !== "Resolved" && (
                        <button
                          onClick={async () => {
                            try {
                              const { doc, updateDoc } = await import("firebase/firestore");
                              const { db } = await import("../firebase");
                              await updateDoc(doc(db, "reports", selectedReport.id), {
                                status: "Resolved",
                                progressStage: "Resolved"
                              });
                            } catch (err: any) {
                              handleFirestoreError(err, OperationType.UPDATE, `reports/${selectedReport.id}`);
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg transition cursor-pointer shadow-3xs"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* List side panel with matching records */}
            <div className="flex flex-col h-[380px] md:h-[450px]">
              <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-t-xl border-t border-x border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Matched Reports ({filteredReportsForMap.length})</span>
                <span className="text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 px-2 py-0.5 rounded">List Index</span>
              </div>
              <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-b-xl overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReportsForMap.length > 0 ? (
                  filteredReportsForMap.map((report) => {
                    let sevBadge = "bg-indigo-50 text-indigo-700 border-indigo-100";
                    if (report.status === "Resolved") {
                      sevBadge = "bg-emerald-50 text-emerald-700 border-emerald-100";
                    } else if (report.severity === "High") {
                      sevBadge = "bg-red-50 text-red-700 border-red-100";
                    } else if (report.severity === "Moderate") {
                      sevBadge = "bg-amber-50 text-amber-700 border-amber-100";
                    }

                    return (
                      <div
                        key={report.id}
                        className="p-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors flex flex-col gap-2 cursor-pointer group"
                        onClick={() => {
                          setCenter({ lat: report.latitude, lng: report.longitude });
                          setSelectedReportId(report.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate max-w-[120px]">
                            {report.category}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.25 rounded border uppercase ${sevBadge}`}>
                            {report.status === "Resolved" ? "Resolved" : report.severity}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {report.summary}
                        </h4>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                          <span className="flex items-center gap-0.5">
                            <Navigation className="w-3 h-3 text-slate-400 rotate-45" />
                            {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                          </span>
                          <span className="text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                            Details <Eye className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-slate-400 dark:text-slate-600" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">No complaints to trace</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[180px] mx-auto leading-relaxed">
                      Select less restrictive filter criteria or report a new issue.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Neighborhood Civic Health Scanner */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" /> Neighborhood Civic Health Scanner
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              AI-driven spatial clustering that aggregates proximity-based complaints to diagnose systemic urban vulnerabilities.
            </p>
          </div>
          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/30 uppercase tracking-widest self-start md:self-auto">
            Proximity Aggregator
          </span>
        </div>

        {clusters.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: List of Proximity Sectors */}
            <div className="space-y-3 lg:col-span-1 max-h-[500px] overflow-y-auto pr-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detected Proximity Sectors ({clusters.length})</p>
              {clusters.map((cluster, idx) => {
                const isSelected = selectedClusterId === cluster.id;
                const cachedSummary = areaSummaries[cluster.id];
                
                let sevBorder = "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200";
                if (isSelected) sevBorder = "border-indigo-600 dark:border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 text-slate-800 dark:text-slate-100";
                else if (cluster.avgSeverity === "High") sevBorder = "border-red-100 dark:border-red-900/30 hover:border-red-300 dark:hover:border-red-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200";
                else if (cluster.avgSeverity === "Moderate") sevBorder = "border-amber-100 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200";

                return (
                   <div
                     key={cluster.id}
                     onClick={() => handleSelectCluster(cluster)}
                     className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-2.5 ${sevBorder} ${isSelected ? "ring-2 ring-indigo-600/10" : ""}`}
                   >
                     <div className="space-y-1">
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                           Sector #{idx + 1}
                          {areaForecasts[cluster.id]?.probability >= 70 && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-900/30 px-1.5 py-0.5 rounded-md animate-pulse shrink-0 ml-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              ALERT
                            </span>
                          )}
                         </span>
                         <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                           {cluster.reports.length} {cluster.reports.length === 1 ? "report" : "reports"}
                         </span>
                       </div>
                       <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs truncate max-w-[220px]">
                         {cachedSummary?.areaName || `Sector near ${cluster.topCategory}`}
                       </h4>
                       <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                         <MapPin className="w-3 h-3 text-slate-400" />
                         {cluster.center.lat.toFixed(3)}N, {cluster.center.lng.toFixed(3)}W
                       </p>
                     </div>

                     <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[10px]">
                       <span className="text-slate-500 dark:text-slate-400 font-medium truncate max-w-[120px]">
                         Top issue: <strong className="text-slate-700 dark:text-slate-300 font-bold">{cluster.topCategory}</strong>
                       </span>
                       <span className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-0.5">
                         {cachedSummary ? "View Diagnostics" : "Scan Area"} →
                       </span>
                     </div>
                   </div>
                 );
               })}
            </div>

            {/* Right Column: AI Diagnosed Report details */}
            <div ref={diagnosticsRef} className="lg:col-span-2 min-h-[350px] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col justify-center">
              {selectedClusterId && activeCluster ? (
                <div className="space-y-5">
                  {areaSummaryLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center space-y-3 text-center">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 animate-pulse">Running Spatial Regression Analysis...</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[240px]">Gemini is evaluating coordinates, categorization overlap, and public weight factors to generate your summary.</p>
                    </div>
                  ) : areaSummaryError ? (
                    <div className="py-16 flex flex-col items-center justify-center space-y-3 text-center">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Scan Failed</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[240px]">{areaSummaryError}</p>
                      <button
                        onClick={() => fetchAreaSummary(activeCluster.id, activeCluster.reports)}
                        className="text-xs font-bold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        Retry Scan
                      </button>
                    </div>
                  ) : areaSummaries[activeCluster.id] ? (
                    (() => {
                      const summary = areaSummaries[activeCluster.id];
                      
                      // Score color scheme
                      let scoreColor = "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/30";
                      let ratingColor = "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30";
                      if (summary.healthScore < 50) {
                        scoreColor = "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/30";
                        ratingColor = "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30";
                      } else if (summary.healthScore < 75) {
                        scoreColor = "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/30";
                        ratingColor = "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30";
                      }

                      return (
                        <div className="space-y-5 animate-fade-in">
                          {/* Diagnostic Header */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div className="space-y-1">
                              <span className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 px-2 py-0.5 rounded uppercase tracking-wider">
                                {summary.isFallback ? "Local Diagnostics" : "Gemini AI Diagnostics"}
                              </span>
                              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-lg leading-snug">
                                {summary.areaName}
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                Geographic center: {activeCluster.center.lat.toFixed(4)}N, {activeCluster.center.lng.toFixed(4)}W
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {/* circular score display */}
                              <div className={`w-14 h-14 rounded-full border-4 flex flex-col items-center justify-center shrink-0 ${scoreColor}`}>
                                <span className="text-lg font-black leading-none">{summary.healthScore}</span>
                                <span className="text-[8px] font-extrabold uppercase">Health</span>
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Civic Health</p>
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${ratingColor}`}>
                                  {summary.healthRating}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Analysis Summary */}
                          <div className="bg-slate-100/60 dark:bg-slate-800 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700">
                            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium italic">
                              "{summary.analysisSummary}"
                            </p>
                          </div>

                          {/* Predictive Failure Forecast Card */}
                          <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800/80 space-y-3.5 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-rose-600 dark:text-rose-400 animate-pulse" /> 🔮 AI Predictive Failure Forecast
                              </h4>
                              {areaForecastLoading ? (
                                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider animate-pulse">
                                  Modeling...
                                </span>
                              ) : areaForecasts[activeCluster.id] ? (
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wide ${
                                  areaForecasts[activeCluster.id].probability >= 70
                                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/40"
                                    : areaForecasts[activeCluster.id].probability >= 45
                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/50"
                                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/50"
                                }`}>
                                  {areaForecasts[activeCluster.id].severity} severity
                                </span>
                              ) : null}
                            </div>

                            {areaForecastLoading ? (
                              <div className="py-6 flex flex-col items-center justify-center space-y-2 text-center">
                                <Loader2 className="w-5 h-5 text-rose-500 animate-spin" />
                                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 animate-pulse">Running Monte Carlo Spatial Regression...</p>
                              </div>
                            ) : areaForecasts[activeCluster.id] ? (
                              (() => {
                                const forecast = areaForecasts[activeCluster.id];
                                let meterColor = "bg-emerald-500";
                                let bgMeterColor = "bg-emerald-100 dark:bg-emerald-950/40";
                                let probabilityText = "text-emerald-600 dark:text-emerald-400";
                                
                                if (forecast.probability >= 70) {
                                  meterColor = "bg-rose-500 animate-pulse";
                                  bgMeterColor = "bg-rose-100 dark:bg-rose-950/40";
                                  probabilityText = "text-rose-600 dark:text-rose-400 font-black";
                                } else if (forecast.probability >= 45) {
                                  meterColor = "bg-amber-500";
                                  bgMeterColor = "bg-amber-100 dark:bg-amber-950/40";
                                  probabilityText = "text-amber-600 dark:text-amber-400 font-extrabold";
                                }

                                return (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* Probability gauge */}
                                      <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                          <span>Failure Probability</span>
                                          <span className={probabilityText}>{forecast.probability}%</span>
                                        </div>
                                        <div className={`w-full h-2.5 rounded-full relative overflow-hidden ${bgMeterColor}`}>
                                          <div className={`h-full rounded-full transition-all duration-1000 ${meterColor}`} style={{ width: `${forecast.probability}%` }} />
                                        </div>
                                      </div>

                                      {/* Target System */}
                                      <div className="space-y-0.5">
                                        <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Asset System at Risk</p>
                                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                                          {forecast.targetSystem}
                                        </h5>
                                      </div>
                                    </div>

                                    {/* Rationale & Actions */}
                                    <div className="p-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200/70 dark:border-slate-800/60 space-y-2">
                                      <div>
                                        <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Forecasting Rationale</p>
                                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed mt-0.5">
                                          {forecast.rationale}
                                        </p>
                                      </div>
                                      <div className="border-t border-slate-100 dark:border-slate-900 pt-2 flex flex-col sm:flex-row sm:items-center gap-1.5">
                                        <span className="text-[8px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/30 px-1.5 py-0.5 rounded tracking-wide shrink-0 uppercase self-start sm:self-auto">
                                          Recommended Dispatch
                                        </span>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                          {forecast.recommendedAction}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">Forecasting data not loaded yet. Tap on another sector to sync.</p>
                            )}
                          </div>

                          {/* Patterns & Solutions Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Emerging Patterns */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Emerging Patterns
                              </h4>
                              <div className="space-y-2">
                                {summary.patterns.map((pattern: string, pIdx: number) => (
                                  <div key={pIdx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 shadow-3xs">
                                    <span className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                      {pIdx + 1}
                                    </span>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{pattern}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Preventative Solutions */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" /> Preventative Solutions
                              </h4>
                              <div className="space-y-2">
                                {summary.solutions.map((solution: string, sIdx: number) => (
                                  <div key={sIdx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 shadow-3xs">
                                    <span className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                      ✓
                                    </span>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{solution}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Actions Bar & Associated Reports */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setCenter(activeCluster.center);
                                  setMapZoom(15);
                                }}
                                className="text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-1.5 transition"
                              >
                                <Navigation className="w-3.5 h-3.5" /> Center Map on Area
                              </button>
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              Aggregating <strong className="text-slate-700 dark:text-slate-300 font-bold">{activeCluster.reports.length}</strong> community reports
                            </span>
                          </div>

                        </div>
                      );
                    })()
                  ) : null}
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <Globe className="w-10 h-10 text-slate-300 dark:text-slate-700 animate-pulse" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Select a Proximity Sector to Scan</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[280px] leading-relaxed">
                    Choose one of the automatically-detected geographic sectors on the left to aggregate complaints, run spatial analysis, and load the Area Civic Health diagnostics.
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="py-16 text-center text-xs text-gray-400 dark:text-slate-500 font-medium bg-gray-50/50 dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
            No complaints available to perform spatial regression analysis. Go to the "Report Issue" tab to submit reports.
          </div>
        )}
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown (2 columns wide) */}
        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs lg:col-span-2 space-y-4">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600 animate-pulse" /> Category Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quantity of reported issues classified under each civic division.</p>
          </div>

          <div className="h-64 w-full">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "transparent" }} content={customTooltip} />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={32}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? "#4f46e5" : "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                No categorical data available. Submit reports to render this chart.
              </div>
            )}
          </div>
        </div>

        {/* Status distribution Pie */}
        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600" /> Issue Resolution Status
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ratio of pending review complaints vs resolved issues.</p>
          </div>

          <div className="h-64 w-full flex flex-col justify-between items-center">
            {statusData.length > 0 ? (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 pb-2">
                  {statusData.map((entry, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs font-bold text-gray-700 dark:text-slate-300">
                        {entry.name} ({entry.value})
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                No status data. Submit a report to get started.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* City Improvement Over Time (Macro Weekly Trend Chart) */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 animate-pulse" /> City Improvement Over Time (Weekly Trend)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Weekly comparison of newly filed complaints versus completed and resolved tasks, proving municipal action.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold bg-slate-50 dark:bg-slate-950/40 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-850">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="text-gray-700 dark:text-slate-300">Filed Issues</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-700 dark:text-slate-300">Resolved Issues</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          {reports.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrendData} margin={{ top: 10, right: 15, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={weeklyTooltip} />
                <Line
                  type="monotone"
                  dataKey="filed"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                  name="Filed"
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                  name="Resolved"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
              No historical data available. Submit and resolve issues to render the trend line.
            </div>
          )}
        </div>
      </div>

      {/* AI Prioritization Panel */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" /> AI Priority Ranking Engine
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Urgency scoring calculated as: <span className="font-bold">Severity weight (Low=10, Mod=30, High=50) + Confirmations × 5</span>.
            </p>
          </div>
          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/30 uppercase tracking-widest hidden sm:inline-block">
            Autonomous Ranking
          </span>
        </div>

        {priorityReports.length > 0 ? (
          <div className="space-y-3">
            {priorityReports.map((report, index) => {
              // Determine badge level based on Priority Score
              let ratingText = "Moderate Priority";
              let ratingColor = "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30";
              if (report.priorityScore && report.priorityScore >= 70) {
                ratingText = "Critical Action Required";
                ratingColor = "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30 animate-pulse";
              } else if (report.priorityScore && report.priorityScore < 30) {
                ratingText = "Low Urgency";
                ratingColor = "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30";
              }

              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition cursor-pointer"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 animate-pulse">
                      #{index + 1}
                    </span>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-gray-800 dark:text-slate-200 bg-gray-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {report.category}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ratingColor}`}>
                          {ratingText}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-950 dark:text-slate-100 text-sm md:text-base">{report.summary}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">
                        Confirmations: <span className="text-gray-700 dark:text-slate-300 font-semibold">{report.confirmations}</span> • Status: <span className={`font-semibold ${report.status === "Resolved" ? "text-emerald-600" : "text-amber-500"}`}>{report.status}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t border-slate-100 dark:border-slate-800 md:border-t-0 pt-3 md:pt-0">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Priority Score</p>
                      <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{report.priorityScore}</p>
                    </div>
                    <button className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-1">
                      View Details <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-gray-400 dark:text-slate-500 font-medium bg-gray-50/50 dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
            No report history is logged. Go to the "Report Issue" tab to analyze and submit your first case.
          </div>
        )}
      </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReportId(null)}
          onConfirm={handleConfirm}
          isConfirmed={confirmedIds.includes(selectedReport.id)}
        />
      )}
    </div>
  );
}
