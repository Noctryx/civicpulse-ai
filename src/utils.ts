import { Report } from "./types";

export interface CivicIntelligence {
  severityExplanation: string;
  confidence: number;
  rootCause: string;
  riskIfIgnored: string;
  affectedCitizens: string;
  schoolNearby: boolean;
  hospitalNearby: boolean;
  trafficDensity: "Low" | "Medium" | "High";
  priorityRank: number;
  responsibleDept: string;
  supportingDept: string;
  estimatedCrew: string;
  equipment: string;
  repeatedFailureDetected: boolean;
  repeatedFailureMessage: string;
  repeatedFailureRecommendation: string;
}

export function getReportCivicIntelligence(report: Report): CivicIntelligence {
  const d = report as any;
  
  // Construct fallback values based on category & severity
  let severityExplanation = d.severityExplanation || "";
  if (!severityExplanation) {
    if (report.severity === "High") {
      severityExplanation = "• Critical safety hazard to pedestrian and vehicle flow\n• Active risk of structural escalation\n• Positioned in a high-density urban corridor";
    } else if (report.severity === "Moderate") {
      severityExplanation = "• Standard physical wear requiring correction\n• Intermittent impact on local service pathways\n• No immediate safety threat detected";
    } else {
      severityExplanation = "• Cosmetic or low-impact surface wear\n• Serves as minor operational or aesthetic improvement\n• Easily handled by scheduled maintenance rotations";
    }
  }

  let rootCause = d.rootCause || "";
  if (!rootCause) {
    if (report.category === "Road Infrastructure") rootCause = "Thermal expansion of concrete and heavy axle cargo wear";
    else if (report.category === "Water & Sanitation") rootCause = "Corrosion of localized branch fittings and minor pressure surge";
    else if (report.category === "Public Safety & Hazards") rootCause = "External vehicle impact or environmental weathering";
    else if (report.category === "Sanitation & Waste") rootCause = "Unauthorized container overflow and lack of central surveillance";
    else if (report.category === "Power & Lighting") rootCause = "Moisture ingress in junction terminals or bulb burnout";
    else if (report.category === "Vandalism & Property") rootCause = "Unauthorized activity on public surfaces";
    else rootCause = "General urban degradation of material surfaces";
  }

  let riskIfIgnored = d.riskIfIgnored || "";
  if (!riskIfIgnored) {
    if (report.category === "Road Infrastructure") riskIfIgnored = "Puncture of vehicle suspensions and localized traffic gridlocks";
    else if (report.category === "Water & Sanitation") riskIfIgnored = "Erosion of subterranean soil base causing localized sinkholes";
    else if (report.category === "Public Safety & Hazards") riskIfIgnored = "Pedestrian tripping incidents or emergency vehicle delays";
    else if (report.category === "Sanitation & Waste") riskIfIgnored = "Vector-borne pest attraction and bad chemical odor spreading";
    else if (report.category === "Power & Lighting") riskIfIgnored = "High-risk dark zones facilitating security violations or accidents";
    else if (report.category === "Vandalism & Property") riskIfIgnored = "Decline in community aesthetic pride and business footfalls";
    else riskIfIgnored = "Minor escalation of repair complexity and budget";
  }

  let affectedCitizens = d.affectedCitizens || "";
  if (!affectedCitizens) {
    affectedCitizens = report.severity === "High" ? "350 - 500" : report.severity === "Moderate" ? "120 - 250" : "20 - 60";
  }

  let schoolNearby = d.schoolNearby !== undefined ? d.schoolNearby : (report.severity === "High" ? true : false);
  let hospitalNearby = d.hospitalNearby !== undefined ? d.hospitalNearby : (report.category === "Public Safety & Hazards" ? true : false);
  let trafficDensity = d.trafficDensity || (report.severity === "High" ? "High" : report.severity === "Moderate" ? "Medium" : "Low");
  
  let priorityRank = d.priorityRank || (
    report.severity === "High" ? 88 : report.severity === "Moderate" ? 64 : 32
  );
  // Factor in confirmations
  priorityRank = Math.min(100, priorityRank + (report.confirmations || 0) * 5);

  let responsibleDept = d.responsibleDept || "";
  if (!responsibleDept) {
    if (report.category === "Road Infrastructure") responsibleDept = "Department of Roads & Pavements";
    else if (report.category === "Water & Sanitation") responsibleDept = "Water Supply & Sewerage Board";
    else if (report.category === "Public Safety & Hazards") responsibleDept = "Civil Protection & Public Safety Division";
    else if (report.category === "Sanitation & Waste") responsibleDept = "Urban Health & Waste Management Board";
    else if (report.category === "Power & Lighting") responsibleDept = "Municipal Power Grid Corporation";
    else if (report.category === "Vandalism & Property") responsibleDept = "Community Beautification & Asset Care";
    else responsibleDept = "Public Works Response Squad";
  }

  let supportingDept = d.supportingDept || (report.severity === "High" ? "Traffic Safety Department" : "None");
  let estimatedCrew = d.estimatedCrew || (report.severity === "High" ? "4 workers (including structural engineer)" : "2 workers");
  let equipment = d.equipment || "";
  if (!equipment) {
    if (report.category === "Road Infrastructure") equipment = "Bituminous patch mix and hand-operated roller";
    else if (report.category === "Water & Sanitation") equipment = "High-pressure pipe cutter and trench shoring jacks";
    else if (report.category === "Public Safety & Hazards") equipment = "Bollard replacement rig and caution barricades";
    else if (report.category === "Sanitation & Waste") equipment = "Compactor garbage truck and specialized wash lance";
    else if (report.category === "Power & Lighting") equipment = "JLG boom lift vehicle and insulated voltage testers";
    else if (report.category === "Vandalism & Property") equipment = "Industrial pressure sandblaster and matching coat paint";
    else equipment = "Standard tools and municipal response van";
  }

  // Handle nested object structure from database and potential spelling variants
  const repeatedFailureDetected = d.repeatedFailureDetected === true || (d.repeatedFailure && d.repeatedFailure.detected === true);
  const repeatedFailureMessage = d.repeatedFailureMessage || (d.repeatedFailure && d.repeatedFailure.message) || "";
  const repeatedFailureRecommendation = d.repeatedFailureRecommendation || (d.repeatedFailure && d.repeatedFailure.recommendation) || "";

  return {
    severityExplanation,
    confidence: d.confidence || 94,
    rootCause,
    riskIfIgnored,
    affectedCitizens,
    schoolNearby,
    hospitalNearby,
    trafficDensity,
    priorityRank,
    responsibleDept,
    supportingDept,
    estimatedCrew,
    equipment,
    repeatedFailureDetected,
    repeatedFailureMessage,
    repeatedFailureRecommendation,
  };
}

/**
 * Compresses an image data URL (Base64) to a lightweight JPEG.
 * Reduces the width/height to fit within the specified bounds and applies JPEG quality compression.
 */
export function compressImage(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve) => {
    // Check if it is a valid data URL
    if (!base64Str || !base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions to maintain aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as jpeg with 0.6 quality for safe, lightweight storage
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      } catch (err) {
        console.error("Error compressing image on canvas:", err);
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

/**
 * Extracts a thumbnail from the first 0.5s frame of a video File.
 * Compresses it to a lightweight JPEG data URL.
 */
export function getVideoThumbnail(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.preload = "auto";
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;

      const fileURL = URL.createObjectURL(file);
      video.src = fileURL;

      // Ensure we clean up the object URL even if something fails
      const cleanup = () => {
        try {
          URL.revokeObjectURL(fileURL);
        } catch (e) {}
      };

      video.onloadeddata = () => {
        // Seek to 0.5s to capture a meaningful visual frame (avoiding pure black frames)
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          let width = video.videoWidth;
          let height = video.videoHeight;

          if (!width || !height) {
            cleanup();
            resolve("");
            return;
          }

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const thumbnail = canvas.toDataURL("image/jpeg", quality);
            cleanup();
            resolve(thumbnail);
          } else {
            cleanup();
            resolve("");
          }
        } catch (err) {
          console.error("Error capturing video frame:", err);
          cleanup();
          resolve("");
        }
      };

      video.onerror = () => {
        console.error("Error loading video element for thumbnail");
        cleanup();
        resolve("");
      };
    } catch (outerErr) {
      console.error("Error during getVideoThumbnail initialization:", outerErr);
      resolve("");
    }
  });
}

