"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Mail } from "lucide-react";

const MESSAGES = [
  { text: "Calcul de vos indicateurs...",        start: 0,  end: 10 },
  { text: "Analyse de votre secteur...",          start: 10, end: 20 },
  { text: "Application des pondérations...",      start: 20, end: 40 },
  { text: "Génération de vos explications IA...", start: 40, end: 60 },
];

export default function ComputingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const snapshotId = params.get("snapshot_id");

  const [elapsed, setElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Current message based on elapsed seconds
  const currentMsg = MESSAGES.findLast(m => elapsed >= m.start)?.text ?? MESSAGES[0].text;
  const progress = Math.min((elapsed / 60) * 100, 98);

  useEffect(() => {
    if (!snapshotId) { router.push("/dashboard"); return; }

    // Elapsed timer
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        if (e >= 60) {
          clearInterval(intervalRef.current);
          setTimedOut(true);
          return 60;
        }
        return e + 1;
      });
    }, 1000);

    // Poll every 2s
    const supabase = getSupabaseBrowserClient();
    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshot/${snapshotId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (res.ok) {
          const snap = await res.json();
          if (snap?.overall_score != null) {
            clearInterval(intervalRef.current);
            clearInterval(pollRef.current);
            router.push(`/score/${snapshotId}`);
          }
        }
      } catch { /* keep polling */ }
    }, 2000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(pollRef.current);
    };
  }, [snapshotId]);

  if (timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1B2A1B] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-3">Le calcul prend plus de temps que prévu</h2>
          <p className="text-white/60 text-sm mb-6">
            Votre score est en cours de calcul. Nous vous enverrons un email dès qu'il sera prêt.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-brand-mid text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1B2A1B] p-6">
      <div className="text-center max-w-sm w-full">
        {/* Animated rings */}
        <div className="relative w-32 h-32 mx-auto mb-10">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle
              cx="64" cy="64" r="54" fill="none"
              stroke="#2E7D32" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress / 100)}`}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="space-y-1">
              <div className="w-1.5 h-1.5 bg-brand-mid rounded-full mx-auto animate-pulse" />
              <div className="w-1.5 h-1.5 bg-brand-mid/60 rounded-full mx-auto animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="w-1.5 h-1.5 bg-brand-mid/30 rounded-full mx-auto animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        </div>

        <h2 className="text-lg font-medium text-white mb-2 transition-all duration-500">
          {currentMsg}
        </h2>
        <p className="text-white/40 text-sm mb-8">Cela prend généralement moins d'une minute</p>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2">
          {MESSAGES.map((m, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500
                ${elapsed >= m.start ? "bg-brand-mid" : "bg-white/20"}
                ${i === MESSAGES.findLastIndex(m => elapsed >= m.start) ? "w-8" : "w-4"}
              `}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
