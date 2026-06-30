import {
  useState,
  useEffect,
  useRef,
  useCallback,
  DragEvent,
  ChangeEvent,
  FormEvent,
} from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, User } from "../firebase";
import {
  AlertTriangle,
  MapPin,
  Upload,
  Loader2,
  CheckCircle2,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  Check,
  Mic,
  MicOff,
  HardDrive,
  Camera,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SeverityType, AnalysisResult } from "../types";
import { compressImage, getVideoThumbnail } from "../utils";
import firebaseConfig from "../../firebase-applet-config.json";

interface ReportFormProps {
  onSuccess: () => void;
  user: User | null;
}

export default function ReportForm({ onSuccess, user }: ReportFormProps) {
  // Input states
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  // Geolocation states
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // AI analysis states
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Duplicate detection states
  const [duplicateReport, setDuplicateReport] = useState<any>(null);
  const [upvotingDuplicate, setUpvotingDuplicate] = useState(false);

  // Submission states
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [successData, setSuccessData] = useState<{ id: string, team: string, score: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Speech Recorder voice input states
  const [isListening, setIsListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera capture states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && cameraStreamRef.current) {
      node.srcObject = cameraStreamRef.current;
    }
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Camera permission denied or unavailable.");
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setImage(dataUrl);
        setImageMimeType("image/jpeg");
        setCompressedImage(null);
        stopCamera();
      }
    }
  };

  const startListening = async () => {
    setSpeechError(null);
    setTranscribing(false);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(",")[1];

          setTranscribing(true);
          try {
            const res = await fetch("/api/reports/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audio: base64Audio,
                mimeType: mediaRecorder.mimeType || "audio/webm",
              }),
            });

            const data = await res.json();
            if (data.error) {
              throw new Error(data.error);
            }

            if (data.text && data.text.trim()) {
              setDescription((prev) =>
                prev ? prev + " " + data.text.trim() : data.text.trim(),
              );
              setSpeechError(null);
            } else {
              setSpeechError(
                "No speech detected. Please try again and speak closer to your microphone.",
              );
            }
          } catch (transcribeErr: any) {
            console.error("Transcription error:", transcribeErr);
            setSpeechError(
              "AI transcription failed. Please verify your connection or Gemini API Key.",
            );
          } finally {
            setTranscribing(false);
          }
        };
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("Failed to access microphone or start recording:", err);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setSpeechError(
          "Microphone access denied. Try clicking 'Open in a new tab' at the top-right of the preview, and allow microphone permissions!",
        );
      } else {
        setSpeechError(
          `Microphone error: ${err.message || "Failed to start voice recorder."}`,
        );
      }
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping media recorder:", e);
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn("Error stopping audio tracks:", e);
      }
    }
    setIsListening(false);
  };

  const getDistanceInMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => {
    const R = 6371e3; // metres
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  };

  // Request location on load
  useEffect(() => {
    captureLocation();

    // Load Google Picker API
    if (typeof window !== "undefined" && (window as any).gapi) {
      (window as any).gapi.load("picker", () => {
        // Picker loaded
      });
    }

    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const openDrivePicker = (e: any) => {
    e.stopPropagation();
    e.preventDefault();
    const accessToken = localStorage.getItem("google_access_token");
    if (!accessToken) {
      alert(
        "Please sign in again to use Google Drive. (OAuth token not found)",
      );
      return;
    }

    if (!(window as any).google?.picker) {
      alert(
        "Google Picker API is still loading, please try again in a moment.",
      );
      return;
    }

    const pickerOrigin =
      window.location.ancestorOrigins &&
      window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[
            window.location.ancestorOrigins.length - 1
          ]
        : window.location.origin;

    const pickerCallback = async (data: any) => {
      if (data.action === (window as any).google.picker.Action.PICKED) {
        const file = data.docs[0];
        try {
          setReadingImage(true);
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );
          if (!response.ok) {
            throw new Error(`Drive API error: ${response.statusText}`);
          }
          const blob = await response.blob();
          const mimeType = file.mimeType || blob.type;
          const pickedFile = new File([blob], file.name, { type: mimeType });
          processFile(pickedFile);
        } catch (error) {
          console.error("Error fetching file from Drive:", error);
          alert("Failed to load file from Google Drive.");
          setReadingImage(false);
        }
      }
    };

    const view = new (window as any).google.picker.DocsView(
      (window as any).google.picker.ViewId.DOCS,
    );
    view.setMimeTypes(
      "image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/quicktime,video/webm",
    );

    const picker = new (window as any).google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback(pickerCallback)
      .setOrigin(pickerOrigin)
      .build();
    picker.setVisible(true);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        console.warn("Geolocation warning/error:", error.message || error);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(
              "Location permission denied. Please enable location permissions in your browser settings.",
            );
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError(
              "Location information is unavailable. Try again in a moment.",
            );
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out. Please retry.");
            break;
          default:
            setLocationError("An unknown location error occurred.");
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };

  // Drag and drop handlers
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("Please upload an image or video file.");
      return;
    }

    // Limit file size to 5MB for faster upload & processing
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Please upload a file smaller than 5MB.");
      return;
    }

    setReadingImage(true);
    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result as string;
      setImage(base64Str);

      try {
        if (isImage) {
          const comp = await compressImage(base64Str);
          setCompressedImage(comp);
        } else if (isVideo) {
          const thumb = await getVideoThumbnail(file);
          setCompressedImage(thumb);
        }
      } catch (err) {
        console.error("Error compressing media:", err);
        setCompressedImage(base64Str);
      } finally {
        setReadingImage(false);
      }
    };
    reader.onerror = () => {
      setReadingImage(false);
      alert("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Run Gemini AI analysis
  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    if (!description && !image) {
      setAiError(
        "Please provide either a text description or an image of the issue.",
      );
      return;
    }

    setAnalyzing(true);
    setAiError(null);
    setAiResult(null);
    setDuplicateReport(null);

    try {
      const response = await fetch("/api/reports/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          image: compressedImage || image,
          mimeType: imageMimeType,
          latitude,
          longitude,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to analyze the issue. Please check your API configuration.",
        );
      }

      setAiResult(data);

      // Perform real-time proximity-based AI Duplicate Detection
      if (latitude !== null && longitude !== null) {
        try {
          const reportsSnapshot = await getDocs(collection(db, "reports"));
          const existingReports: any[] = [];
          reportsSnapshot.forEach((docSnap) => {
            const rData = docSnap.data();
            existingReports.push({ id: docSnap.id, ...rData });
          });

          // Check if any active (non-resolved) report has the same category and is within 150m
          const duplicateThresholdMeters = 150;
          let matchedDup: any = null;

          for (const rep of existingReports) {
            if (
              rep.status !== "Resolved" &&
              rep.category === data.category &&
              rep.latitude &&
              rep.longitude
            ) {
              const dist = getDistanceInMeters(
                latitude,
                longitude,
                rep.latitude,
                rep.longitude,
              );
              if (dist <= duplicateThresholdMeters) {
                matchedDup = { ...rep, distanceMeters: Math.round(dist) };
                break;
              }
            }
          }

          if (matchedDup) {
            setDuplicateReport(matchedDup);
          }
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.LIST, "reports");
        }
      }
    } catch (err: any) {
      console.error(err);
      setAiError(
        err.message || "An unexpected error occurred during AI analysis.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!duplicateReport) return;
    setUpvotingDuplicate(true);
    try {
      const docRef = doc(db, "reports", duplicateReport.id);
      await updateDoc(docRef, {
        confirmations: (duplicateReport.confirmations || 0) + 1,
      });
      setSuccessMessage(
        "Thank you! You have confirmed and upvoted this existing issue. Increased confirmations help our city departments prioritize the repair!",
      );
      setIsSuccess(true);
      setTimeout(() => {
        setDescription("");
        setImage(null);
        setImageMimeType(null);
        setAiResult(null);
        setDuplicateReport(null);
        setIsSuccess(false);
        setSuccessMessage("");
        onSuccess();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      alert("Failed to confirm existing report: " + err.message);
    } finally {
      setUpvotingDuplicate(false);
    }
  };

  // Submit complete report to Firestore
  const handleSubmitReport = async () => {
    if (!aiResult) return;
    if (latitude === null || longitude === null) {
      alert(
        "Coordinates are required. Please allow location access or try capturing your location again.",
      );
      return;
    }

    setSubmitting(true);
    const collectionPath = "reports";

    try {
      const payload = {
        category: aiResult.category,
        severity: aiResult.severity,
        summary: aiResult.summary,
        description: description || "No written description provided.",
        imageUrl: compressedImage, // Store compressed image base64 directly or null
        imageMimeType: imageMimeType,
        latitude: latitude,
        longitude: longitude,
        status: "Pending",
        confirmations: 0,
        createdAt: serverTimestamp(),
        suggestedAction: aiResult.suggestedAction,
        reporterId: user?.uid || "anonymous",
        reporterName: user?.displayName || "Civic User",
        reporterEmail: user?.email || "anonymous@civicpulse.gov",
        reporterPhoto: user?.photoURL || "",
        assignedTo: "",
        assignedTeam:
          (aiResult as any).assignedTeam || "Public Works Response Squad",
        estimatedCost: (aiResult as any).estimatedCost || "₹4,500",
        estimatedTime: (aiResult as any).estimatedTime || "3 days",
        progressStage: "Reported",

        // AI Civic Intelligence Fields
        severityExplanation: (aiResult as any).severityExplanation || "",
        confidence: (aiResult as any).confidence || 94,
        rootCause: (aiResult as any).rootCause || "",
        riskIfIgnored: (aiResult as any).riskIfIgnored || "",
        affectedCitizens: (aiResult as any).affectedCitizens || "",
        schoolNearby: (aiResult as any).schoolNearby || false,
        hospitalNearby: (aiResult as any).hospitalNearby || false,
        trafficDensity: (aiResult as any).trafficDensity || "Low",
        priorityScore: (aiResult as any).priorityRank || 50,
        priorityRank: (aiResult as any).priorityRank || 50,
        responsibleDept: (aiResult as any).responsibleDept || "",
        supportingDept: (aiResult as any).supportingDept || "",
        estimatedCrew: (aiResult as any).estimatedCrew || "",
        equipment: (aiResult as any).equipment || "",
        repeatedFailureDetected:
          (aiResult as any).repeatedFailureDetected || false,
        repeatedFailureMessage: (aiResult as any).repeatedFailureMessage || "",
        repeatedFailureRecommendation:
          (aiResult as any).repeatedFailureRecommendation || "",
      };

      const docRef = await addDoc(collection(db, collectionPath), payload);

      // Autonomous AI System Alert Activation: If severity is High AND recurring issues are detected by City Memory,
      // the system autonomously publishes an urgent alert to warn field crews and neighborhood groups.
      if (payload.severity === "High" && payload.repeatedFailureDetected) {
        try {
          await addDoc(collection(db, "alerts"), {
            reportId: docRef.id,
            category: payload.category,
            severity: payload.severity,
            summary: payload.summary,
            latitude: payload.latitude,
            longitude: payload.longitude,
            createdAt: serverTimestamp(),
            repeatedFailureMessage:
              payload.repeatedFailureMessage ||
              "High-severity recurring civic hazard identified.",
            repeatedFailureRecommendation:
              payload.repeatedFailureRecommendation ||
              "Immediate municipal engineering investigation recommended.",
          });
        } catch (alertErr) {
          handleFirestoreError(alertErr, OperationType.CREATE, "alerts");
        }
      }

      setSuccessData({
        id: docRef.id.slice(0, 8).toUpperCase(),
        team: payload.assignedTeam || "Central Dispatch",
        score: payload.priorityScore || 0
      });
      setSuccessMessage(
        "Thank you for active citizenship. Your report has been analyzed by CivicPulse AI, geolocated, and logged for municipal verification.",
      );
      setIsSuccess(true);
      setTimeout(() => {
        // Reset form states
        setDescription("");
        setImage(null);
        setCompressedImage(null);
        setImageMimeType(null);
        setAiResult(null);
        setDuplicateReport(null);
        setIsSuccess(false);
        setSuccessMessage("");
        setSuccessData(null);
        onSuccess(); // Switch to feed or notify
      }, 4000);
    } catch (err: unknown) {
      alert(
        "Failed to submit report. Please check your connection or database quota.",
      );
      handleFirestoreError(err, OperationType.CREATE, collectionPath);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-2xl mx-auto" id="report-form-container">
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl text-center border border-emerald-100 dark:border-emerald-950/30 flex flex-col items-center justify-center min-h-[400px]"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-full text-emerald-500 dark:text-emerald-400 mb-6"
            >
              <CheckCircle2 className="w-16 h-16" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Report Submitted
            </h3>
            {successData && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-2 mb-4 space-y-1"
              >
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-lg">
                  Report #{successData.id}
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                    Assigned to {successData.team}
                  </span>
                  <span>&middot;</span>
                  <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-1 rounded-md font-medium">
                    AI Priority Score: {successData.score}
                  </span>
                </div>
              </motion.div>
            )}
            <p className="text-gray-600 dark:text-slate-300 max-w-md font-medium text-sm leading-relaxed mt-2">
              {successMessage ||
                "Thank you for active citizenship. Your report has been analyzed by CivicPulse AI, geolocated, and logged for municipal verification and prioritization."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-950 dark:text-white">
                    Report a Civic Issue
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Provide an image or describe the public hazard for instant
                    AI assessment.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAnalyze} className="space-y-6">
                {/* Image & Video Upload Zone */}
                <div>
                  <label htmlFor="issue-media-upload" className="block text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2">
                    Upload Issue Photo or Video
                  </label>
                  <div
                    onDragEnter={
                      analyzing || readingImage ? undefined : handleDrag
                    }
                    onDragOver={
                      analyzing || readingImage ? undefined : handleDrag
                    }
                    onDragLeave={
                      analyzing || readingImage ? undefined : handleDrag
                    }
                    onDrop={analyzing || readingImage ? undefined : handleDrop}
                    onClick={
                      analyzing || readingImage || image
                        ? undefined
                        : triggerFileSelect
                    }
                    className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center min-h-[150px] ${
                      analyzing || readingImage
                        ? "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 cursor-not-allowed"
                        : dragActive
                          ? "border-indigo-500 bg-indigo-50/50 cursor-pointer"
                          : "border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                    }`}
                  >
                    <input
                      type="file"
                      id="issue-media-upload"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={analyzing || readingImage}
                    />

                    {readingImage ? (
                      <div className="space-y-3 py-6 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide animate-pulse">
                          Processing media file...
                        </p>
                      </div>
                    ) : isCameraActive ? (
                      <div className="w-full max-h-[300px] flex flex-col items-center gap-3 relative">
                        <video
                          ref={setVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="max-h-[220px] rounded-lg object-contain shadow-sm border border-gray-100 dark:border-slate-800 w-full"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              capturePhoto();
                            }}
                            className="text-[10px] bg-indigo-600 text-white px-4 py-2 rounded-full font-bold hover:bg-indigo-700 transition"
                          >
                            <Camera className="w-3.5 h-3.5 inline mr-1" />
                            Capture Photo
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              stopCamera();
                            }}
                            className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-full font-bold hover:bg-slate-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : image ? (
                      <div className="relative w-full max-h-[220px] flex justify-center items-center gap-4">
                        <div className="relative rounded-lg">
                          {imageMimeType?.startsWith("video/") ? (
                            <video
                              src={image}
                              controls
                              className="max-h-[160px] rounded-lg object-contain shadow-sm border border-gray-100 dark:border-slate-800"
                            />
                          ) : (
                            <img
                              src={image}
                              alt="Civic issue preview"
                              className="max-h-[160px] rounded-lg object-contain shadow-sm border border-gray-100 dark:border-slate-800"
                            />
                          )}
                          {analyzing && (
                            <div className="absolute inset-0 bg-slate-900/60 rounded-lg flex flex-col items-center justify-center text-white backdrop-blur-[1.5px] overflow-hidden">
                              <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
                              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-100 drop-shadow-sm">
                                {imageMimeType?.startsWith("video/")
                                  ? "AI Assessing Video..."
                                  : "AI Assessing Photo..."}
                              </span>
                              <motion.div
                                className="absolute left-0 right-0 h-0.5 bg-indigo-400 shadow-[0_0_8px_#818cf8]"
                                initial={{ top: "0%" }}
                                animate={{ top: ["0%", "100%", "0%"] }}
                                transition={{
                                  duration: 2.2,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            </div>
                          )}
                          {!analyzing && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setImage(null);
                                setImageMimeType(null);
                              }}
                              className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black shadow-sm transition cursor-pointer z-10"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="mx-auto w-12 h-12 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-400 dark:text-slate-500">
                          {analyzing ? (
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                          ) : (
                            <Upload className="w-6 h-6" />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-slate-300 font-bold">
                          {analyzing ? (
                            <span className="text-indigo-600 dark:text-indigo-400">
                              AI is analyzing text description...
                            </span>
                          ) : (
                            <>
                              <span className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                Click to upload
                              </span>{" "}
                              or drag and drop
                            </>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          {analyzing
                            ? "Hold on while we run Gemini models"
                            : "Supports PNG, JPG, WEBP, WEBM, MP4 up to 5MB"}
                        </p>
                        {!analyzing && (
                          <div className="flex justify-center mt-3 gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startCamera();
                              }}
                              className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-full font-semibold border border-indigo-200 dark:border-indigo-800 flex items-center hover:bg-indigo-100 dark:hover:bg-indigo-800 transition"
                            >
                              <Camera className="w-3.5 h-3.5 mr-1" />
                              Take Photo / Video
                            </button>
                            <input
                              type="file"
                              ref={cameraInputRef}
                              onChange={handleFileChange}
                              accept="image/*,video/*"
                              capture="environment"
                              className="hidden"
                              disabled={analyzing || readingImage}
                            />
                            <button
                              type="button"
                              onClick={openDrivePicker}
                              className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full font-semibold border border-slate-200 dark:border-slate-700 flex items-center hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                            >
                              <HardDrive className="w-3.5 h-3.5 mr-1" />
                              Select from Google Drive
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Description Input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="description"
                      className="block text-sm font-semibold text-gray-800 dark:text-slate-200"
                    >
                      Describe the Issue
                    </label>
                    <button
                      type="button"
                      disabled={transcribing}
                      onClick={isListening ? stopListening : startListening}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer disabled:opacity-50 ${
                        isListening
                          ? "bg-red-500 hover:bg-red-600 text-white border-red-500 animate-pulse"
                          : "bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30"
                      }`}
                    >
                      {transcribing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />{" "}
                          Transcribing...
                        </>
                      ) : isListening ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" /> Stop Listening
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" /> Speak Issue (en-IN)
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue, e.g., 'Large pothole at the middle of the street right outside the public library, causing vehicles to swerve dangerously.'"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  {isListening && (
                    <p className="text-[11px] text-red-500 font-bold mt-1.5 animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                      Listening to your voice... Speak clearly now (supports
                      Indian accents).
                    </p>
                  )}
                  {transcribing && (
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold mt-1.5 animate-pulse flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-600 dark:text-indigo-400" />
                      Gemini AI is transcribing your spoken audio report...
                    </p>
                  )}
                  {speechError && (
                    <p className="text-[11px] text-rose-500 font-bold mt-1.5 flex items-start gap-1">
                      <span className="mt-0.5">⚠️</span> {speechError}
                    </p>
                  )}
                </div>

                {/* Location Display */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-2.5">
                      <div className="p-1.5 bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg mt-0.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          Incident Geotag
                        </h4>
                        {locating ? (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-slate-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Acquiring precise GPS coordinates...
                          </div>
                        ) : latitude !== null && longitude !== null ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-gray-600 dark:text-slate-300 font-mono">
                              Lat: {latitude.toFixed(6)}, Long:{" "}
                              {longitude.toFixed(6)}
                            </p>
                            <a
                              href={`https://maps.google.com/?q=${latitude},${longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold inline-block mt-1"
                            >
                              Verify location on Google Maps ↗
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-red-500 mt-1">
                            {locationError || "Coordinates not captured."}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={captureLocation}
                      disabled={locating}
                      className="text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-100 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${locating ? "animate-spin" : ""}`}
                      />
                      Recapture
                    </button>
                  </div>
                </div>

                {/* AI Error Messages */}
                {aiError && (
                  <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-xl border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-sm flex gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">AI Analysis Failed</p>
                      <p className="text-xs text-red-500/90 mt-0.5">
                        {aiError}
                      </p>
                    </div>
                  </div>
                )}

                {/* Primary Button */}
                {!aiResult && (
                  <button
                    type="submit"
                    disabled={analyzing || (!description && !image)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        AI is analyzing issue and severity...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 text-yellow-300" />
                        Analyze Issue with Gemini AI
                      </>
                    )}
                  </button>
                )}
              </form>

              {/* AI Result Section */}
              <AnimatePresence>
                {aiResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-800 space-y-4"
                  >
                    {duplicateReport && (
                      <div className="bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-5 space-y-3 shadow-xs">
                        <div className="flex gap-2.5">
                          <div className="p-2 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                              AI Duplicate Detection: Active Report Found
                              Nearby!
                            </h4>
                            <p className="text-xs text-amber-700/90 dark:text-amber-300/90 leading-relaxed mt-0.5">
                              An active{" "}
                              <strong>{duplicateReport.category}</strong> report
                              was found just{" "}
                              <strong>
                                {duplicateReport.distanceMeters} meters away
                              </strong>
                              . Our system detected 95% similarity in details.
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-950/20 rounded-xl p-3 flex gap-3 items-center">
                          {duplicateReport.imageUrl ? (
                            <img
                              src={duplicateReport.imageUrl}
                              alt="Existing issue"
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-100 dark:border-slate-800"
                            />
                          ) : (
                            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg shrink-0 flex items-center justify-center">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {duplicateReport.summary ||
                                duplicateReport.description}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              Reported status: {duplicateReport.status} •{" "}
                              {duplicateReport.confirmations || 0} confirmations
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={handleConfirmDuplicate}
                            disabled={upvotingDuplicate}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                          >
                            {upvotingDuplicate ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ThumbsUp className="w-3.5 h-3.5" />
                            )}
                            Confirm Existing (+1 Upvote)
                          </button>
                          <button
                            type="button"
                            onClick={() => setDuplicateReport(null)}
                            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-755 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            Create New Report Anyway
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-5 rounded-2xl border border-indigo-100/60 dark:border-indigo-900/20 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-400 tracking-widest uppercase bg-indigo-100 dark:bg-indigo-950/40 px-3 py-1 rounded-full flex items-center gap-1.5 border border-indigo-100/30 dark:border-indigo-900/30">
                          <Sparkles className="w-3.5 h-3.5 fill-indigo-700 dark:fill-indigo-400 text-transparent" />
                          Gemini AI Assessment
                        </span>

                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full border shadow-2xs ${
                            aiResult.severity === "High"
                              ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30"
                              : aiResult.severity === "Moderate"
                                ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30"
                                : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
                          }`}
                        >
                          {aiResult.severity} Severity
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
                            Classified Category
                          </span>
                          <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                            {aiResult.category}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
                            AI Summary Description
                          </span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 leading-relaxed">
                            {aiResult.summary}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
                            Suggested Action Plan
                          </span>
                          <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-2.5 rounded-lg">
                            {aiResult.suggestedAction}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAiResult(null)}
                        className="flex-1 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 py-3 rounded-xl text-sm font-semibold transition border border-slate-200 dark:border-slate-700 cursor-pointer text-center"
                      >
                        Reset & Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitReport}
                        disabled={submitting}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Submit Official Report
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
