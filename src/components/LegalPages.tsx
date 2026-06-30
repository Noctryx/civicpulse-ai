import { motion } from "motion/react";
import { ArrowLeft, Shield, FileText, Building2, Eye, Info } from "lucide-react";

interface LegalPagesProps {
  view: "privacy" | "terms";
  onBack: () => void;
  isDarkMode: boolean;
}

export default function LegalPages({ view, onBack, isDarkMode }: LegalPagesProps) {
  const isPrivacy = view === "privacy";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f17] text-slate-950 dark:text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Navigation & Brand Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-400 shadow-3xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>

          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-lg text-white font-bold text-sm shadow-sm">
              CP
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight flex items-center gap-1">
                CivicPulse <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30">AI</span>
              </span>
              <p className="text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                Intelligent Urban Governance
              </p>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm"
        >
          {isPrivacy ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Privacy Policy
                  </h1>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    Last Updated: June 29, 2026
                  </p>
                </div>
              </div>

              {/* Purpose statement block required by verification */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl p-5 space-y-2">
                <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4" /> Application Purpose
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  <strong>CivicPulse AI</strong> is a community-driven smart city infrastructure reporting platform. 
                  It connects local citizens with municipal utility and maintenance teams. Citizens use the application to log real-time visual reports of potholes, public lighting failures, and pipeline leaks. Our built-in artificial intelligence models (powered by Google Gemini) automatically categorize, evaluate gravity, and draft action plans to accelerate repair workflows.
                </p>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                    1. Information We Collect
                  </h2>
                  <p>
                    To participate in the <strong>CivicPulse AI</strong> reporting environment, users authenticate using Google Sign-In. Through this OAuth flow, we collect and store:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 font-medium">
                    <li>Your official profile name, email address, and profile picture.</li>
                    <li>Geographic coordinates (latitude and longitude) of civic issues you submit.</li>
                    <li>Visual media (such as photos or videos of potholes, water leaks) uploaded to describe the issues.</li>
                    <li>Device tokens (with permission) for receiving Push Notifications when reports change status.</li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    2. How We Use Your Information
                  </h2>
                  <p>
                    Your personal profile information is used strictly to establish a secure account, maintain user trust, and support reputation points for valid reports. Specifically:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 font-medium">
                    <li><strong>Account Authenticity</strong>: Ensuring reports are submitted by real local citizens.</li>
                    <li><strong>Status Updates</strong>: Triggering durable notification triggers (e.g. email or FCM) when city crews resolve your reported hazard.</li>
                    <li><strong>Administrative Audits</strong>: Allowing designated municipal supervisors to view reporter details when resolving high-urgency disputes.</li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    3. Data Storage &amp; Firebase Security
                  </h2>
                  <p>
                    Your authentication records and database records are housed securely in Google Firebase Authentication and Google Cloud Firestore. We employ strict, role-based Firestore security rules preventing unauthenticated actors from accessing sensitive database documents or editing other citizen records.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    4. Data Sharing and Third Parties
                  </h2>
                  <p>
                    <strong>CivicPulse AI</strong> does not sell, lease, rent, or distribute user email profiles or identifiers to third-party tracking services or commercial advertisers. Submitted civic issue reports (excluding personal email identifiers) are displayed on a public civic dashboard for community awareness and crowd-sourced confirmations.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    5. Cookies &amp; Local Storage
                  </h2>
                  <p>
                    The applet uses basic localized state and persistent session markers in your browser's local storage to preserve active light/dark display themes, prevent multiple confirmations on the same issue from a single client, and keep you securely logged into your portal session.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    6. User Rights &amp; Deletion
                  </h2>
                  <p>
                    You retain full control over your data. You can choose to delete your reported issues or request complete user profile removal. For data deletion inquiries, contact our development team at: <strong className="text-indigo-600 dark:text-indigo-400">venky14182007@gmail.com</strong>.
                  </p>
                </section>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Terms of Service
                  </h1>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    Last Updated: June 29, 2026
                  </p>
                </div>
              </div>

              {/* Purpose statement block required by verification */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl p-5 space-y-2">
                <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Civic Engagement Agreement
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  By accessing and utilizing <strong>CivicPulse AI</strong>, you agree to engage in constructive, accurate, and responsible municipal hazard reporting. This system is a mutual civic contract to improve public safety and urban infrastructure.
                </p>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    1. Agreement to Terms
                  </h2>
                  <p>
                    These terms govern your usage of <strong>CivicPulse AI</strong>. By logging in via Google Sign-In and submitting records to the platform, you legally assent to all stipulations herein. If you do not agree to these conditions, you must immediately terminate use of this portal.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    2. User Conduct &amp; Reporting Accuracy
                  </h2>
                  <p>
                    As a user, you hold complete accountability for the material and media files you log on the public portal. You explicitly agree that:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 font-medium">
                    <li>All submitted photos, videos, descriptions, and geotags represent real, physically existing public infrastructure issues.</li>
                    <li>You will not submit duplicate reports of the same physical hazard to falsely inflate urgency.</li>
                    <li>You will not upload malicious files, offensive language, copyrighted materials, or personal tracking photos of uninvolved individuals.</li>
                    <li>You will not use automated scripts or bots to spam the municipal server with mock reports.</li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    3. AI Generation Disclaimer
                  </h2>
                  <p>
                    <strong>CivicPulse AI</strong> leverages high-performance AI models (including Google Gemini 3.5) to perform rapid visual assessments and priority routing. While these AI tools aim for state-of-the-art accuracy, they should be treated as diagnostic aids. The municipal department retains the final authority to re-classify severity, reassign repair teams, or modify estimated completion costs.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    4. Intellectual Property of Reports
                  </h2>
                  <p>
                    To ensure transparent public record-keeping, any civic report, description, geolocation, and proof photo you submit to <strong>CivicPulse AI</strong> is treated as non-proprietary public domain information. You grant the platform and municipal agencies a perpetual, royalty-free, irrevocable license to publish, display, and share these data logs on the city-wide community feeds.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    5. Termination of Service
                  </h2>
                  <p>
                    We reserve the right, in our sole discretion, to suspend, disable, or ban user profile access to the portal if a user is detected logging fraudulent reports, uploading offensive media, or violating safe conduct expectations.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    6. Limitation of Liability
                  </h2>
                  <p>
                    <strong>CivicPulse AI</strong> is a diagnostic and collaborative infrastructure monitoring app. The platform's developers, maintainers, and host entities do not guarantee immediate physical response or repair actions from municipal teams and hold no liability for structural damages or injuries occurring near reported hazards.
                  </p>
                </section>
              </div>
            </div>
          )}
        </motion.div>

        {/* Legal Footer */}
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-8">
          &copy; 2026 CivicPulse AI • Supporting Safe and Responsive Public Infrastructure
        </p>
      </div>
    </div>
  );
}
