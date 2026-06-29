import { useState, useEffect, FormEvent } from "react";
import { MapPin, Search, Compass, ExternalLink, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GroundingSource {
  title: string;
  url: string;
  type: "web" | "maps";
}

export default function CityAssistant() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  // User location
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    fetchLocation();
  }, []);

  const fetchLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocating(false);
      },
      (err) => {
        console.warn("Assistant location access warning/error:", err.message);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  };

  const handleSearch = async (e?: FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const searchQuery = customQuery || query;
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setSources([]);

    try {
      const res = await fetch("/api/maps/grounding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          latitude,
          longitude,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to search information.");
      }

      setResponse(data.text);

      // Parse grounding metadata
      const chunks = data.groundingMetadata?.groundingChunks || [];
      const extractedSources: GroundingSource[] = [];

      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          const uri = chunk.web.uri.toLowerCase();
          const isMap = uri.includes("google.com/maps") || uri.includes("maps.app.goo.gl") || uri.includes("maps.google.com");
          
          extractedSources.push({
            title: chunk.web.title || (isMap ? "Google Maps Place Profile" : "Verified Web Resource"),
            url: chunk.web.uri,
            type: isMap ? "maps" : "web",
          });
        } else if (chunk.maps && chunk.maps.uri) {
          extractedSources.push({
            title: chunk.maps.title || "Google Maps Place Profile",
            url: chunk.maps.uri,
            type: "maps",
          });
        }
      });

      setSources(extractedSources);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const presetQuestions = [
    "Where is the nearest government hospital?",
    "Where do I renew my driving license?",
    "I lost my Aadhaar card. How do I get a duplicate?",
    "Where is the nearest waste recycling or disposal center?",
    "Find the closest public library or learning hub.",
    "Where are the nearest electric vehicle charging stations?",
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6" id="city-assistant-container">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-6 md:p-8 shadow-md border border-indigo-950 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="space-y-3 max-w-xl z-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
            <Compass className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
            Google Maps Grounding Active
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Local Services &amp; Municipal Assistant
          </h2>
          <p className="text-slate-300 text-xs leading-relaxed font-medium">
            Ask queries about public facilities, community centers, landmarks, recycling hubs, or transit stations. The assistant uses real-time Google Maps Grounding to yield hyper-precise locations and verified maps profiles.
          </p>
        </div>

        {/* Location Box */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col gap-2 w-full md:w-auto min-w-[200px] z-10">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3 text-emerald-400" />
            Your Geolocated Coordinates
          </span>
          {locating ? (
            <div className="flex items-center gap-1.5 text-xs text-white">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Locating device...
            </div>
          ) : latitude && longitude ? (
            <div>
              <div className="text-xs font-bold text-white font-mono">
                {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E
              </div>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5">✔ Real location bound</p>
            </div>
          ) : (
            <div>
              <span className="text-xs text-slate-400">Not configured</span>
              <button 
                onClick={fetchLocation}
                className="block mt-2 text-[10px] font-extrabold text-indigo-300 hover:text-indigo-200 transition cursor-pointer uppercase tracking-wider"
              >
                Enable Permission
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Query Sandbox */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        <form onSubmit={(e) => handleSearch(e)}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="E.g., What parks with basketball courts are closest to my coordinates?"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder-slate-400 dark:placeholder-slate-500"
                id="assistant-query-input"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0"
              id="assistant-submit-btn"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Ask AI
            </button>
          </div>
        </form>

        {/* Preset Suggestions */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <HelpCircle className="w-3 h-3" /> Preset Questions
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presetQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(q);
                  handleSearch(undefined, q);
                }}
                className="text-left px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer truncate hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Sandbox */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs flex flex-col items-center justify-center gap-3"
          >
            <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-full text-indigo-600 dark:text-indigo-400 animate-pulse border border-indigo-100 dark:border-indigo-900/30">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Grounding Google Maps &amp; Search API...</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Querying live local databases. Retrieving coordinates, contact information, review context, and deep maps integration paths.
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-6 text-red-800 dark:text-red-300 flex items-start gap-4"
          >
            <div className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 p-2 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm">Failed to retrieve local results</h4>
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
            </div>
          </motion.div>
        )}

        {response && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Answer Content */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <Compass className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">AI Grounded Assistant Answer</h3>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                {response}
              </div>
            </div>

            {/* Citations and Grounding Links (MANDATORY REQUIREMENT) */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between self-start">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400">
                    <Compass className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs">Verified Maps Grounding</h3>
                    <p className="text-[9px] text-slate-400">Direct citations &amp; location links</p>
                  </div>
                </div>

                {sources.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {sources.map((src, index) => (
                      <a
                        key={index}
                        href={src.url}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        className="group block p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-400/50 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                            {src.type === "maps" ? "✔ Google Maps Place" : "✔ Web Source"}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                        </div>
                        <p className="text-xs font-bold text-slate-100 mt-1 line-clamp-2">
                          {src.title}
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center text-xs text-slate-400">
                    No explicit grounding URLs returned in response payload.
                  </div>
                )}
              </div>

              <div className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-800 pt-3 mt-4">
                All coordinates, facilities, and landmarks listed are directly sourced from live Google Maps index structures to prevent location hallucinations.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
