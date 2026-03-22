"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, ExternalLink } from "lucide-react";

const ONBOARDING_KEY = "im-onboarding-v1";

// ── Slide Illustrations ────────────────────────────────────────────────────────

function DashboardIllustration() {
  return (
    <svg width="260" height="150" viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <rect width="260" height="150" rx="10" fill="#09090b" />
      {/* header bar */}
      <rect x="0" y="0" width="260" height="26" rx="10" fill="#111113" />
      <rect x="0" y="16" width="260" height="10" fill="#111113" />
      {/* dashboard tabs */}
      {[
        { x: 10, active: false, label: "Markets" },
        { x: 68, active: true,  label: "Portfolio" },
        { x: 130, active: false, label: "News" },
      ].map((tab) => (
        <g key={tab.label}>
          <rect
            x={tab.x} y="6" width="54" height="14" rx="3"
            fill={tab.active ? "#3f3f46" : "#18181b"}
            stroke={tab.active ? "#52525b" : "#27272a"}
            strokeWidth="0.5"
          />
          <text x={tab.x + 27} y="16" fill={tab.active ? "#d4d4d8" : "#52525b"} fontSize="6.5" textAnchor="middle" fontFamily="system-ui">{tab.label}</text>
        </g>
      ))}
      {/* add button */}
      <rect x="226" y="6" width="24" height="14" rx="3" fill="#18181b" stroke="#27272a" strokeWidth="0.5" />
      <text x="238" y="16" fill="#52525b" fontSize="10" textAnchor="middle" fontFamily="system-ui">+</text>

      {/* Widget: line chart */}
      <rect x="8" y="32" width="118" height="74" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="14" y="39" width="36" height="5" rx="2" fill="#27272a" />
      <text x="14" y="56" fill="#52525b" fontSize="7" fontFamily="system-ui">BTC / USD</text>
      <text x="14" y="65" fill="#d4d4d8" fontSize="11" fontWeight="600" fontFamily="system-ui">$67,450</text>
      <text x="60" y="65" fill="#22c55e" fontSize="7" fontFamily="system-ui">+2.41%</text>
      <polyline points="14,98 32,88 50,92 68,79 86,83 104,70 120,74" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14,98 32,88 50,92 68,79 86,83 104,70 120,74 120,98 14,98" fill="url(#chartFill)" opacity="0.3" />
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Widget: stats */}
      <rect x="134" y="32" width="118" height="34" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="140" y="39" width="28" height="4" rx="2" fill="#27272a" />
      <text x="140" y="56" fill="#71717a" fontSize="8" fontFamily="system-ui">Portfolio Value</text>
      <text x="192" y="56" fill="#22c55e" fontSize="7" fontFamily="system-ui">+$1,240</text>

      {/* Widget: progress bars */}
      <rect x="134" y="72" width="118" height="34" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="140" y="79" width="24" height="4" rx="2" fill="#27272a" />
      {[
        { y: 87, w: 90, label: "ETH", pct: 0.72 },
        { y: 94, w: 90, label: "SOL", pct: 0.45 },
      ].map((bar) => (
        <g key={bar.label}>
          <text x="140" y={bar.y + 5} fill="#52525b" fontSize="6" fontFamily="system-ui">{bar.label}</text>
          <rect x="154" y={bar.y} width="90" height="5" rx="2.5" fill="#27272a" />
          <rect x="154" y={bar.y} width={90 * bar.pct} height="5" rx="2.5" fill="#6366f1" opacity="0.8" />
        </g>
      ))}

      {/* Widget: donut */}
      <rect x="8" y="112" width="118" height="30" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="14" y="119" width="28" height="4" rx="2" fill="#27272a" />
      <rect x="14" y="126" width="80" height="3" rx="1.5" fill="#27272a" opacity="0.4" />
      <rect x="14" y="132" width="55" height="3" rx="1.5" fill="#27272a" opacity="0.25" />

      {/* Widget: mini bars */}
      <rect x="134" y="112" width="118" height="30" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const heights = [14, 8, 18, 10, 14, 6];
        const h = heights[i];
        return (
          <rect key={i} x={140 + i * 17} y={138 - h} width="10" height={h} rx="2"
            fill={i === 2 ? "#6366f1" : "#27272a"} opacity={i === 2 ? 0.9 : 0.5} />
        );
      })}
    </svg>
  );
}

function CanvasIllustration() {
  return (
    <svg width="260" height="150" viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* canvas background */}
      <rect width="260" height="150" rx="10" fill="#09090b" />
      {/* dot grid */}
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 11 }, (_, c) => (
          <circle key={`${r}-${c}`} cx={10 + c * 24} cy={14 + r * 20} r="0.7" fill="#1c1c1e" />
        ))
      )}

      {/* Static widget 1 – bottom left */}
      <rect x="8" y="90" width="78" height="52" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="14" y="97" width="30" height="4" rx="2" fill="#27272a" />
      <circle cx="35" cy="122" r="14" stroke="#27272a" strokeWidth="6" fill="none" />
      <path d="M35,108 A14,14 0 0,1 49,122" stroke="#6366f1" strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* Static widget 2 – right column */}
      <rect x="196" y="8" width="56" height="134" rx="5" fill="#111113" stroke="#27272a" strokeWidth="0.5" />
      <rect x="202" y="15" width="28" height="4" rx="2" fill="#27272a" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x="202" y={24 + i * 24} width="44" height="18" rx="3" fill="#18181b" />
          <rect x="206" y={28 + i * 24} width="20" height="3" rx="1" fill="#27272a" />
          <rect x="206" y={34 + i * 24} width="12" height="2" rx="1" fill="#27272a" opacity="0.5" />
        </g>
      ))}

      {/* ── Dragged widget (elevated) ── */}
      {/* shadow */}
      <rect x="88" y="30" width="100" height="70" rx="7" fill="#000" opacity="0.45" />
      {/* card */}
      <rect x="84" y="24" width="100" height="70" rx="6" fill="#1a1a1d" stroke="#6366f1" strokeWidth="1.2" />
      <rect x="92" y="32" width="38" height="5" rx="2.5" fill="#3f3f46" />
      <polyline
        points="92,78 106,66 120,72 136,58 151,62 170,50 182,54"
        stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      <polyline
        points="92,78 106,66 120,72 136,58 151,62 170,50 182,54 182,78 92,78"
        fill="url(#dragFill)" opacity="0.2"
      />
      <defs>
        <linearGradient id="dragFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grab cursor */}
      <g transform="translate(170, 20)">
        <circle cx="10" cy="10" r="10" fill="#6366f1" opacity="0.15" />
        <text x="10" y="14" fontSize="11" textAnchor="middle" fontFamily="system-ui">✥</text>
      </g>

      {/* movement arrows */}
      {[
        { x: 76, y: 56, rot: 180 },
        { x: 192, y: 56, rot: 0 },
        { x: 134, y: 16, rot: 270 },
        { x: 134, y: 100, rot: 90 },
      ].map(({ x, y, rot }) => (
        <g key={rot} transform={`translate(${x},${y}) rotate(${rot},5,5)`} opacity="0.5">
          <path d="M1,5 L9,5 M6,2 L9,5 L6,8" stroke="#6366f1" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      ))}

      {/* resize handle */}
      <rect x="178" y="88" width="10" height="10" rx="2" fill="#3f3f46" opacity="0.8" />
      <path d="M181,94 L185,90 M183,94 L185,92" stroke="#71717a" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

function AiIllustration() {
  return (
    <svg width="260" height="150" viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="260" height="150" rx="10" fill="#09090b" />
      <defs>
        <linearGradient id="keyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      {/* large key icon, center-top */}
      <g transform="translate(100, 14)" opacity="0.9">
        <circle cx="30" cy="20" r="18" stroke="url(#keyGrad)" strokeWidth="2.5" fill="none" />
        <circle cx="30" cy="20" r="10" stroke="url(#keyGrad)" strokeWidth="1.5" fill="none" opacity="0.4" />
        <line x1="44" y1="30" x2="58" y2="44" stroke="url(#keyGrad)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="52" y1="44" x2="52" y2="52" stroke="url(#keyGrad)" strokeWidth="2" strokeLinecap="round" />
        <line x1="46" y1="50" x2="46" y2="56" stroke="url(#keyGrad)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* provider cards */}
      {[
        {
          x: 8, y: 86, w: 74, color: "#18181b", border: "#27272a",
          name: "xAI Grok", tier: "$25 free/mo", dot: "#22c55e",
        },
        {
          x: 93, y: 86, w: 74, color: "#18181b", border: "#27272a",
          name: "Gemini", tier: "Free tier", dot: "#3b82f6",
        },
        {
          x: 178, y: 86, w: 74, color: "#18181b", border: "#27272a",
          name: "OpenRouter", tier: "Free models", dot: "#a78bfa",
        },
      ].map((p) => (
        <g key={p.name}>
          <rect x={p.x} y={p.y} width={p.w} height="56" rx="6" fill={p.color} stroke={p.border} strokeWidth="0.5" />
          <circle cx={p.x + 12} cy={p.y + 14} r="4" fill={p.dot} opacity="0.9" />
          <text x={p.x + 21} y={p.y + 18} fill="#d4d4d8" fontSize="7.5" fontWeight="600" fontFamily="system-ui">{p.name}</text>
          <rect x={p.x + 8} y={p.y + 26} width={p.w - 16} height="3" rx="1.5" fill="#27272a" opacity="0.7" />
          <rect x={p.x + 8} y={p.y + 32} width={p.w - 24} height="3" rx="1.5" fill="#27272a" opacity="0.4" />
          <rect x={p.x + 8} y={p.y + 42} width={p.w - 16} height="10" rx="3" fill="#27272a" />
          <text x={p.x + p.w / 2} y={p.y + 50} fill="#71717a" fontSize="6.5" textAnchor="middle" fontFamily="system-ui">{p.tier}</text>
        </g>
      ))}

      {/* connecting dots between key and cards */}
      {[50, 130, 215].map((cx) => (
        <line key={cx} x1={cx} y1="80" x2={cx} y2="86" stroke="#27272a" strokeWidth="0.8" strokeDasharray="2,2" />
      ))}
      <line x1="50" y1="80" x2="215" y2="80" stroke="#27272a" strokeWidth="0.8" strokeDasharray="2,2" />
      <line x1="130" y1="68" x2="130" y2="80" stroke="url(#keyGrad)" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

// ── Slide data ─────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    illustration: <DashboardIllustration />,
    title: "Your AI Dashboard, Your Way",
    description:
      "Create unlimited dashboards and organize your data exactly how you like. Switch between them instantly — each one is your personalized view of the world.",
    features: [
      "Unlimited dashboards",
      "AI-generated widgets in seconds",
      "Switch context instantly",
    ],
  },
  {
    illustration: <CanvasIllustration />,
    title: "Drag, Drop, Done",
    description:
      "Place every widget exactly where you want it on the infinite canvas. Resize freely, zoom in and out, and rearrange without any layout constraints.",
    features: [
      "Infinite canvas — no grid limits",
      "Drag & resize with precision",
      "Zoom to the perfect view",
    ],
  },
  {
    illustration: <AiIllustration />,
    title: "Free AI, Endless Possibilities",
    description:
      "You need an AI API key to generate widgets. These providers offer generous free tiers — pick one, grab your key, and you're ready to go.",
    providers: [
      {
        name: "xAI Grok",
        badge: "Free $25 / month",
        badgeColor: "text-emerald-400",
        description: "Grok 3 — fast & capable.",
        url: "https://console.x.ai",
        urlLabel: "console.x.ai",
        dotColor: "bg-emerald-500",
      },
      {
        name: "Google Gemini",
        badge: "Free tier",
        badgeColor: "text-blue-400",
        description: "Gemini 2.0 Flash — generous quota.",
        url: "https://aistudio.google.com/apikey",
        urlLabel: "aistudio.google.com",
        dotColor: "bg-blue-500",
      },
      {
        name: "OpenRouter",
        badge: "Free models",
        badgeColor: "text-violet-400",
        description: "Access many free models in one place.",
        url: "https://openrouter.ai/keys",
        urlLabel: "openrouter.ai",
        dotColor: "bg-violet-500",
      },
    ],
    hint: "After getting a key → open the Settings panel → paste it under AI Provider.",
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [slide, setSlide]     = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [dir, setDir]         = useState<1 | -1>(1);  // 1=forward, -1=back

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isElectron = ua.includes("Electron");
    if (!isElectron) return;
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
  }, []);

  const goTo = useCallback(
    (next: number, direction: 1 | -1) => {
      if (leaving) return;
      setLeaving(true);
      setDir(direction);
      setTimeout(() => {
        setSlide(next);
        setLeaving(false);
      }, 220);
    },
    [leaving]
  );

  const prev = () => { if (slide > 0) goTo(slide - 1, -1); };
  const next = () => {
    if (slide < SLIDES.length - 1) goTo(slide + 1, 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = SLIDES[slide];
  const isLast  = slide === SLIDES.length - 1;

  const slideStyle: React.CSSProperties = {
    opacity:   leaving ? 0 : 1,
    transform: leaving
      ? `translateX(${dir * 20}px)`
      : "translateX(0)",
    transition: leaving
      ? "opacity 0.2s ease, transform 0.22s ease"
      : "opacity 0.25s ease 0.05s, transform 0.25s ease 0.05s",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #111113 0%, #0d0d0f 100%)",
          border: "1px solid #27272a",
          boxShadow: "0 0 0 1px rgba(99,102,241,0.08), 0 32px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <X size={14} />
        </button>

        {/* Slide content */}
        <div style={slideStyle}>
          {/* Illustration */}
          <div className="flex justify-center pt-8 px-6">
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1c1c1e" }}>
              {current.illustration}
            </div>
          </div>

          {/* Text */}
          <div className="px-8 pt-6 pb-2">
            <h2 className="text-lg font-semibold text-zinc-100 mb-2 leading-snug">
              {current.title}
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed mb-4">
              {current.description}
            </p>

            {/* Feature list (slides 1 & 2) */}
            {"features" in current && current.features && (
              <ul className="space-y-2">
                {current.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-400">
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            )}

            {/* Provider cards (slide 3) */}
            {"providers" in current && current.providers && (
              <div className="space-y-2.5">
                {current.providers.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: "#161618", border: "1px solid #27272a" }}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.dotColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-300">{p.name}</span>
                        <span className={`text-[10px] font-medium ${p.badgeColor}`}>{p.badge}</span>
                      </div>
                      <span className="text-xs text-zinc-600">{p.description}</span>
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors shrink-0"
                      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                      Get key <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
                {"hint" in current && current.hint && (
                  <p className="text-[11px] text-zinc-600 pt-1">
                    <span className="text-zinc-500">Tip:</span> {current.hint}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer: dots + navigation */}
        <div
          className="flex items-center justify-between px-8 py-5 mt-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > slide ? 1 : -1)}
                className="transition-all duration-300 rounded-full"
                style={{
                  width:   i === slide ? "20px" : "6px",
                  height:  "6px",
                  background: i === slide
                    ? "linear-gradient(90deg, #818cf8, #a78bfa)"
                    : "#27272a",
                }}
              />
            ))}
          </div>

          {/* Prev / Next */}
          <div className="flex items-center gap-2">
            {slide > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft size={13} /> Back
              </button>
            )}
            {slide === 0 && (
              <button
                onClick={dismiss}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-all"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 0 16px rgba(99,102,241,0.3)",
              }}
            >
              {isLast ? "Get Started" : "Next"}
              {!isLast && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
