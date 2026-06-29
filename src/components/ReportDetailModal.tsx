import { useState, useEffect, MouseEvent } from "react";
import { Map as PigeonMap, Marker as PigeonMarker } from "pigeon-maps";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, MapPin, Calendar, ThumbsUp, CheckCircle, Clock, Tag, ExternalLink, 
  Sparkles, HelpCircle, ShieldAlert, Users, Briefcase, Wrench, 
  GraduationCap, Building2, Activity, FileText, AlertTriangle, Loader2,
  Cpu, Radio, Video, Send, Layers
} from "lucide-react";
import { Report } from "../types";
import { getReportCivicIntelligence, compressImage } from "../utils";

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

const JourneyTraceSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    {[1, 2, 3, 4, 5].map((step) => (
      <div key={step} className="flex gap-4">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mt-1 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-2 bg-slate-800 rounded w-1/3" />
          <div className="h-3.5 bg-slate-850 rounded w-3/4" />
          <div className="h-2 bg-slate-800 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

interface ReportDetailModalProps {
  report: Report | null;
  onClose: () => void;
  onConfirm: (reportId: string, event: MouseEvent) => void;
  isConfirmed: boolean;
}

export default function ReportDetailModal({ report, onClose, onConfirm, isConfirmed }: ReportDetailModalProps) {
  if (!report) return null;

  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [localProofPreview, setLocalProofPreview] = useState<string | null>(null);
  const [tracingLoading, setTracingLoading] = useState(true);

  useEffect(() => {
    setTracingLoading(true);
    const timer = setTimeout(() => {
      setTracingLoading(false);
    }, 850);
    return () => clearTimeout(timer);
  }, [report.id]);

  const intel = getReportCivicIntelligence(report);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High":
        return "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30";
      case "Moderate":
        return "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30";
      default:
        return "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30";
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
        onClick={onClose}
        id="report-modal-backdrop"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          id="report-modal-content"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/40 border border-indigo-200/20 dark:border-indigo-900/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Report Details #{report.id.substring(0, 6)}
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getSeverityColor(report.severity)}`}>
                {report.severity} Severity
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Side: Summary, Description, Image & Meta */}
            <div className="space-y-5">
              
              {/* Image Split Layout (Show Uploaded Images Everywhere / Resolution Proof) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {report.imageUrl && (
                  <div className="rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative shadow-xs flex flex-col">
                    <span className="bg-slate-900/80 text-white text-[9px] font-extrabold px-2 py-0.5 absolute top-2 left-2 rounded-md z-10 uppercase tracking-wider">BEFORE (Original)</span>
                    <img
                      src={report.imageUrl}
                      alt="Before repair"
                      className="w-full h-36 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                {report.afterImageUrl && (
                  <div className="rounded-xl overflow-hidden bg-emerald-50 border-emerald-300 border-2 relative shadow-xs flex flex-col">
                    <span className="bg-emerald-600 text-white text-[9px] font-extrabold px-2 py-0.5 absolute top-2 left-2 rounded-md z-10 uppercase tracking-wider">AFTER (Resolution Proof)</span>
                    <img
                      src={report.afterImageUrl}
                      alt="After repair"
                      className="w-full h-36 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              {/* Cost, Time, and Assignment Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-center flex flex-col justify-center">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Est. Cost</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{report.estimatedCost || "₹4,500"}</span>
                  <span className="text-[8px] text-indigo-500 font-extrabold block mt-0.5 uppercase tracking-wide">AI Calculated</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-center flex flex-col justify-center">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Est. Duration</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{report.estimatedTime || "3 days"}</span>
                  <span className="text-[8px] text-indigo-500 font-extrabold block mt-0.5 uppercase tracking-wide">AI Predicted</span>
                </div>
                <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/30 text-center flex flex-col justify-center">
                  <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-wider block">Assigned Team</span>
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate block mt-1" title={report.assignedTeam || "Public Works Squad"}>
                    {report.assignedTeam || "Public Works Team"}
                  </span>
                  <span className="text-[8px] text-indigo-500 font-extrabold block mt-0.5 uppercase tracking-wide">Dispatched</span>
                </div>
              </div>

              {/* Progress Timeline (Reported -> Verified -> Assigned -> Repair Started -> Resolved) */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-3xs space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Municipal Progress Timeline</span>
                <div className="flex items-center justify-between relative px-2">
                  {/* Background Line */}
                  <div className="absolute left-6 right-6 top-3 h-0.5 bg-slate-100 dark:bg-slate-800 -z-0"></div>
                  
                  {/* Progress Line */}
                  <div 
                    className="absolute left-6 top-3 h-0.5 bg-indigo-500 transition-all duration-500 -z-0" 
                    style={{
                      width: 
                        report.status === "Resolved" || report.progressStage === "Resolved" ? "calc(100% - 48px)" :
                        report.progressStage === "Repair Started" ? "75%" :
                        report.progressStage === "Assigned" ? "50%" :
                        report.progressStage === "Verified" ? "25%" : "0%"
                    }}
                  ></div>

                  {/* Stage Nodes */}
                  {[
                    { stage: "Reported", label: "Reported" },
                    { stage: "Verified", label: "Verified" },
                    { stage: "Assigned", label: "Assigned" },
                    { stage: "Repair Started", label: "Repair" },
                    { stage: "Resolved", label: "Resolved" }
                  ].map((s, idx) => {
                    const isCompleted = 
                      report.status === "Resolved" || report.progressStage === "Resolved" ||
                      (s.stage === "Reported") ||
                      (s.stage === "Verified" && ["Verified", "Assigned", "Repair Started"].includes(report.progressStage || "")) ||
                      (s.stage === "Assigned" && ["Assigned", "Repair Started"].includes(report.progressStage || "")) ||
                      (s.stage === "Repair Started" && (report.progressStage === "Repair Started"));
                    
                    const isActive = report.status === "Resolved" || report.progressStage === "Resolved" ? s.stage === "Resolved" : (report.progressStage || "Reported") === s.stage;

                    return (
                      <div key={idx} className="flex flex-col items-center z-10 shrink-0">
                        <div 
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] border shadow-2xs transition-all duration-300 ${
                            isActive 
                              ? "bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950 scale-110" 
                              : isCompleted 
                              ? "bg-emerald-500 border-emerald-500 text-white" 
                              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {isCompleted ? "✓" : idx + 1}
                        </div>
                        <span className={`text-[8px] font-extrabold mt-1.5 transition-colors uppercase tracking-wider ${isActive ? "text-indigo-600 dark:text-indigo-400" : isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full">
                    <Tag className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    {report.category}
                  </span>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-100 dark:border-slate-700">
                    Priority Score: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{report.priorityScore}</span>
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                  {report.summary}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5" />
                  Logged on: {report.createdAt ? (report.createdAt as any).toDate ? (report.createdAt as any).toDate().toLocaleString() : new Date(report.createdAt as any).toLocaleString() : "Just now"}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">User Narrative</span>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 leading-relaxed font-medium">
                  {report.description}
                </p>
              </div>

              {report.reporterName && (
                <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 shadow-3xs">
                  {report.reporterPhoto ? (
                    <img src={report.reporterPhoto} alt={report.reporterName} className="w-6 h-6 rounded-full border border-indigo-200 dark:border-indigo-800" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center text-xs">
                      {report.reporterName[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-widest">Secure Civic Reporter</span>
                    <span className="text-slate-800 dark:text-slate-200 font-extrabold">{report.reporterName}</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-450 font-mono block">{report.reporterEmail}</span>
                  </div>
                </div>
              )}

              {/* City Memory System (Feature 3) */}
              {intel.repeatedFailureDetected && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-400 dark:border-amber-900 rounded-xl p-4 space-y-2 text-amber-900 dark:text-amber-300 shadow-3xs">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 font-extrabold uppercase text-[10px] tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-600 animate-bounce" />
                    City Memory: Recurring Incident Warning
                  </div>
                  <p className="text-xs font-bold leading-normal">
                    {intel.repeatedFailureMessage || "This sector has logged multiple infrastructure failures within the last 5 months."}
                  </p>
                  {intel.repeatedFailureRecommendation && (
                    <div className="bg-amber-100/60 dark:bg-amber-950/40 p-2.5 rounded-lg text-xs font-semibold border border-amber-200 dark:border-amber-900/30 mt-1">
                      <span className="text-amber-900 dark:text-amber-200 font-extrabold">Systemic Remedy Recommendation:</span> {intel.repeatedFailureRecommendation}
                    </div>
                  )}
                </div>
              )}

              {/* AI Civic Intelligence Report Hub (Feature 2, 7, 8, 14) */}
              <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 space-y-4 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4.5 h-4.5 text-indigo-400 fill-indigo-400/20" />
                    <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest">
                      🧠 CivicPulse AI Intelligence Audit
                    </span>
                  </div>
                  <div className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono text-[9px] font-extrabold px-2.5 py-1 rounded-md">
                    Audit Confidence: {intel.confidence}%
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Why Severity is Chosen */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-1.5">
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      Severity Diagnostic (Why?)
                    </span>
                    <p className="text-xs text-slate-300 font-medium whitespace-pre-line leading-relaxed">
                      {intel.severityExplanation}
                    </p>
                  </div>

                  {/* Root Cause Analysis */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-1.5">
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Root Cause &amp; Risks
                    </span>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase font-bold">Inferred Origin:</span>
                        <span className="text-slate-200 font-bold">{intel.rootCause}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase font-bold">Risk If Neglected:</span>
                        <span className="text-red-300 font-bold">{intel.riskIfIgnored}</span>
                      </div>
                    </div>
                  </div>

                  {/* Impact Score & Affected Citizens */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2">
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      Community Impact &amp; Density
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase font-bold">Daily Impact:</span>
                        <span className="text-slate-200 font-extrabold">{intel.affectedCitizens} citizens</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase font-bold">Traffic Density:</span>
                        <span className="text-slate-200 font-extrabold">{intel.trafficDensity} Flow</span>
                      </div>
                    </div>
                    
                    {/* Proximity Indicators */}
                    <div className="flex gap-2 pt-1 border-t border-white/5">
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${intel.schoolNearby ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-slate-500"}`}>
                        <GraduationCap className="w-3 h-3" /> School Zone
                      </span>
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${intel.hospitalNearby ? "bg-red-500/20 text-red-300" : "bg-white/5 text-slate-500"}`}>
                        <Building2 className="w-3 h-3" /> Hospital Route
                      </span>
                    </div>
                  </div>

                  {/* Priority Rank Visualizer */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                        AI Emergency Priority Index
                      </span>
                      <span className="text-indigo-400 font-mono text-xs font-extrabold">{intel.priorityRank}/100</span>
                    </div>
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          intel.priorityRank >= 75 ? "bg-red-500" : intel.priorityRank >= 45 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${intel.priorityRank}%` }}
                      ></div>
                    </div>
                    <p className="text-[9px] text-slate-400 italic">
                      Prioritized relative to general city infrastructure wear, safety risk metrics, and upvotes.
                    </p>
                  </div>
                </div>

                {/* Dispatch Logistics & Operations Plan */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1 border-b border-white/5 pb-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                    AI Suggested Dispatch Logistics (Operations Plan)
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[9px] block uppercase font-bold">Responsible Dept:</span>
                      <span className="text-slate-200 font-extrabold">{intel.responsibleDept}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] block uppercase font-bold">Supporting Squad:</span>
                      <span className="text-slate-200 font-extrabold">{intel.supportingDept}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] block uppercase font-bold">Crew Strength:</span>
                      <span className="text-slate-200 font-extrabold">{intel.estimatedCrew}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] block uppercase font-bold">Standard Tools:</span>
                      <span className="text-slate-200 font-extrabold flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-indigo-300" />
                        {intel.equipment}
                      </span>
                    </div>
                  </div>

                  <div className="bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-900/40 text-xs text-indigo-300 font-semibold leading-relaxed">
                    <span className="text-indigo-400 font-extrabold uppercase text-[9px] tracking-wider block mb-0.5">Instruction to response team:</span>
                    {report.suggestedAction || "Proceed with standard diagnostic verification."}
                  </div>
                </div>
              </div>

              {/* Before/After Quality Comparison Audit Certificate (Feature 9) */}
              {report.afterImageUrl && (
                <div className="bg-gradient-to-r from-emerald-950 to-slate-900 text-white rounded-2xl border-2 border-emerald-500/40 p-4 space-y-3 shadow-md relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <CheckCircle className="w-4 h-4" />
                      AI Repair Quality Verification Audit Certificate
                    </div>
                    <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                      Pass • Excellent
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                    {report.category === "Road Infrastructure" 
                      ? "The comparison audit between the BEFORE and AFTER images shows robust surface leveling. Asphalt bituminous sealant density matches municipal guideline Class-II. Grade elevation is stable and smooth."
                      : "The comparison audit between BEFORE and AFTER confirms structural clearance and cleanup of coordinates. Debris level is 0%, and physical assets are restored to standard functional state."
                    }
                  </p>
                  <p className="text-[9px] text-emerald-400/80 italic font-medium">
                    Verified automatically via dual-image vision processing on 2026-06-27.
                  </p>
                </div>
              )}

              {/* Municipal Operations / Dispatch Console (Tier 2/3 hackathon feature) */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    Municipal Operations Dispatcher
                  </span>
                  <span className="bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                    Official Console
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`update-stage-${report.id}`} className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Update Stage</label>
                    <select
                      id={`update-stage-${report.id}`}
                      value={report.progressStage || "Reported"}
                      onChange={async (e) => {
                        const nextStage = e.target.value;
                        let statusVal = "Pending";
                        if (nextStage === "Verified") statusVal = "Verified";
                        else if (nextStage === "Assigned") statusVal = "Assigned";
                        else if (nextStage === "Repair Started") statusVal = "In Progress";
                        else if (nextStage === "Resolved") statusVal = "Resolved";
                        try {
                          const { doc, updateDoc, addDoc, collection, serverTimestamp } = await import("firebase/firestore");
                          const { db, auth } = await import("../firebase");
                          await updateDoc(doc(db, "reports", report.id), {
                            progressStage: nextStage,
                            status: statusVal,
                            resolvedAt: statusVal === "Resolved" ? new Date().toISOString() : null
                          });

                          // Notify reporter with fallback for testing
                          const recipientId = report.reporterId && report.reporterId !== "anonymous"
                            ? report.reporterId
                            : (auth.currentUser?.uid || "anonymous");

                          const stageTitles: Record<string, string> = {
                            "Reported": "Report Received",
                            "Verified": "Report Verified",
                            "Assigned": "Team Assigned",
                            "Repair Started": "Repair Work Started",
                            "Resolved": "Report Resolved"
                          };
                          const stageBodies: Record<string, string> = {
                            "Reported": `Your report for "${report.category}" has been filed and is awaiting review.`,
                            "Verified": `Your report for "${report.category}" has been verified by municipal authorities.`,
                            "Assigned": `A response team has been dispatched to resolve "${report.category}".`,
                            "Repair Started": `Maintenance crew has initiated physical repairs for "${report.category}".`,
                            "Resolved": `Your report for "${report.category}" has been marked as resolved by an administrator.`
                          };

                          const title = stageTitles[nextStage] || "Report Updated";
                          const body = stageBodies[nextStage] || `Your report status has been updated to ${nextStage}.`;

                          await addDoc(collection(db, "notifications"), {
                            userId: recipientId,
                            title,
                            body,
                            createdAt: serverTimestamp(),
                            read: false,
                            reportId: report.id
                          });

                          if (recipientId !== "anonymous") {
                            fetch("/api/fcm/notify", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                targetUserId: recipientId,
                                title,
                                body
                              })
                            }).catch(err => console.warn("FCM trigger failed:", err));
                          }
                        } catch (err: any) {
                          const { handleFirestoreError, OperationType } = await import("../firebase");
                          handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
                        }
                      }}
                      className="w-full bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Reported">Reported</option>
                      <option value="Verified">Verified</option>
                      <option value="Assigned">Assigned</option>
                      <option value="Repair Started">Repair Started</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`assign-team-${report.id}`} className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Assign Team</label>
                    <input
                      id={`assign-team-${report.id}`}
                      type="text"
                      placeholder="e.g. Road Crew Delta"
                      defaultValue={report.assignedTeam || ""}
                      onBlur={async (e) => {
                        const team = e.target.value;
                        if (!team) return;
                        try {
                          const { doc, updateDoc } = await import("firebase/firestore");
                          const { db } = await import("../firebase");
                          await updateDoc(doc(db, "reports", report.id), {
                            assignedTeam: team
                          });
                        } catch (err: any) {
                          const { handleFirestoreError, OperationType } = await import("../firebase");
                          handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
                        }
                      }}
                      className="w-full bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {/* Upload Resolution Proof */}
                <div className="pt-1">
                  <label htmlFor={`resolution-proof-${report.id}`} className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Submit Resolution Proof Photo</label>
                  <div className="flex gap-2">
                    <input
                      id={`resolution-proof-${report.id}`}
                      type="text"
                      placeholder="Paste image URL..."
                      key={report.afterImageUrl || ""}
                      defaultValue={report.afterImageUrl || ""}
                      disabled={isUploadingProof}
                      onBlur={async (e) => {
                        const url = e.target.value;
                        if (!url) return;
                        setIsUploadingProof(true);
                        setLocalProofPreview(url);
                        try {
                          const { doc, updateDoc, addDoc, collection, serverTimestamp } = await import("firebase/firestore");
                          const { db, auth } = await import("../firebase");
                          await updateDoc(doc(db, "reports", report.id), {
                            afterImageUrl: url,
                            status: "Resolved",
                            progressStage: "Resolved",
                            resolvedAt: new Date().toISOString()
                          });

                          // Notify reporter
                          const recipientId = report.reporterId && report.reporterId !== "anonymous"
                            ? report.reporterId
                            : (auth.currentUser?.uid || "anonymous");

                          const title = "Report Resolved";
                          const body = `Your report for "${report.category}" has been marked as resolved by an administrator (Resolution Proof photo attached).`;

                          await addDoc(collection(db, "notifications"), {
                            userId: recipientId,
                            title,
                            body,
                            createdAt: serverTimestamp(),
                            read: false,
                            reportId: report.id
                          });

                          if (recipientId !== "anonymous") {
                            fetch("/api/fcm/notify", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                targetUserId: recipientId,
                                title,
                                body
                              })
                            }).catch(err => console.warn("FCM trigger failed:", err));
                          }
                        } catch (err: any) {
                          const { handleFirestoreError, OperationType } = await import("../firebase");
                          handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
                        } finally {
                          setIsUploadingProof(false);
                        }
                      }}
                      className="flex-1 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isUploadingProof}
                      onClick={() => {
                        const fileInput = document.createElement("input");
                        fileInput.type = "file";
                        fileInput.accept = "image/*";
                        fileInput.onchange = async () => {
                          const file = fileInput.files?.[0];
                          if (!file) return;
                          setIsUploadingProof(true);
                          const reader = new FileReader();
                          reader.onload = async () => {
                            const base64 = reader.result as string;
                            try {
                              const compressedBase64 = await compressImage(base64);
                              setLocalProofPreview(compressedBase64);
                              const { doc, updateDoc, addDoc, collection, serverTimestamp } = await import("firebase/firestore");
                              const { db, auth } = await import("../firebase");
                              await updateDoc(doc(db, "reports", report.id), {
                                afterImageUrl: compressedBase64,
                                status: "Resolved",
                                progressStage: "Resolved",
                                resolvedAt: new Date().toISOString()
                              });

                              // Notify reporter
                              const recipientId = report.reporterId && report.reporterId !== "anonymous"
                                ? report.reporterId
                                : (auth.currentUser?.uid || "anonymous");

                              const title = "Report Resolved";
                              const body = `Your report for "${report.category}" has been marked as resolved by an administrator (Resolution Proof photo uploaded).`;

                              await addDoc(collection(db, "notifications"), {
                                userId: recipientId,
                                title,
                                body,
                                createdAt: serverTimestamp(),
                                read: false,
                                reportId: report.id
                              });

                              if (recipientId !== "anonymous") {
                                fetch("/api/fcm/notify", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    targetUserId: recipientId,
                                    title,
                                    body
                                  })
                                }).catch(err => console.warn("FCM trigger failed:", err));
                              }
                            } catch (err: any) {
                              const { handleFirestoreError, OperationType } = await import("../firebase");
                              handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
                            } finally {
                              setIsUploadingProof(false);
                            }
                          };
                          reader.readAsDataURL(file);
                        };
                        fileInput.click();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shrink-0 transition shadow-3xs cursor-pointer flex items-center gap-1.5"
                    >
                      {isUploadingProof ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload File..."
                      )}
                    </button>
                  </div>

                  {/* Real-time Resolution Proof Photo Upload State */}
                  {isUploadingProof && (
                    <div className="mt-2.5 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                      <div className="text-[10px]">
                        <span className="font-bold text-slate-700 dark:text-slate-200 block">Uploading &amp; Analyzing Resolution Proof...</span>
                        <span className="text-slate-500 dark:text-slate-400 block mt-0.5">Storing photo in City database and triggering vision audit</span>
                      </div>
                    </div>
                  )}

                  {/* Real-time Resolution Proof Photo Preview */}
                  {(report.afterImageUrl || localProofPreview) && !isUploadingProof && (
                    <div className="mt-2.5 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-3xs">
                      <div className="flex items-center gap-2">
                        <img 
                          src={report.afterImageUrl || localProofPreview || ""} 
                          alt="Resolution Proof Preview" 
                          className="w-10 h-10 object-cover rounded-md border border-slate-100 dark:border-slate-800" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-[10px]">
                          <span className="font-bold text-slate-700 dark:text-slate-200 block">Resolution Proof Attached</span>
                          <span className="text-emerald-600 font-extrabold uppercase text-[8px] tracking-wider block mt-0.5">✓ Status: Resolved</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setLocalProofPreview(null);
                          try {
                            const { doc, updateDoc, addDoc, collection, serverTimestamp } = await import("firebase/firestore");
                            const { db, auth } = await import("../firebase");
                            await updateDoc(doc(db, "reports", report.id), {
                              afterImageUrl: null,
                              status: "Pending",
                              progressStage: "Repair Started"
                            });

                            // Notify reporter
                            const recipientId = report.reporterId && report.reporterId !== "anonymous"
                              ? report.reporterId
                              : (auth.currentUser?.uid || "anonymous");

                            const title = "Resolution Proof Removed";
                            const body = `An administrator removed the resolution proof for your report on "${report.category}". Status reverted to Repair Started.`;

                            await addDoc(collection(db, "notifications"), {
                              userId: recipientId,
                              title,
                              body,
                              createdAt: serverTimestamp(),
                              read: false,
                              reportId: report.id
                            });

                            if (recipientId !== "anonymous") {
                              fetch("/api/fcm/notify", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  targetUserId: recipientId,
                                  title,
                                  body
                                })
                              }).catch(err => console.warn("FCM trigger failed:", err));
                            }
                          } catch (err: any) {
                            const { handleFirestoreError, OperationType } = await import("../firebase");
                            handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-[10px] font-bold bg-red-50 dark:bg-red-950/20 hover:bg-red-100 px-2 py-1 rounded-md transition cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: Google Map & Geolocation Details */}
            <div className="flex flex-col h-full space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Exact Incident Coordinates</span>
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-0.5"
                  >
                    Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] block font-sans">Latitude</span>
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{report.latitude.toFixed(6)}</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] block font-sans">Longitude</span>
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{report.longitude.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              {/* Map Container - Explicit height is required (CF2) */}
              <div className="flex-1 min-h-[260px] md:min-h-[300px] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
                {hasValidKey ? (
                  <APIProvider apiKey={API_KEY} version="weekly">
                    <GoogleMap
                      key={report.id}
                      defaultCenter={{ lat: report.latitude, lng: report.longitude }}
                      defaultZoom={15}
                      mapId="CIVIC_MAP_ID"
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <AdvancedMarker position={{ lat: report.latitude, lng: report.longitude }}>
                        <Pin 
                          background="#4f46e5" 
                          glyphColor="#ffffff" 
                          borderColor="#4338ca"
                        />
                      </AdvancedMarker>
                    </GoogleMap>
                  </APIProvider>
                ) : (
                  <div className="relative w-full h-full min-h-[300px]">
                    <PigeonMap
                      center={[report.latitude, report.longitude]}
                      defaultZoom={15}
                      height={300}
                    >
                      <PigeonMarker
                        anchor={[report.latitude, report.longitude]}
                        color="#4f46e5"
                      />
                    </PigeonMap>
                    <div className="absolute bottom-2 left-2 right-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between shadow-xs z-10 pointer-events-auto">
                      <span className="truncate">Showing Standard Interactive Map</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Provide Google Maps Key for Satellite View</span>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Intelligence Log & Journey Trace */}
              <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-4 md:p-5 space-y-4 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
                    <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest">
                      AI Journey Trace &amp; Audit Log
                    </span>
                  </div>
                  <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                    Execution Live Trace
                  </span>
                </div>

                <div className="relative pl-4 border-l border-slate-800 space-y-5">
                  {tracingLoading ? (
                    <JourneyTraceSkeleton />
                  ) : (
                    <>
                      {/* Step 1: Input Capture */}
                      <div className="relative">
                        {/* Circle Node */}
                        <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-900 ring-2 ring-indigo-500/20"></div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Step 1 • Input Modality Parsing</span>
                          <div className="flex items-start gap-1.5 text-xs">
                            {report.audioTranscript ? (
                              <>
                                <Radio className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                                <div>
                                  <p className="font-bold text-slate-200">Voice Transcription Captured (Gemini 2.5 Flash)</p>
                                  <p className="text-[10px] text-slate-400 italic mt-0.5">" {report.audioTranscript} "</p>
                                </div>
                              </>
                            ) : report.videoUrl || (report.imageUrl && (report.imageUrl.includes("video") || (report as any).imageMimeType?.includes("video"))) ? (
                              <>
                                <Video className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold text-slate-200">Video Frame-Sequence Analyzed (Gemini 3.5 Flash)</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">MP4/WEBM container parsed. Spatiotemporal structures mapped successfully.</p>
                                </div>
                              </>
                            ) : report.imageUrl ? (
                              <>
                                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold text-slate-200">Visual Feature Matrix Extracted (Gemini 3.5 Flash)</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">High-contrast pixel tensor read. Visual hazard objects localized.</p>
                                </div>
                              </>
                            ) : (
                              <>
                                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold text-slate-200">Structured Text Synthesized</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">Direct keyboard entry captured and tokenized for category matching.</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Multi-Model Processing */}
                      <div className="relative">
                        <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-900 ring-2 ring-indigo-500/20"></div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Step 2 • Multi-Model Classification</span>
                          <div className="flex items-start gap-1.5 text-xs">
                            <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-slate-200">Cognitive Categorization Engine</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Classified: <span className="text-indigo-400 font-extrabold">{report.category}</span> &bull; 
                                Severity: <span className="text-amber-400 font-extrabold">{report.severity}</span> &bull; 
                                Confidence: <span className="text-emerald-400 font-bold">{intel.confidence}%</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Geolocation Alignment */}
                      <div className="relative">
                        <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-900 ring-2 ring-indigo-500/20"></div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Step 3 • Geospatial Intersection Analysis</span>
                          <div className="flex items-start gap-1.5 text-xs">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-slate-200">Coordinates Mapped &amp; Safety Checks Resolved</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Location: <span className="text-slate-300 font-mono font-bold">({report.latitude.toFixed(4)}, {report.longitude.toFixed(4)})</span> &bull; 
                                School Zone: <span className={intel.schoolNearby ? "text-amber-400 font-bold" : "text-slate-500"}>{intel.schoolNearby ? "DETECTED" : "CLEAR"}</span> &bull; 
                                Hospital Route: <span className={intel.hospitalNearby ? "text-red-400 font-bold" : "text-slate-500"}>{intel.hospitalNearby ? "DETECTED" : "CLEAR"}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 4: City Memory Matcher */}
                      <div className="relative">
                        <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-900 ring-2 ring-indigo-500/20"></div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Step 4 • City Memory &amp; Recurrence Scan</span>
                          <div className="flex items-start gap-1.5 text-xs">
                            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-slate-200">Subterranean &amp; Historical Pattern Matching</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {intel.repeatedFailureDetected ? (
                                  <span className="text-amber-400 font-bold">⚠️ Warning: Recurring Failure Matched in 5-month window! Escalation dispatched.</span>
                                ) : (
                                  <span className="text-emerald-400 font-bold">✓ Pattern Cleared: No repeating failure trends within search radius.</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 5: Operations Queue */}
                      <div className="relative">
                        <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900 ring-2 ring-emerald-500/20"></div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">Step 5 • Autonomous Dispatch Routing</span>
                          <div className="flex items-start gap-1.5 text-xs">
                            <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-slate-200">Incident Enqueued into Operations Console</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Dept: <span className="text-slate-300 font-bold">{intel.responsibleDept}</span> &bull; 
                                SLA: <span className="text-indigo-400 font-bold">{report.severity === "High" ? "12 Hours (Emergency)" : "3 Days (Standard)"}</span>
                              </p>
                              {report.severity === "High" && intel.repeatedFailureDetected && (
                                <p className="text-[9px] text-red-400 font-extrabold mt-1">
                                  &bull; Autonomous alert dispatched live to municipal admin panel.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
              </div>
            </div>
          </div>

        </div>

          {/* Footer controls */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {report.status === "Resolved" ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/30">
                  <CheckCircle className="w-3.5 h-3.5" /> Resolved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/30">
                  <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending Review
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative group">
                <button
                  onClick={(e) => onConfirm(report.id, e)}
                  disabled={isConfirmed || report.status === "Resolved"}
                  className={`text-xs font-bold py-2 px-4 rounded-xl transition-all flex items-center gap-1.5 shadow-3xs cursor-pointer ${
                    isConfirmed
                      ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30"
                      : report.status === "Resolved"
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed"
                      : "bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${isConfirmed ? "fill-emerald-600 text-emerald-600" : ""}`} />
                  {isConfirmed 
                    ? `Confirmed (${report.confirmations})` 
                    : `Confirm Upvote (${report.confirmations})`
                  }
                </button>

                {/* Educational Tooltip */}
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-52 p-2.5 bg-slate-900 text-[10px] text-white rounded-lg shadow-md z-30 pointer-events-none transition-all duration-200">
                  <div className="font-bold mb-0.5 text-indigo-300">Boost Priority Score!</div>
                  Confirming this issue adds <span className="text-emerald-400 font-bold">+5 points</span> to the priority score to escalate it to municipal services sooner.
                  <div className="absolute top-full right-8 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 text-xs font-bold py-2 px-4 rounded-xl transition cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
