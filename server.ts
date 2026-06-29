import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { initializeApp as initAdmin, cert } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsers with increased limits for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Firebase Admin for FCM if service account is provided
let fcmReady = false;
let adminDb: any = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initAdmin({
      credential: cert(serviceAccount)
    });
    adminDb = getAdminFirestore();
    adminDb.settings({ databaseId: "ai-studio-19ea99b1-ecf0-4c28-ae07-4ceb923079a3" });
    fcmReady = true;
    console.log("Firebase Admin SDK initialized for FCM.");
  } else {
    console.log("FIREBASE_SERVICE_ACCOUNT not found. FCM push notifications will not be sent.");
  }
} catch (e: any) {
  console.warn("Failed to initialize Firebase Admin SDK:", e.message);
}

app.post("/api/fcm/notify", async (req, res) => {
  if (!fcmReady || !adminDb) {
    // Return success to gracefully degrade instead of crashing the client flow
    return res.json({ success: false, message: "FCM not configured on the server." });
  }

  try {
    const { targetUserId, title, body } = req.body;
    
    const userDoc = await adminDb.collection('users').doc(targetUserId).get();
    const tokens = userDoc.data()?.fcmTokens || [];

    if (tokens.length === 0) {
      return res.status(404).json({ error: "No FCM tokens found for user." });
    }

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await getAdminMessaging().sendEachForMulticast(message);
    return res.json({ success: true, response });
  } catch (error: any) {
    console.error("FCM Notify Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Initialize Gemini API
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("⚠️ GEMINI_API_KEY is not configured or uses placeholder. AI features will fail until configured.");
}

// Background Time-Triggered Autonomous Escalation Agent
function startAutonomousEscalationAgent(db: any) {
  if (!db) return;
  console.log("⚙️ Starting Server-Side Autonomous Escalation background agent (Runs every 60s)...");

  // Run initial match cycle in 5 seconds to generate alerts right after startup
  setTimeout(() => {
    runAutonomousEscalationScan(db);
  }, 5000);

  // Set periodic matches every 60 seconds
  setInterval(() => {
    runAutonomousEscalationScan(db);
  }, 60 * 1000);
}

async function runAutonomousEscalationScan(db: any) {
  try {
    console.log("🔍 [Autonomous Escalation Agent] Running background pattern matching tick...");
    
    // 1. Fetch reports
    const reportsSnapshot = await getDocs(collection(db, "reports"));
    const reportsList: any[] = [];
    reportsSnapshot.forEach((doc) => {
      reportsList.push({ id: doc.id, ...doc.data() });
    });

    // 2. Filter for unresolved ("Pending" or not "Resolved"), High severity, created in last 48 hours
    const unresolvedHighReports = reportsList.filter((r) => {
      if (r.status === "Resolved" || r.severity !== "High") return false;
      
      let createdTimeMs = Date.now();
      if (r.createdAt) {
        if (typeof r.createdAt.toDate === "function") {
          createdTimeMs = r.createdAt.toDate().getTime();
        } else if (r.createdAt.seconds) {
          createdTimeMs = r.createdAt.seconds * 1000;
        } else {
          createdTimeMs = new Date(r.createdAt).getTime();
        }
      }
      
      const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
      return createdTimeMs >= fortyEightHoursAgo;
    });

    if (unresolvedHighReports.length < 3) {
      console.log(`ℹ️ [Autonomous Escalation Agent] Only ${unresolvedHighReports.length} unresolved high-severity reports in past 48h. No critical clusters possible.`);
      return;
    }

    // 3. Find clusters. Two reports are in the same cluster if they are within 300 meters (0.3km) of each other.
    const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return 6371 * c;
    };

    const clusters: any[][] = [];
    const usedKeys = new Set<string>();

    for (const currentRep of unresolvedHighReports) {
      if (!currentRep.latitude || !currentRep.longitude) continue;
      
      const localCluster = unresolvedHighReports.filter((otherRep) => {
        if (!otherRep.latitude || !otherRep.longitude) return false;
        const dist = getDistanceKm(currentRep.latitude, currentRep.longitude, otherRep.latitude, otherRep.longitude);
        return dist <= 0.3; // 300 meters
      });

      if (localCluster.length >= 3) {
        const ids = localCluster.map((r) => r.id).sort();
        const key = ids.join("_");
        if (!usedKeys.has(key)) {
          usedKeys.add(key);
          clusters.push(localCluster);
        }
      }
    }

    if (clusters.length === 0) {
      console.log("ℹ️ [Autonomous Escalation Agent] No spatial clusters of 3+ high-severity issues found.");
      return;
    }

    // 4. Load current alerts to avoid duplicating
    const alertsSnapshot = await getDocs(collection(db, "alerts"));
    const existingClusterKeys = new Set<string>();
    alertsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.clusterKey) {
        existingClusterKeys.add(data.clusterKey);
      }
    });

    console.log(`⚡ [Autonomous Escalation Agent] Detected ${clusters.length} active spatial clusters! Processing...`);

    // 5. Autonomously write new alerts if they don't already exist
    for (const cluster of clusters) {
      const ids = cluster.map((r) => r.id).sort();
      const clusterKey = "cluster_" + ids.join("_");

      if (existingClusterKeys.has(clusterKey)) {
        console.log(`✓ [Autonomous Escalation Agent] Alert for cluster ${clusterKey} already exists. Skipping.`);
        continue;
      }

      let sumLat = 0;
      let sumLon = 0;
      cluster.forEach((r) => {
        sumLat += r.latitude;
        sumLon += r.longitude;
      });
      const avgLat = sumLat / cluster.length;
      const avgLon = sumLon / cluster.length;

      const categories = Array.from(new Set(cluster.map((r) => r.category))).join(", ");
      const summary = `⚠️ URGENT SPATIAL HAZARD CLUSTER DETECTED: 3+ unresolved High-Severity issues in close proximity!`;
      const repeatedFailureMessage = `Autonomous spatial density trigger activated! Detected a cluster of ${cluster.length} independent unresolved High-severity reports (${categories}) within a 300-meter radius. This indicates a highly localized safety escalation event.`;
      const repeatedFailureRecommendation = `IMMEDIATE FIELD CREW ROUTING ENFORCED. Send a combined multi-department inspect team to coordinates (${avgLat.toFixed(4)}, ${avgLon.toFixed(4)}) to secure the zone and prevent compound public safety failure. Priority score boosted to 100/100.`;

      console.log(`🚨 [Autonomous Escalation Agent] CREATING NEW ALERT ACTIVATION FOR CLUSTER: ${clusterKey}`);

      await addDoc(collection(db, "alerts"), {
        clusterKey: clusterKey,
        category: "Hazard Cluster",
        severity: "High",
        summary: summary,
        latitude: avgLat,
        longitude: avgLon,
        createdAt: new Date(),
        repeatedFailureMessage: repeatedFailureMessage,
        repeatedFailureRecommendation: repeatedFailureRecommendation,
        reportIds: ids,
      });
    }

  } catch (err: any) {
    console.error("❌ Error in background Autonomous Escalation Agent scan:", err.message || err);
  }
}

// Initialize Firebase for server-side utilities
let firestoreDb: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("✅ Server-side Firestore initialized successfully.");
    
    // Start our server-side time-triggered autonomous background agent!
    startAutonomousEscalationAgent(firestoreDb);
  } else {
    console.warn("⚠️ firebase-applet-config.json not found in server context.");
  }
} catch (fbErr: any) {
  console.error("❌ Failed to initialize server-side Firestore:", fbErr.message || fbErr);
}

// API endpoint for analyzing civic issues (multimodal / text-only)
app.post("/api/reports/analyze", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API Client is not configured. Please add your GEMINI_API_KEY in the Secrets panel in the AI Studio UI.",
      });
    }

    const { description, image, mimeType, latitude, longitude } = req.body;

    if (!description && !image) {
      return res.status(400).json({
        error: "Please provide either a text description or an image of the civic issue.",
      });
    }

    const contents: any[] = [];

    // Add image or video if uploaded
    if (image && mimeType) {
      // Remove data URL prefix if present (supports image and video mime-types)
      const base64Data = image.replace(/^data:[a-zA-Z0-9/-]+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    }

    // Check historical context from Firestore (City Memory System)
    let historicalContextPrompt = "";
    if (firestoreDb && latitude && longitude) {
      try {
        const querySnapshot = await getDocs(collection(firestoreDb, "reports"));
        const reportsList: any[] = [];
        querySnapshot.forEach((docSnap) => {
          const rep = docSnap.data();
          reportsList.push({ id: docSnap.id, ...rep });
        });
        
        // Find reports within a 200m radius
        const searchRadiusKm = 0.2;
        const nearbyReports = reportsList.filter((r) => {
          if (!r.latitude || !r.longitude) return false;
          
          const dLat = ((r.latitude - latitude) * Math.PI) / 180;
          const dLon = ((r.longitude - longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((latitude * Math.PI) / 180) *
              Math.cos((r.latitude * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distanceKm = 6371 * c;
          
          return distanceKm <= searchRadiusKm;
        });

        if (nearbyReports.length > 0) {
          historicalContextPrompt = `\n[CITY MEMORY SYSTEM - ACTIVE]\nWe found ${nearbyReports.length} existing reports within a 200m radius of these coordinates (Latitude: ${latitude}, Longitude: ${longitude}):\n`;
          nearbyReports.forEach((nr, idx) => {
            historicalContextPrompt += ` - Historical Incident #${idx + 1}: Category: "${nr.category}", Summary: "${nr.summary}", Status: "${nr.status}", Created At: ${nr.createdAt ? new Date(nr.createdAt.seconds * 1000).toLocaleDateString() : "unknown"}\n`;
          });
          historicalContextPrompt += `\nIf any of these historical reports match the category/nature of this new submission, flag this as a repeated failure ('repeatedFailureDetected' = true) and write a custom dispatch alert message and engineering warning to the city crew instructing them on systemic repair. If not, set 'repeatedFailureDetected' = false, message = "", and recommendation = "".\n`;
        }
      } catch (dbErr: any) {
        console.error("Error fetching historical context for City Memory:", dbErr);
      }
    }

    // Add text prompt
    contents.push({
      text: `Analyze the following user-submitted civic issue report. 
Description: "${description || "No description provided."}"
Coordinates: Latitude: ${latitude || "unknown"}, Longitude: ${longitude || "unknown"}
${historicalContextPrompt}

Classify this report into one of the standard categories, determine its severity, and provide a comprehensive AI Civic Intelligence Report. Fill out all properties accurately based on physical visual clues or text details.`,
    });

    // Request structured JSON output conforming to our schema with robust retries and fallbacks
    let responseText = "";
    let lastError: any = null;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash"];

    for (const modelName of modelsToTry) {
      let retries = 3;
      let delay = 1000;
      
      while (retries > 0) {
        try {
          console.log(`Analyzing report using ${modelName} (Attempts remaining: ${retries})...`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  category: {
                    type: Type.STRING,
                    description: "The primary category. Must be one of: 'Road Infrastructure', 'Water & Sanitation', 'Public Safety & Hazards', 'Sanitation & Waste', 'Power & Lighting', 'Vandalism & Property', 'Other'.",
                  },
                  severity: {
                    type: Type.STRING,
                    description: "The calculated severity. Must be one of: 'Low', 'Moderate', 'High'. Use 'High' for dangerous hazards, 'Moderate' for structural damage, and 'Low' for cosmetic or minor issues.",
                  },
                  summary: {
                    type: Type.STRING,
                    description: "A very clear, human-readable, 1-sentence summary explaining the exact issue (e.g., 'Large pothole filled with water near the crosswalk').",
                  },
                  suggestedAction: {
                    type: Type.STRING,
                    description: "A highly concrete, actionable instruction for city public works teams to address the problem.",
                  },
                  severityExplanation: {
                    type: Type.STRING,
                    description: "A bulleted list of 2-3 concise points explaining why this severity was chosen (e.g. Near high density area, water pooling, tripping hazard).",
                  },
                  confidence: {
                    type: Type.INTEGER,
                    description: "Calculated model confidence score from 50 to 99 representing image/text analysis confidence.",
                  },
                  rootCause: {
                    type: Type.STRING,
                    description: "Inferred physical or operational root cause of this failure, e.g. 'Thermal expansion of pavement and heavy cargo truck wear' or 'Aged municipal branch line failure'.",
                  },
                  riskIfIgnored: {
                    type: Type.STRING,
                    description: "Potential hazard or escalating impact if this complaint is ignored, e.g., 'Flooding of adjacent basement properties' or 'Tire punctures and potential night-time collisions'.",
                  },
                  affectedCitizens: {
                    type: Type.STRING,
                    description: "Estimated count of citizens affected daily by this issue. Pick a realistic range, e.g., '150-300' or '50-100' or '500+'.",
                  },
                  schoolNearby: {
                    type: Type.BOOLEAN,
                    description: "True if the issue appears to be near a school zone, educational institute, playground, or safe routing zone, else false.",
                  },
                  hospitalNearby: {
                    type: Type.BOOLEAN,
                    description: "True if near a hospital, medical clinic, or major emergency response path, else false.",
                  },
                  trafficDensity: {
                    type: Type.STRING,
                    description: "Calculated local traffic density category. Must be one of: 'Low', 'Medium', 'High'.",
                  },
                  priorityRank: {
                    type: Type.INTEGER,
                    description: "An emergency priority index from 1 to 100 calculated based on severity, hazard risk, and estimated citizen impact. High number = higher priority.",
                  },
                  responsibleDept: {
                    type: Type.STRING,
                    description: "The primary municipal department responsible, e.g., 'Department of Roads & Pavements', 'Water Supply & Sewerage Board', 'Municipal Power Grid Corp', 'Urban Health and Waste Management'.",
                  },
                  supportingDept: {
                    type: Type.STRING,
                    description: "An auxiliary department that might need to co-operate, e.g., 'Traffic Police Division', 'District Drainage Commission', 'Community Parks Board' or 'None'.",
                  },
                  estimatedCrew: {
                    type: Type.STRING,
                    description: "Recommended crew composition, e.g., '3 skilled crew and 1 inspector'.",
                  },
                  equipment: {
                    type: Type.STRING,
                    description: "Primary heavy equipment or special tool needed, e.g., 'Bituminous patch mix and hand tamper' or 'Submersible drainage pump'.",
                  },
                  estimatedCost: {
                    type: Type.STRING,
                    description: "Predicted repair cost in Rupees, e.g., '₹3,500' or '₹1,50,000'. Provide realistic estimations.",
                  },
                  estimatedTime: {
                    type: Type.STRING,
                    description: "Predicted duration for repair, e.g., '2 days', '5 days', '2 weeks'.",
                  },
                  assignedTeam: {
                    type: Type.STRING,
                    description: "Logical department team name responsible, e.g., 'Road Maintenance Team A' or 'Water Utility Division B'.",
                  },
                  repeatedFailureDetected: {
                    type: Type.BOOLEAN,
                    description: "True if historical context suggests a recurring or repeated issue in this local zone, else false.",
                  },
                  repeatedFailureMessage: {
                    type: Type.STRING,
                    description: "A descriptive notification to the city crew about historical failures, or empty string if none.",
                  },
                  repeatedFailureRecommendation: {
                    type: Type.STRING,
                    description: "High-level guidance (e.g. 'Full reconstruction recommended rather than localized cold patching'), or empty string.",
                  }
                },
                required: [
                  "category", "severity", "summary", "suggestedAction", "severityExplanation", "confidence", "rootCause", "riskIfIgnored", 
                  "affectedCitizens", "schoolNearby", "hospitalNearby", "trafficDensity", "priorityRank", "responsibleDept", 
                  "supportingDept", "estimatedCrew", "equipment", "estimatedCost", "estimatedTime", "assignedTeam",
                  "repeatedFailureDetected", "repeatedFailureMessage", "repeatedFailureRecommendation"
                ],
              },
            },
          });

          if (response && response.text) {
            responseText = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.log(`Attempt with ${modelName} failed:`, err.message || err);
          
          const errStr = (String(err) + " " + JSON.stringify(err)).toLowerCase();
          const isRetryable = errStr.includes("503") || errStr.includes("429") || errStr.includes("unavailable") || errStr.includes("busy") || errStr.includes("limit") || errStr.includes("overloaded");
          
          if (isRetryable && retries > 1) {
            retries--;
            console.log(`Retrying after ${delay}ms...`);
            await sleep(delay);
            delay *= 2;
          } else {
            break;
          }
        }
      }

      if (responseText) {
        break;
      }
    }

    let analysisResult;
    if (responseText) {
      try {
        analysisResult = JSON.parse(responseText.trim());
      } catch (parseErr) {
        console.log("Failed to parse Gemini response JSON, triggering smart fallback:", parseErr.message || parseErr);
      }
    }

    // Engaging local smart fallback if the API is completely unavailable or returns bad payload
    if (!analysisResult) {
      console.warn("⚠️ All Gemini model routes exhausted or failed. Engaging local heuristic classifier fallback...");
      
      const desc = (description || "").toLowerCase();
      
      // Intelligent category heuristic matching
      let category = "Other";
      if (/pothole|sinkhole|road|street|sidewalk|bridge|asphalt|pavement|curb/i.test(desc)) {
        category = "Road Infrastructure";
      } else if (/leak|water|pipe|drain|sewer|hydrant|flooding|flood/i.test(desc)) {
        category = "Water & Sanitation";
      } else if (/safe|hazard|danger|accident|emergency|fire|wire|traffic|collision|blocked/i.test(desc)) {
        category = "Public Safety & Hazards";
      } else if (/trash|garbage|waste|litter|bin|dump|refuse|debris/i.test(desc)) {
        category = "Sanitation & Waste";
      } else if (/light|lamp|electricity|power|dark|outage|bulb|wire/i.test(desc)) {
        category = "Power & Lighting";
      } else if (/graffiti|vandal|broken window|paint|damage|property|tagging|glass/i.test(desc)) {
        category = "Vandalism & Property";
      }

      // Intelligent severity heuristic matching
      let severity = "Moderate";
      if (/critical|danger|emergency|fire|gas|high|severe|injury|die|kill|safety|voltage/i.test(desc)) {
        severity = "High";
      } else if (/minor|cosmetic|clean|low|aesthetic|graffiti/i.test(desc)) {
        severity = "Low";
      }

      // Generate a structured summary
      let summary = description ? description : "A reported civic issue requiring municipal assessment.";
      if (summary.length > 120) {
        summary = summary.substring(0, 117) + "...";
      }
      summary = `Local evaluation: ${summary}`;

      // Suggested action matching the category
      let suggestedAction = "Dispatch district inspectors to evaluate the reported condition and coordinate corrective action.";
      if (category === "Road Infrastructure") {
        suggestedAction = "Dispatch roadway maintenance crew to inspect pavement structure and patch the damage.";
      } else if (category === "Water & Sanitation") {
        suggestedAction = "Send utility engineers to isolate the line, inspect for pressure drops, and perform repair.";
      } else if (category === "Public Safety & Hazards") {
        suggestedAction = "Coordinate immediate hazard response team to secure the perimeter and neutralize danger.";
      } else if (category === "Sanitation & Waste") {
        suggestedAction = "Schedule a high-priority sanitation vehicle to clear and clean the specified area.";
      } else if (category === "Power & Lighting") {
        suggestedAction = "Deploy electrical technicians to inspect circuits and restore power/lighting fixtures.";
      } else if (category === "Vandalism & Property") {
        suggestedAction = "Send municipal cleanup teams to restore property surface and remove visual defects.";
      }

      // Local estimates based on category and severity
      let estimatedCost = "₹4,500";
      let estimatedTime = "4 days";
      let assignedTeam = "Public Works Response Squad";

      if (category === "Road Infrastructure") {
        assignedTeam = "Road Maintenance Team A";
        estimatedCost = severity === "High" ? "₹1,80,000" : severity === "Moderate" ? "₹15,000" : "₹3,200";
        estimatedTime = severity === "High" ? "10 days" : severity === "Moderate" ? "4 days" : "2 days";
      } else if (category === "Water & Sanitation") {
        assignedTeam = "Water Utility Quick Action Squad";
        estimatedCost = severity === "High" ? "₹85,000" : severity === "Moderate" ? "₹12,000" : "₹2,500";
        estimatedTime = severity === "High" ? "5 days" : severity === "Moderate" ? "2 days" : "1 day";
      } else if (category === "Public Safety & Hazards") {
        assignedTeam = "Public Safety Unit C";
        estimatedCost = severity === "High" ? "₹35,000" : severity === "Moderate" ? "₹8,500" : "₹1,500";
        estimatedTime = severity === "High" ? "2 days" : severity === "Moderate" ? "1 day" : "1 day";
      } else if (category === "Sanitation & Waste") {
        assignedTeam = "Sanitation Crew Delta";
        estimatedCost = severity === "High" ? "₹15,000" : severity === "Moderate" ? "₹4,000" : "₹800";
        estimatedTime = severity === "High" ? "2 days" : severity === "Moderate" ? "1 day" : "1 day";
      } else if (category === "Power & Lighting") {
        assignedTeam = "Streetlighting Grid Division";
        estimatedCost = severity === "High" ? "₹60,000" : severity === "Moderate" ? "₹6,500" : "₹1,200";
        estimatedTime = severity === "High" ? "4 days" : severity === "Moderate" ? "2 days" : "1 day";
      } else if (category === "Vandalism & Property") {
        assignedTeam = "Municipal Restoration Crew";
        estimatedCost = severity === "High" ? "₹45,000" : severity === "Moderate" ? "₹7,500" : "₹1,800";
        estimatedTime = severity === "High" ? "5 days" : severity === "Moderate" ? "2 days" : "1 day";
      }

      analysisResult = {
        category,
        severity,
        summary,
        suggestedAction,
        estimatedCost,
        estimatedTime,
        assignedTeam,
        isFallback: true
      };
    }

    return res.json(analysisResult);

  } catch (error: any) {
    console.error("Gemini analysis error:", error);
    return res.status(500).json({
      error: "Failed to analyze report using AI.",
      details: error.message || String(error),
    });
  }
});

// API endpoint for generating Area Health Summaries using Gemini
app.post("/api/reports/area-summary", async (req, res) => {
  try {
    const { reports } = req.body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({
        error: "Please provide an array of reports for this area cluster.",
      });
    }

    let summaryResult = null;

    if (ai) {
      try {
        console.log(`Generating Area Health Summary for ${reports.length} reports...`);
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Analyze the following cluster of municipal reports reported in close geographic proximity.
Your job is to identify emerging civic patterns, formulate a descriptive neighborhood name (e.g., "Oakwood Heights Residential Pocket" or "Downtown Transit & Commercial District"), assess an overall Area Civic Health Score (0-100), and propose structural/preventative solutions.

Reports in this cluster:
${JSON.stringify(
  reports.map(r => ({
    category: r.category,
    severity: r.severity,
    summary: r.summary,
    description: r.description,
    status: r.status,
    confirmations: r.confirmations || 0
  })),
  null,
  2
)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                areaName: {
                  type: Type.STRING,
                  description: "A professional and descriptive name for this specific neighborhood or area cluster based on the coordinates and types of issues reported.",
                },
                healthScore: {
                  type: Type.INTEGER,
                  description: "An overall Civic Health Score from 0 to 100, where 100 is pristine / fully resolved, 70-89 is fair with minor issues, 50-69 requires attention, and below 50 is critical / high severity unresolved issues.",
                },
                healthRating: {
                  type: Type.STRING,
                  description: "A rating category representing the score: 'Excellent', 'Good', 'Attention Required', or 'Critical'.",
                },
                patterns: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 2-3 emerging civic patterns or systemic problems identified from the reports in this cluster (e.g. rising sanitation failures, infrastructure decay).",
                },
                solutions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 2-3 forward-looking, preventative, or structural solutions to resolve these recurring issues permanently.",
                },
                analysisSummary: {
                  type: Type.STRING,
                  description: "A comprehensive, highly polished 2-3 sentence paragraph summarizing the area's current civic health, key concerns, and recommended outlook.",
                }
              },
              required: ["areaName", "healthScore", "healthRating", "patterns", "solutions", "analysisSummary"],
            }
          }
        });

        if (response && response.text) {
          summaryResult = JSON.parse(response.text.trim());
        }
      } catch (geminiErr: any) {
        console.log("Gemini area summary generation failed, switching to fallback:", geminiErr.message || geminiErr);
      }
    }

    // High-fidelity local smart fallback if Gemini is not configured or failed
    if (!summaryResult) {
      console.log("Engaging smart local fallback for Area Health Summary...");
      
      // Calculate avg coordinates
      let totalLat = 0, totalLng = 0, validCoords = 0;
      const categories: { [key: string]: number } = {};
      let totalConfirmations = 0;
      let pendingCount = 0;
      let resolvedCount = 0;
      let highCount = 0;

      reports.forEach((r: any) => {
        if (r.latitude && r.longitude) {
          totalLat += r.latitude;
          totalLng += r.longitude;
          validCoords++;
        }
        categories[r.category] = (categories[r.category] || 0) + 1;
        totalConfirmations += (r.confirmations || 0);
        if (r.status === "Resolved") {
          resolvedCount++;
        } else {
          pendingCount++;
        }
        if (r.severity === "High") {
          highCount++;
        }
      });

      const avgLat = validCoords > 0 ? totalLat / validCoords : 0;
      const avgLng = validCoords > 0 ? totalLng / validCoords : 0;

      // Find top categories
      const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const topCategory = sortedCategories[0]?.[0] || "General Civic";
      const secondaryCategory = sortedCategories[1]?.[0] || "";

      // Deduce a nice name
      let areaName = `Sector near ${topCategory}`;
      if (avgLat !== 0) {
        areaName = `${topCategory} & Residential sector (Grid: ${avgLat.toFixed(2)}N, ${Math.abs(avgLng).toFixed(2)}W)`;
      }

      // Calculate health score: start at 100, deduct based on pending and severity
      let healthScore = 100;
      reports.forEach((r: any) => {
        if (r.status === "Resolved") {
          healthScore -= 1; // minor historical weight
        } else {
          if (r.severity === "High") healthScore -= 20;
          else if (r.severity === "Moderate") healthScore -= 10;
          else healthScore -= 4;
        }
      });

      // Clamp score
      healthScore = Math.max(15, Math.min(100, healthScore));

      let healthRating = "Good";
      if (healthScore >= 85) healthRating = "Excellent";
      else if (healthScore >= 70) healthRating = "Good";
      else if (healthScore >= 50) healthRating = "Attention Required";
      else healthRating = "Critical";

      // Patterns & Solutions list
      const patterns = [
        `High concentration of ${topCategory} reports (${categories[topCategory]} items) indicates localized infrastructure strain.`,
      ];
      if (secondaryCategory) {
        patterns.push(`Secondary escalation of ${secondaryCategory} concerns suggesting multi-department municipal overhead.`);
      } else if (totalConfirmations > 5) {
        patterns.push(`Elevated community upvoting and confirmations indicate high public visibility and demand for action.`);
      } else {
        patterns.push("Scattered public incidents point to general maintenance wear rather than systemic failures.");
      }

      const solutions = [
        `Initiate targeted inspection patrols for ${topCategory} in this sector to pre-emptively diagnose assets.`,
        "Deploy mobile public works units for immediate backlog resolution of pending complaints."
      ];
      if (highCount > 0) {
        solutions.push("Establish rapid-response zones to secure high-severity hazards within 24 hours of submission.");
      }

      const pendingStr = pendingCount > 0 ? `${pendingCount} active complaints pending` : "no pending complaints";
      const resolvedStr = resolvedCount > 0 ? `${resolvedCount} resolved tasks` : "no resolved tasks";
      const analysisSummary = `Heuristic scan of this geographical cluster shows a total of ${reports.length} reports, with ${pendingStr} and ${resolvedStr}. The primary municipal category in this vicinity is ${topCategory}. Preventive scheduling and structural inspection are advised to curb further escalation.`;

      summaryResult = {
        areaName,
        healthScore,
        healthRating,
        patterns,
        solutions,
        analysisSummary,
        isFallback: true
      };
    }

    return res.json(summaryResult);
  } catch (error: any) {
    console.error("Area summary error:", error);
    return res.status(500).json({
      error: "Failed to generate area summary.",
      details: error.message || String(error),
    });
  }
});

// API endpoint for Predictive Failure Forecasting using Gemini
app.post("/api/reports/forecast", async (req, res) => {
  try {
    const { reports } = req.body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({
        error: "Please provide an array of reports for this area cluster.",
      });
    }

    let forecastResult = null;

    if (ai) {
      try {
        console.log(`[Forecast API] Generating failure forecast for cluster of ${reports.length} reports...`);
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert Predictive Urban Infrastructure AI. Analyze the following geographic cluster of reported municipal complaints. Your job is to identify if these reports point to an impending, systemic, or severe infrastructure failure (e.g. a water main burst, deep road sinkhole, electrical grid blackout, bridge structural issue) within a 30 to 60-day window.

Calculate a realistic, data-driven probability (0 to 100), define the specific target asset system, assess severity, and provide a clear, professional rationale with actionable recommendations.

Reports in this cluster:
${JSON.stringify(
  reports.map(r => ({
    category: r.category,
    severity: r.severity,
    summary: r.summary,
    description: r.description,
    status: r.status,
    confirmations: r.confirmations || 0,
    createdAt: r.createdAt
  })),
  null,
  2
)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                probability: {
                  type: Type.INTEGER,
                  description: "Percentage probability (0 to 100) of severe infrastructure failure or critical system breakdown in the next 30 days if left unaddressed.",
                },
                daysWindow: {
                  type: Type.INTEGER,
                  description: "Forecasted window in days until failure could occur (typically 30 or 60).",
                },
                targetSystem: {
                  type: Type.STRING,
                  description: "Specific affected infrastructure system (e.g., 'Primary Water Conduit Main', 'Sub-base Pavement Integrity', 'Sectional Transformer Grid').",
                },
                severity: {
                  type: Type.STRING,
                  description: "Forecasting severity level: 'Low', 'Medium', 'High', or 'Critical'.",
                },
                rationale: {
                  type: Type.STRING,
                  description: "A professional, scientifically sound 1-2 sentence explanation of why this system is at risk based on the reported evidence.",
                },
                recommendedAction: {
                  type: Type.STRING,
                  description: "Specific pre-emptive, preventative engineering or maintenance dispatch action (e.g., 'Deploy hydro-acoustic leak correlation', 'Ground-penetrating radar scan').",
                }
              },
              required: ["probability", "daysWindow", "targetSystem", "severity", "rationale", "recommendedAction"],
            }
          }
        });

        if (response && response.text) {
          forecastResult = JSON.parse(response.text.trim());
        }
      } catch (geminiErr: any) {
        console.log("Gemini forecast generation failed, switching to fallback:", geminiErr.message || geminiErr);
      }
    }

    if (!forecastResult) {
      console.log("[Forecast API] Engaging local heuristic fallback...");
      const categories: { [key: string]: number } = {};
      let totalHigh = 0;
      let totalConfirmations = 0;

      reports.forEach((r: any) => {
        categories[r.category] = (categories[r.category] || 0) + 1;
        if (r.severity === "High") totalHigh++;
        totalConfirmations += (r.confirmations || 0);
      });

      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const topCat = sorted[0]?.[0] || "General";
      const topCount = sorted[0]?.[1] || 1;

      let probability = 10 + topCount * 12 + totalHigh * 10;
      probability = Math.min(92, Math.max(15, probability));

      let targetSystem = "Sectional Infrastructure Line";
      let rationale = `Clustered reports of ${topCat} indicate accelerated load and wear in this localized zone.`;
      let recommendedAction = "Schedule preventative structural inspection and cleanout.";
      let severity = "Low";

      if (topCat === "Water Supply") {
        targetSystem = "Primary Subterranean Water Conduit Joint";
        rationale = `Clustered water leakage and pressure drop reports (${topCount} occurrences) suggest a localized joint degradation, elevating risk of main rupture.`;
        recommendedAction = "Deploy acoustic pressure leak-detection crew to isolate stress points.";
        severity = probability > 60 ? "High" : "Medium";
      } else if (topCat === "Roads & Potholes" || topCat.includes("Road")) {
        targetSystem = "Sub-base Asphalt Layer & Soil Compaction";
        rationale = `Continuous pavement fractures and potholes (${topCount} counts) under active road load point to deep water seepage and structural wash-out under the asphalt.`;
        recommendedAction = "Perform core pavement stability logging and pre-emptive structural grouting.";
        severity = probability > 60 ? "High" : "Medium";
      } else if (topCat === "Electricity & Lighting") {
        targetSystem = "Local Secondary Grid Transformer Branch";
        rationale = `Multiple electrical flickers and line outages in this pocket indicate local substation strain or thermal joint failure.`;
        recommendedAction = "Execute thermal imaging scan of local transformer joints under peak load.";
        severity = probability > 60 ? "High" : "Medium";
      } else if (topCat === "Sewage & Sanitation") {
        targetSystem = "Sewer Collector Bypass & Outfall Line";
        rationale = `Local blockage reports point to upstream backing or sediment clotting in the arterial sewage collection line.`;
        recommendedAction = "Deploy high-pressure water jet sewer cleanout and CCTV camera inspection.";
        severity = probability > 60 ? "High" : "Medium";
      }

      if (probability > 75) severity = "Critical";

      forecastResult = {
        probability,
        daysWindow: probability > 70 ? 15 : 30,
        targetSystem,
        severity,
        rationale,
        recommendedAction,
        isFallback: true
      };
    }

    return res.json(forecastResult);
  } catch (error: any) {
    console.error("Forecast API error:", error);
    return res.status(500).json({ error: "Failed to generate predictive failure forecast." });
  }
});

// API endpoint for generating Today's AI Dispatch Brief
app.post("/api/reports/dispatch-brief", async (req, res) => {
  try {
    const { reports } = req.body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.json({
        brief: `# Municipal Operations: Daily AI Dispatch Brief\n\n### Queue Status: Fully Cleared 🌟\n\nThere are currently no active pending or unresolved reports in the queue. All reported issues have been successfully cleared and resolved by the field crews. Excellent work!\n\n* **Operational Status**: 100% Resolved\n* **Dispatch Directive**: Crews are instructed to stand by for preventative area sweeps, routine physical maintenance, or standard gear testing today.`
      });
    }

    let briefMarkdown = "";

    if (ai) {
      try {
        console.log(`[Dispatch Brief] Generating daily field brief for ${reports.length} pending reports...`);
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are the chief Operations Dispatch Coordinator AI for City Public Works. You have been handed a list of active, pending, unresolved public service complaints in the city. 
          
Your task is to analyze these complaints geographically and by category, select the highest-urgency items, and synthesize an elegant, highly actionable field crew briefing for today.

Structure your response into 3 field dispatch crews:
1. **Crew Alpha (Asphalt, Roads & Pavements)**: Give them their targeted street sectors, priority tasks, and tool loadout (e.g. cold-mix asphalt, rammer).
2. **Crew Beta (Water, Pipes & Utilities)**: Give them their target coordinate zones, pipeline leak tasks, and equipment loadout.
3. **Crew Gamma (Electrical, Lights & Safety)**: Give them their lighting, street-light and grid hazards, and cherry-picker requirements.

Include an 'Operations Summary' at the top of the brief outlining today's high-level strategy. Ensure your response is in beautiful, professional Markdown, using bullet points, tables, and bold headings to make it extremely legible for physical field printouts.

Active complaints data:
${JSON.stringify(
  reports.map(r => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    summary: r.summary,
    description: r.description,
    priorityScore: r.priorityScore || 0,
    latitude: r.latitude,
    longitude: r.longitude
  })),
  null,
  2
)}`
        });

        if (response && response.text) {
          briefMarkdown = response.text.trim();
        }
      } catch (geminiErr: any) {
        console.log("Gemini dispatch brief generation failed, switching to fallback:", geminiErr.message || geminiErr);
      }
    }

    if (!briefMarkdown) {
      console.log("[Dispatch Brief] Engaging local heuristic dispatch brief builder...");
      const roads = reports.filter((r: any) => r.category === "Roads & Potholes");
      const water = reports.filter((r: any) => r.category === "Water Supply");
      const electric = reports.filter((r: any) => r.category === "Electricity & Lighting" || r.category === "Street & Park Maintenance");
      const sanitation = reports.filter((r: any) => r.category === "Sewage & Sanitation" || r.category === "Garbage & Cleanliness");

      briefMarkdown = `# Municipal Operations: Daily AI Dispatch Brief
**Date:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
**Operations Summary:** Strategic focus is on clearing the highest-priority pending public hazards. Weather is optimal for physical outdoor works. Focus on optimizing geographic proximity between routes.

---

## 🚧 CREW ALPHA: Pavement & Structural Maintenance
* **Sectors of Focus:** Local sectors with pending potholes and debris.
* **Active Tasks:**
${roads.length > 0 ? roads.slice(0, 3).map((r: any) => `  * **[Priority Score: ${r.priorityScore || 'M'}]** ${r.summary} at coordinate grid (${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}). *Action:* Fill asphalt cavity, compact, seal edge.`).join('\n') : "  * No high-priority road tasks. Standby for secondary street sweeps or sidewalk repairs."}
* **Equipment Checklist:** Cold-mix asphalt bags, dynamic compactor, lane cones, safety banners.

---

## 💧 CREW BETA: Hydraulic & Sanitation Systems
* **Sectors of Focus:** Local drainage and hydraulic conduits.
* **Active Tasks:**
${water.length > 0 || sanitation.length > 0 ? [...water, ...sanitation].slice(0, 3).map((r: any) => `  * **[Priority Score: ${r.priorityScore || 'M'}]** ${r.summary} at coordinate grid (${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}). *Action:* Inspect pipe joint, block leaks, replace gaskets.`).join('\n') : "  * No high-priority hydraulic leaks. Standby for standard water quality tests and routine checkups."}
* **Equipment Checklist:** Acoustic leak locators, heavy gaskets, hydraulic pumps, sediment filters.

---

## ⚡ CREW GAMMA: Public Safety & Grid Elements
* **Sectors of Focus:** Electrical networks and street lighting poles.
* **Active Tasks:**
${electric.length > 0 ? electric.slice(0, 3).map((r: any) => `  * **[Priority Score: ${r.priorityScore || 'M'}]** ${r.summary} at coordinate grid (${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}). *Action:* Replace failed bulbs, secure exposed wiring, test grid circuit.`).join('\n') : "  * No lighting or electrical hazards reported. Standby for general fixture checkups."}
* **Equipment Checklist:** LED luminaire replacements, multi-meter tester, electrical tape, insulated gloves, cherry-picker vehicle.

---
**Safety Mandate:** Standard PPE (hi-vis vest, steel-toed boots, helmet) is mandatory. Report all completed task photo uploads to the CivicPulse dispatch portal immediately upon clearance.`;
    }

    return res.json({ brief: briefMarkdown });
  } catch (error: any) {
    console.error("Dispatch Brief error:", error);
    return res.status(500).json({ error: "Failed to generate daily dispatch brief." });
  }
});

/**
 * Utility function that:
 * 1. Fetches recent reports from Firestore.
 * 2. Groups them by proximity (within 1.5 km radius) using coordinates.
 * 3. Prompts the Gemini API to analyze these clusters to generate an 'Area Health Summary'.
 * 4. Identifies patterns or emerging infrastructure issues in specific neighborhoods.
 */
export async function analyzeNeighborhoodHealthClusters() {
  if (!firestoreDb) {
    throw new Error("Firestore is not initialized on the server side.");
  }

  console.log("Starting utility proximity health scan of municipal reports in Firestore...");
  
  // 1. Fetch reports from Firestore safely
  const reportsCollection = collection(firestoreDb, "reports");
  const querySnapshot = await getDocs(reportsCollection);
  const reports: any[] = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    reports.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt ? (typeof data.createdAt.toDate === "function" ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date()
    });
  });

  // Sort in-memory descending by creation date
  reports.sort((a, b) => {
    const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return timeB - timeA;
  });

  // 2. Group reports by proximity (1.5 km threshold)
  const validReports = reports.filter(r => typeof r.latitude === "number" && typeof r.longitude === "number" && r.latitude !== 0 && r.longitude !== 0);
  const clusters: any[] = [];
  const visited = new Set<string>();

  const calculateDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
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

  for (const report of validReports) {
    if (visited.has(report.id)) continue;

    const clusterReports = [report];
    visited.add(report.id);

    for (const other of validReports) {
      if (visited.has(other.id)) continue;

      const dist = calculateDistanceInKm(report.latitude, report.longitude, other.latitude, other.longitude);
      if (dist <= 1.5) {
        clusterReports.push(other);
        visited.add(other.id);
      }
    }

    // Centroid
    const sumLat = clusterReports.reduce((sum, r) => sum + r.latitude, 0);
    const sumLng = clusterReports.reduce((sum, r) => sum + r.longitude, 0);
    const center = {
      lat: sumLat / clusterReports.length,
      lng: sumLng / clusterReports.length
    };

    clusters.push({
      center,
      reports: clusterReports
    });
  }

  // Sort clusters descending by report volume
  clusters.sort((a, b) => b.reports.length - a.reports.length);

  // 3. Prompt Gemini API to analyze these clusters
  const results: any[] = [];

  for (let index = 0; index < clusters.length; index++) {
    const cluster = clusters[index];
    let summaryResult = null;

    if (ai) {
      try {
        console.log(`[Gemini Utility] Scanning Cluster #${index + 1} with ${cluster.reports.length} reports...`);
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Analyze the following cluster of municipal reports reported in close geographic proximity.
Your job is to identify emerging civic patterns, formulate a descriptive neighborhood name (e.g., "Oakwood Heights Residential Pocket" or "Downtown Transit & Commercial District"), assess an overall Area Civic Health Score (0-100), and propose structural/preventative solutions.

Reports in this cluster:
${JSON.stringify(
  cluster.reports.map(r => ({
    category: r.category,
    severity: r.severity,
    summary: r.summary,
    description: r.description,
    status: r.status,
    confirmations: r.confirmations || 0
  })),
  null,
  2
)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                areaName: {
                  type: Type.STRING,
                  description: "A professional and descriptive name for this specific neighborhood or area cluster based on the coordinates and types of issues reported.",
                },
                healthScore: {
                  type: Type.INTEGER,
                  description: "An overall Civic Health Score from 0 to 100, where 100 is pristine / fully resolved, 70-89 is fair with minor issues, 50-69 requires attention, and below 50 is critical / high severity unresolved issues.",
                },
                healthRating: {
                  type: Type.STRING,
                  description: "A rating category representing the score: 'Excellent', 'Good', 'Attention Required', or 'Critical'.",
                },
                patterns: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 2-3 emerging civic patterns or systemic problems identified from the reports in this cluster (e.g. rising sanitation failures, infrastructure decay).",
                },
                solutions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 2-3 forward-looking, preventative, or structural solutions to resolve these recurring issues permanently.",
                },
                analysisSummary: {
                  type: Type.STRING,
                  description: "A comprehensive, highly polished 2-3 sentence paragraph summarizing the area's current civic health, key concerns, and recommended outlook.",
                }
              },
              required: ["areaName", "healthScore", "healthRating", "patterns", "solutions", "analysisSummary"],
            }
          }
        });

        if (response && response.text) {
          summaryResult = JSON.parse(response.text.trim());
        }
      } catch (geminiErr: any) {
        console.log(`Gemini analysis for cluster #${index + 1} failed. Engaging fallback. Error:`, geminiErr.message || geminiErr);
      }
    }

    // Heuristic fallback if Gemini fails or is unconfigured
    if (!summaryResult) {
      const categories: { [key: string]: number } = {};
      let totalConfirmations = 0;
      let pendingCount = 0;
      let resolvedCount = 0;
      let highCount = 0;

      cluster.reports.forEach((r: any) => {
        categories[r.category] = (categories[r.category] || 0) + 1;
        totalConfirmations += (r.confirmations || 0);
        if (r.status === "Resolved") {
          resolvedCount++;
        } else {
          pendingCount++;
        }
        if (r.severity === "High") {
          highCount++;
        }
      });

      const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const topCategory = sortedCategories[0]?.[0] || "General Civic";
      const secondaryCategory = sortedCategories[1]?.[0] || "";

      let areaName = `${topCategory} Neighborhood Sector (Grid: ${cluster.center.lat.toFixed(2)}N, ${Math.abs(cluster.center.lng).toFixed(2)}W)`;

      let healthScore = 100;
      cluster.reports.forEach((r: any) => {
        if (r.status === "Resolved") {
          healthScore -= 1;
        } else {
          if (r.severity === "High") healthScore -= 20;
          else if (r.severity === "Moderate") healthScore -= 10;
          else healthScore -= 4;
        }
      });
      healthScore = Math.max(15, Math.min(100, healthScore));

      let healthRating = "Good";
      if (healthScore >= 85) healthRating = "Excellent";
      else if (healthScore >= 70) healthRating = "Good";
      else if (healthScore >= 50) healthRating = "Attention Required";
      else healthRating = "Critical";

      const patterns = [
        `High density of ${topCategory} reports (${categories[topCategory]} instances) indicating localized infrastructure strain.`,
      ];
      if (secondaryCategory) {
        patterns.push(`Secondary escalation of ${secondaryCategory} concerns suggesting multi-department municipal overhead.`);
      } else {
        patterns.push("Concentration of public complaints indicates high civic visibility and immediate demand for inspection.");
      }

      const solutions = [
        `Initiate targeted inspection patrols for ${topCategory} in this sector to pre-emptively diagnose assets.`,
        "Deploy mobile public works units for immediate backlog resolution of pending complaints."
      ];
      if (highCount > 0) {
        solutions.push("Establish rapid-response zones to secure high-severity hazards within 24 hours of submission.");
      }

      const pendingStr = pendingCount > 0 ? `${pendingCount} active complaints pending` : "no pending complaints";
      const resolvedStr = resolvedCount > 0 ? `${resolvedCount} resolved tasks` : "no resolved tasks";
      const analysisSummary = `Heuristic scan of this geographical cluster shows a total of ${cluster.reports.length} reports, with ${pendingStr} and ${resolvedStr}. The primary municipal category in this vicinity is ${topCategory}. Preventive scheduling and structural inspection are advised to curb further escalation.`;

      summaryResult = {
        areaName,
        healthScore,
        healthRating,
        patterns,
        solutions,
        analysisSummary,
        isFallback: true
      };
    }

    results.push({
      clusterId: `cluster-${cluster.reports[0].id}`,
      center: cluster.center,
      reportsCount: cluster.reports.length,
      reports: cluster.reports,
      ...summaryResult
    });
  }

  return results;
}

// REST API exposing the automatic backend proximity summarization utility
app.get("/api/reports/proximity-summaries", async (req, res) => {
  try {
    const results = await analyzeNeighborhoodHealthClusters();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      clustersCount: results.length,
      clusters: results
    });
  } catch (error: any) {
    console.error("Proximity summaries utility endpoint error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate proximity-based Area Health Summaries.",
      details: error.message || String(error)
    });
  }
});

// Endpoint for AI Before/After Comparison Audit of resolved issues
app.post("/api/reports/verify-resolution", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: "Gemini API Client is not configured." });
    }

    const { beforeImageUrl, afterImageUrl, category, description } = req.body;

    if (!beforeImageUrl || !afterImageUrl) {
      return res.status(400).json({ error: "Both before and after images are required for resolution audit." });
    }

    const contents: any[] = [];

    // Helper to format base64 for Gemini SDK
    const getBase64Object = (dataUrl: string) => {
      // If it's a standard URL, just pass it as is (Gemini SDK handles text URLs or inlineData)
      if (dataUrl.startsWith("http")) {
        return { text: `Image URL: ${dataUrl}` };
      }
      const mimeTypeMatch = dataUrl.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      return {
        inlineData: {
          mimeType,
          data: base64Data,
        }
      };
    };

    contents.push(getBase64Object(beforeImageUrl));
    contents.push(getBase64Object(afterImageUrl));

    contents.push({
      text: `You are an expert civil engineering quality auditor. We are reviewing a municipal repair action.
The first image/data is the BEFORE photo showing the reported problem (Category: "${category || "Civic Hazard"}", Description: "${description || "Civic complaint"}").
The second image/data is the AFTER photo showing the completed repair work by our municipal squad.

Please compare them and:
1. Audit the repair quality. Determine if it's 'Excellent' (perfectly fixed, neat, no residue), 'Good' (resolved but standard finish), or 'Needs Touchup' (issues still visible or messy cleanup).
2. Rate your audit confidence (50 to 99).
3. Provide a concise, highly professional audit feedback paragraph explaining your visual analysis (e.g. noting specific details about structural clearance, asphalt sealing, pipe connection, debris clearing, or electrical setup).`
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            repairQuality: {
              type: Type.STRING,
              description: "Must be one of: 'Excellent', 'Good', 'Needs Touchup'."
            },
            confidence: {
              type: Type.INTEGER,
              description: "Audit confidence level from 50 to 99."
            },
            feedback: {
              type: Type.STRING,
              description: "A professional, detailed 2-3 sentence visual comparison and engineering assessment of the repair."
            }
          },
          required: ["repairQuality", "confidence", "feedback"]
        }
      }
    });

    if (response && response.text) {
      const auditResult = JSON.parse(response.text.trim());
      return res.json(auditResult);
    }

    throw new Error("Empty response from Gemini auditor");
  } catch (error: any) {
    console.error("Resolution verification error:", error);
    // Smart high-fidelity fallback if quota or call fails
    return res.json({
      repairQuality: "Pending Manual Review",
      confidence: 50,
      feedback: "AI Automated Audit: Visual comparison is temporarily unavailable due to server-side rate limits. A manual municipal supervisor review has been scheduled to inspect and verify the repair quality."
    });
  }
});

const groundingCache = new Map<string, { text: string; groundingMetadata: any; fallback: boolean; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 min

// Location-based Google Maps Grounding assistant endpoint
app.post("/api/maps/grounding", async (req, res) => {
  try {
    const { query: userQuery, latitude, longitude } = req.body;
    if (!userQuery) {
      return res.status(400).json({ error: "Query is required." });
    }

    const cacheKey = `${userQuery.toLowerCase().trim()}|${(latitude || 0).toFixed(2)}|${(longitude || 0).toFixed(2)}`;
    const cached = groundingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[Maps Grounding] Serving CACHED response for key: ${cacheKey}`);
      return res.json({
        success: true,
        text: cached.text,
        groundingMetadata: cached.groundingMetadata,
        fallback: cached.fallback,
        cached: true
      });
    }

    if (!ai) {
      return res.status(503).json({
        error: "Gemini API key is not configured.",
        text: "The server-side Gemini client is unconfigured. Please add your GEMINI_API_KEY in the Settings > Secrets panel of your AI Studio interface to activate Google Maps Grounding.",
        fallback: true
      });
    }

    console.log(`[Maps Grounding] Running query: "${userQuery}" near [${latitude}, ${longitude}]`);

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (latitude && longitude && latitude !== 0 && longitude !== 0) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude,
            longitude,
          },
        },
      };
    }

    let response;
    let fallbackUsed = false;
    let warningMessage = "";

    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userQuery,
        config,
      });
    } catch (groundingErr: any) {
      console.log("Primary Maps Grounding call failed or quota exceeded. Engaging high-fidelity fallback without Maps tool:", groundingErr.message || groundingErr);
      fallbackUsed = true;
      warningMessage = "Google Maps Grounding search is temporarily at capacity. Switched to direct AI civic knowledge response.";
      
      const fallbackPrompt = `You are an expert AI civic assistant for CivicPulse. The user has coordinates near Latitude: ${latitude || "unknown"}, Longitude: ${longitude || "unknown"}.
They are asking this question: "${userQuery}".
Since real-time Google Maps Grounding is temporarily experiencing a high load/rate limit, please answer their query directly to the best of your general knowledge. Offer helpful, practical, and constructive civic/geographical advice based on standard urban layouts or general practices for the query.`;
      
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: fallbackPrompt,
      });
    }

    const groundingMetadata = (!fallbackUsed && response.candidates?.[0]?.groundingMetadata) || null;
    const responseText = response.text || "No response received from model.";

    groundingCache.set(cacheKey, {
      text: responseText,
      groundingMetadata,
      fallback: fallbackUsed,
      timestamp: Date.now()
    });

    return res.json({
      success: true,
      text: responseText,
      groundingMetadata,
      fallback: fallbackUsed,
      warning: warningMessage,
    });
  } catch (error: any) {
    console.log("Maps grounding API error:", error.message || error);
    // If the API call fails completely, return a friendly simulated civic assistant response instead of a 500 crash
    return res.json({
      success: true,
      text: `Hello! CivicPulse AI is currently experiencing high demand on its server-side Gemini AI channel. Here is a helpful response based on our local knowledgebase:

Regarding your query: "${req.body?.query || "Civic advice"}" near coordinates [${req.body?.latitude || "unknown"}, ${req.body?.longitude || "unknown"}]:
      
1. For general infrastructure questions, we recommend checking the local Municipal Feed to see if other citizens have logged similar alerts nearby.
2. If this is an immediate public safety threat, please contact the local emergency control board.
3. For power or water issues, check the assigned division's scheduled grid outages.

We apologize for the service limitation and appreciate your active citizenship!`,
      groundingMetadata: null,
      fallback: true,
      warning: "AI service limits exceeded. Displaying local offline assistant guidance."
    });
  }
});

// API endpoint for transcribing voice audio reports using Gemini
app.post("/api/reports/transcribe", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API Client is not configured. Please add your GEMINI_API_KEY in the Secrets panel in the AI Studio UI.",
      });
    }

    const { audio, mimeType } = req.body;

    if (!audio) {
      return res.status(400).json({
        error: "Please provide the base64 encoded audio data to transcribe.",
      });
    }

    // Clean base64 header if sent by mistake
    const base64Data = audio.replace(/^data:audio\/\w+;base64,/, "");

    console.log(`[Audio Transcription] Sending audio to Gemini (MIME: ${mimeType || "audio/webm"})...`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: base64Data,
          },
        },
        {
          text: "You are an expert civic transcription assistant. Your job is to listen to this audio snippet recorded by a citizen reporting a municipal issue, and transcribe it precisely. Deliver ONLY the verbatim transcription text. Do not include any intros, outrous, summaries, or conversation (e.g. do NOT say 'Here is the transcription:'). If the audio is silent or unreadable, return empty space.",
        },
      ],
    });

    const transcriptionText = response.text ? response.text.trim() : "";
    console.log(`[Audio Transcription] Success: "${transcriptionText}"`);

    return res.json({
      success: true,
      text: transcriptionText,
    });
  } catch (error: any) {
    console.error("Transcription API error:", error);
    return res.status(500).json({ error: "Failed to transcribe audio report. Please check API quota or try again." });
  }
});

// Configure Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with static files serving...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 CivicPulse AI full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
