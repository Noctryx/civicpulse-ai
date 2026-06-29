# CivicPulse AI 🏙️
### Intelligent Urban Governance Platform

> Built for VIBE2SHIP Hackathon · Problem Statement 2: Community Hero

**CivicPulse AI** turns a citizen's spoken complaint into an autonomous municipal action — classifying the issue, assigning the right crew, detecting systemic failures, and dispatching escalation alerts without any human administrator pressing a button.

🔗 **Live Demo:** https://ai.studio/apps/19ea99b1-ecf0-4c28-ae07-4ceb923079a3

---

## What It Does

Citizens report civic issues (potholes, broken streetlights, water leakages, waste) through **four input modalities** — text, image, video, or live voice transcription. The moment a report is submitted:

1. **Gemini AI analyzes** the image/video/voice, classifies the issue, assesses severity, estimates repair cost and time, and autonomously assigns the correct municipal crew
2. **City Memory** cross-references the location against historical reports — flagging systemic infrastructure failures, not just one-off complaints
3. **Autonomous Escalation** fires immediately if the report is High severity at a previously failed location — writing directly to the admin alert console with no human input
4. **Background Agent** runs every 60 seconds, independently scanning for spatial clusters of 3+ unresolved High-severity reports within 300m and creating Hazard Cluster alerts autonomously

---

## Key Features

| Feature | Description |
|---|---|
| 🎤 Voice Reporting | Speak a complaint in Indian English — Gemini 2.5 Flash transcribes and classifies it |
| 🤖 AI Issue Analysis | Multimodal analysis via Gemini 3.5 Flash — category, severity, cost estimate, crew assignment |
| 🧠 City Memory | Detects repeat failures at the same location — identifies systemic infrastructure decay |
| ⚡ Autonomous Agent | Background server loop fires escalation alerts every 60s without user action |
| 📊 Predictive Forecasting | 30–60 day infrastructure failure probability per neighbourhood cluster |
| 📋 Daily Dispatch Brief | Gemini 2.5 Flash generates structured field crew briefings on demand |
| 🗺️ Google Maps Integration | Real-time incident map with severity-coded markers and satellite view |
| 🤝 City Guide Assistant | Google Maps Grounded AI — verified local facility and service queries |
| 🏆 Civic Leaderboard | Gamified contribution scoring with 4 citizen levels and community rankings |
| 🔍 AI Journey Trace | Full audit log of every AI decision made per report |
| ✅ Citizen Closure Loop | Reporter sees a personal resolution banner when their issue is fixed |
| ⏱️ SLA Breach Tracking | Flags unresolved reports past 7-day threshold in the admin panel |

---

## Tech Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, Framer Motion, Recharts

**Backend:** Node.js, Express.js, TypeScript

**AI:** Gemini 2.5 Flash (forecasting, dispatch brief, voice transcription), Gemini 3.5 Flash (image/video analysis, resolution audit, city assistant)

**Google Technologies:** Firebase Firestore, Firebase Auth, Firebase Storage, Google Maps Platform, Gemini Maps Grounding Tool, Google AI Studio

---

## Architecture

```
Citizen Input (text / image / video / voice)
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
5-Stage Lifecycle → Citizen Resolution Banner
```

---

## Run Locally

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Add your GEMINI_API_KEY and GOOGLE_MAPS_PLATFORM_KEY to .env.local

# Run the development server
npm run dev
```

**Required environment variables:**
```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_PLATFORM_KEY=your_google_maps_api_key
```

Firebase config is set in `src/firebase.ts` — replace with your own Firebase project credentials.

---

## Evaluation Matrix Coverage

| Criterion | Weight | Implementation |
|---|---|---|
| Problem Solving & Impact | 20% | Full citizen loop, City Memory, closure banner, SLA tracking |
| Agentic Depth | 20% | 3 autonomous AI actions including background 60s cluster agent |
| Innovation & Creativity | 20% | Voice input, predictive forecasting, AI Journey Trace, 4-modal reporting |
| Google Technologies | 15% | Gemini 2.5/3.5 Flash, Firebase, Google Maps, Maps Grounding |
| Product Experience | 10% | Dark mode, real-time updates, gamification, responsive design |
| Technical Implementation | 10% | Cascading model fallbacks, Firestore security rules, in-memory caching |
| Completeness | 5% | All 8 example features from problem statement implemented |

---

## Project Structure

```
├── server.ts              # Express API server — all AI endpoints + background agent
├── src/
│   ├── App.tsx            # Root component, auth, nav, routing
│   ├── firebase.ts        # Firebase config and helpers
│   ├── types.ts           # TypeScript types
│   └── components/
│       ├── ReportForm.tsx         # Multimodal issue submission
│       ├── CommunityFeed.tsx      # Live feed + leaderboard
│       ├── AnalyticsDashboard.tsx # Maps, charts, health scanner, forecasting
│       ├── AdminPanel.tsx         # Municipal operations console
│       ├── ReportDetailModal.tsx  # Report detail + AI journey trace
│       └── CityAssistant.tsx      # Google Maps Grounded AI chatbot
├── firestore.rules        # Firestore security rules
└── package.json
```

---

Built with ❤️ by Venkat · VIBE2SHIP 2026
