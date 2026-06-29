import { Timestamp } from "firebase/firestore";

export type SeverityType = "Low" | "Moderate" | "High";
export type StatusType = "Pending" | "Verified" | "Assigned" | "In Progress" | "Resolved";

export interface Report {
  id: string;
  category: string;
  severity: SeverityType;
  summary: string;
  description: string;
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
  status: StatusType;
  confirmations: number;
  createdAt: Timestamp;
  suggestedAction: string;
  priorityScore?: number; // Calculated field for UI sorting
  reporterId?: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterPhoto?: string;
  assignedTo?: string;
  assignedTeam?: string;
  beforeImageUrl?: string | null;
  afterImageUrl?: string | null;
  estimatedCost?: string;
  estimatedTime?: string;
  progressStage?: "Reported" | "Verified" | "Assigned" | "Repair Started" | "Resolved";
  duplicateOfId?: string;
  resolvedAt?: string | null;
  audioTranscript?: string;
  videoUrl?: string;
  imageMimeType?: string;
}

export interface AnalysisResult {
  category: string;
  severity: SeverityType;
  summary: string;
  suggestedAction: string;
}
