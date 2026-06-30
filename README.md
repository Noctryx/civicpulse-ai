# CivicPulse AI 🏙️
### Intelligent Urban Governance Platform

> Built for VIBE2SHIP Hackathon · Problem Statement 2: Community Hero

**CivicPulse AI** turns a citizen's spoken complaint into an autonomous municipal action — classifying the issue, assigning the right crew, detecting systemic failures, and dispatching escalation alerts without any human administrator pressing a button.

🔗 **Live Demo:** [https://ai.studio/apps/19ea99b1-ecf0-4c28-ae07-4ceb923079a3](https://civicpulse-ai-1092231268712.asia-southeast1.run.app)

---

## What It Does

Citizens report civic issues (potholes, broken streetlights, water leakages, waste) through **six input modalities** — text, image upload, live camera capture, video recording, voice transcription, or directly from Google Drive *(see OAuth note below)*. The moment a report is submitted:

1. **Gemini AI analyzes** the image/video/voice, classifies the issue, assesses severity, estimates repair cost and time, and autonomously assigns the correct municipal crew
2. **City Memory** cross-references the location against historical reports — flagging systemic infrastructure failures, not just one-off complaints
3. **Autonomous Escalation** fires immediately if the report is High severity at a previously failed location — writing directly to the admin alert console with no human input
4. **Background Agent** runs every 60 seconds, independently scanning for spatial clusters of 3+ unresolved High-severity reports within 300m and creating Hazard Cluster alerts autonomously
5. **Push Notifications** via Firebase Cloud Messaging notify the original reporter the moment their issue is resolved by the municipality

---

## Key Features

| Feature | Description |
|---|---|
| 🎤 Voice Reporting | Speak a complaint in Indian English — Gemini 2.5 Flash transcribes and classifies it |
| 📷 Live Camera Capture | Citizens can take photos or record videos directly from their device camera via browser |
| 📁 Google Drive Upload | Citizens can select issue photos/videos directly from Google Drive *(restricted to approved test users pending Google OAuth verification — see note below)* |
| 🤖 AI Issue Analysis | Multimodal analysis via Gemini 3.5 Flash — category, severity, cost estimate, crew assignment |
| 🧠 City Memory | Detects repeat failures at the same location — identifies systemic infrastructure decay |
| ⚡ Autonomous Agent | Background server loop fires escalation alerts every 60s without user action |
| 🔔 Push Notifications | FCM push alerts sent to the reporter when their issue is resolved |
| 📊 Predictive Forecasting | 30–60 day infrastructure failure probability per neighbourhood cluster |
| 📋 Daily Dispatch Brief | Gemini 2.5 Flash generates structured field crew briefings on demand |
| 🗺️ Google Maps Integration | Real-time incident map with severity-coded markers and satellite view |
| 🤝 City Guide Assistant | Google Maps Grounded AI — verified local facility and service queries |
| 🏆 Civic Leaderboard | Gamified contribution scoring with 4 citizen levels and community rankings |
| 🔍 AI Journey Trace | Full audit log of every AI decision made per report |
| ✅ Citizen Closure Loop | Reporter sees a personal resolution banner + push notification when issue is fixed |
| ⏱️ SLA Breach Tracking | Flags unresolved reports past 7-day threshold in the admin panel |
| 💀 Skeleton Loading States | Shimmer placeholders on feed cards and leaderboard during data load |

---

## Tech Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, Framer Motion, Recharts

**Backend:** Node.js, Express.js, TypeScript

**AI:** Gemini 2.5 Flash (forecasting, dispatch brief, voice transcription), Gemini 3.5 Flash (image/video analysis, resolution audit, city assistant)

**Google Technologies:** Firebase Firestore, Firebase Auth, Firebase Storage, Firebase Cloud Messaging (FCM), Google Maps Platform, Google Drive Picker API, Gemini Maps Grounding Tool, Google AI Studio

---

## Architecture

```
Citizen Input (text / image / video / voice / Google Drive)
        ↓
Gemini Analysis Pipeline (3.5 Flash / 2.5 Flash)
        ↓
Auto-classification → Auto-assignment → City Memory Check
        ↓                                      ↓
Firestore Write                    Autonomous Alert (if repeat failure)
        ↓
Background Agent (60s loop) → Spatial Cluster Detection → Hazard Alert
        ↓
Admin Console (live onSnapshot) → Dispatch Brief → Field Crew
        ↓
5-Stage Lifecycle → FCM Push Notification → Citizen Resolution Banner
```

---

## ⚠️ Google Drive Access — Important Note for Evaluators

The Google Drive file picker feature is fully implemented and functional, but is currently restricted to **approved test users only**. This is because the application uses Google OAuth scopes (`drive.file` and `drive.metadata.readonly`) that require Google to complete its **OAuth app verification and branding review** before the feature can be made publicly available to all users.

This is a standard Google policy for apps requesting Drive access — it is not a code limitation. The verification process requires submitting the app for Google's security review, which is pending completion.

**What evaluators can test:** All other features — text input, image upload, live camera capture, video recording, voice transcription, AI analysis, Maps Grounding, FCM notifications, and all admin features — are fully accessible without restriction.

**What approved test users can access:** The complete Google Drive picker integration, including OAuth authentication, file selection, and analysis pipeline.

The Google Drive Picker API integration code is fully present in `src/components/ReportForm.tsx` and can be verified in the repository.

---

## Run Locally

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Add your keys to .env.local

# Run the development server
npm run dev
```

**Required environment variables:**
```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_PLATFORM_KEY=your_google_maps_api_key
FIREBASE_SERVICE_ACCOUNT=your_firebase_admin_sdk_json
VITE_FCM_VAPID_KEY=your_fcm_vapid_key
```

Firebase config is set in `src/firebase.ts` — replace with your own Firebase project credentials.

---

## Evaluation Matrix Coverage

| Criterion | Weight | Implementation |
|---|---|---|
| Problem Solving & Impact | 20% | Full citizen loop, City Memory, FCM closure notification, SLA tracking |
| Agentic Depth | 20% | 3 autonomous AI actions including background 60s cluster agent |
| Innovation & Creativity | 20% | Voice input, Google Drive upload, predictive forecasting, AI Journey Trace, push notifications |
| Google Technologies | 15% | Gemini 2.5/3.5 Flash, Firebase (Firestore/Auth/Storage/FCM), Google Maps, Drive Picker, Maps Grounding |
| Product Experience | 10% | Dark mode, skeleton loading, real-time updates, gamification, responsive design |
| Technical Implementation | 10% | Cascading model fallbacks, Firestore security rules, in-memory caching, FCM server integration |
| Completeness | 5% | All 8 example features from problem statement implemented |

---

## Project Structure

```
├── server.ts              # Express API server — all AI endpoints + background agent + FCM
├── src/
│   ├── App.tsx            # Root component, auth, nav, routing
│   ├── firebase.ts        # Firebase config and helpers
│   ├── types.ts           # TypeScript types
│   └── components/
│       ├── ReportForm.tsx         # Multimodal issue submission + Google Drive picker
│       ├── CommunityFeed.tsx      # Live feed + leaderboard + skeleton states
│       ├── AnalyticsDashboard.tsx # Maps, charts, health scanner, forecasting
│       ├── AdminPanel.tsx         # Municipal operations console + FCM trigger
│       ├── ReportDetailModal.tsx  # Report detail + AI journey trace
│       ├── CityAssistant.tsx      # Google Maps Grounded AI chatbot
│       ├── FCMProvider.tsx        # Firebase Cloud Messaging setup + toast notifications
│       └── Skeleton.tsx           # Reusable shimmer skeleton component
├── firestore.rules        # Firestore security rules
└── package.json
```

---

Built with ❤️ by Venkat · VIBE2SHIP 2026
