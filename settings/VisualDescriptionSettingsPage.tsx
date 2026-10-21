"use client";

/**
 * VisualDescriptionSettingsPage.tsx
 *
 * Dedicated Admin Settings Page for Visual Description pre-built CSS.
 * Mounted at /admin/visual-description via addHook("admin.pages", ...).
 *
 * Administrators can paste and save global pre-built CSS rules (e.g. from Xiaomi,
 * Apple, Samsung, AliExpress, Anker, or custom design systems).
 * These styles are dynamically injected on the server-side via RootLayout (app/layout.tsx),
 * allowing product visual descriptions to render with exact design fidelity.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import useSettings from "@/lib/useSettings";
import { xFetch } from "@/lib/express";
import VisualDescriptionRenderer from "../ui/VisualDescriptionRenderer";
import { XIAOMI_MASTER_PREBUILT_CSS } from "../presets/xiaomiPrebuiltCss";
import { parseHtmlToVisualData } from "../lib/htmlToJsonParser";

// ── Default starter CSS preset for tech brand layouts ───────────────────────────
const DEFAULT_PREBUILT_CSS = XIAOMI_MASTER_PREBUILT_CSS;

export default function VisualDescriptionSettingsPage() {
    const { settings, loading, refresh } = useSettings();

    const [cssValue, setCssValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");

    // Initialize from settings or fallback to Xiaomi Master CSS
    useEffect(() => {
        if (loading) return;
        const currentCss = settings.visual_description_css;
        if (typeof currentCss === "string" && currentCss.trim()) {
            setCssValue(currentCss);
        } else {
            setCssValue(XIAOMI_MASTER_PREBUILT_CSS);
        }
    }, [loading, settings]);

    // Handle Save
    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const payload = {
                visual_description_css: cssValue,
            };

            const res = await xFetch("/settings", {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage({
                    text: data.error || "Failed to save CSS settings",
                    type: "error",
                });
            } else {
                setMessage({
                    text: "Pre-built CSS saved successfully! It will now be loaded dynamically server-side.",
                    type: "success",
                });
                try {
                    localStorage.setItem("cms_settings_updated", Date.now().toString());
                    window.dispatchEvent(new Event("cms_settings_updated"));
                } catch {}
                refresh();
                setTimeout(() => setMessage(null), 5000);
            }
        } catch {
            setMessage({
                text: "Network error while saving settings.",
                type: "error",
            });
        } finally {
            setSaving(false);
        }
    };

    // Preset loader helper
    const handleLoadPreset = (presetType: "xiaomi" | "default" | "minimal" | "cards") => {
        if (presetType === "xiaomi" || presetType === "default") {
            setCssValue(XIAOMI_MASTER_PREBUILT_CSS);
        } else if (presetType === "minimal") {
            setCssValue(`/* Minimal Brand Reset */
.visual-description-container img {
  max-width: 100% !important;
  height: auto !important;
  border-radius: 1rem;
}
.visual-description-container {
  overflow: hidden;
}
`);
        } else if (presetType === "cards") {
            setCssValue(`/* Modern Card & Shadow Styling */
.visual-description-container .card,
.visual-description-container [class*="card"] {
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}
.visual-description-container .card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
`);
        }
        setMessage({ text: "Preset loaded into editor. Click 'Save Changes' to apply.", type: "success" });
    };

    // Authentic sample HTML for previewing the CSS
    const samplePreviewHtml = useMemo(() => {
        return `<div class="xiaomi-ux3b2-components">
  <section id="why" class="ndovu-why ndovu-why--band ndovu-why--light" aria-labelledby="ndovu-why-title-demo">
    <div class="ndovu-why__inner">
      <h2 id="ndovu-why-title-demo" class="ndovu-why__title">Product Highlights</h2>
      <ul class="ndovu-why__grid" data-count="6">
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">4,288 mAh</strong><span class="ndovu-why__caption">All-day intelligent battery</span></li>
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">6.3-inch</strong><span class="ndovu-why__caption">OLED ProMotion at 120Hz</span></li>
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">48MP</strong><span class="ndovu-why__caption">Variable aperture sensor</span></li>
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">256GB</strong><span class="ndovu-why__caption">High-speed storage, 12GB RAM</span></li>
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">IP68</strong><span class="ndovu-why__caption">Aerospace grade titanium</span></li>
        <li class="ndovu-why__tile"><strong class="ndovu-why__value">A20 Pro</strong><span class="ndovu-why__caption">Dual 16-core Neural Engine</span></li>
      </ul>
    </div>
  </section>
  <article class="ndovu-scene scene-video ndovu-scene--dark" style="--ns-width:100%;--ns-copy-width:900px;--ns-padding-top:72px;--ns-padding-bottom:50px;--ns-heading-size:56px;--ns-body-size:20px;--ns-text-align:center;--ns-background:#000000;--ns-card-background:#161617;--ns-radius:24px;--ns-ratio:1.9;--ns-fit:cover;">
    <div class="ndovu-scene-inner">
      <header class="ndovu-scene-copy">
        <p class="ndovu-scene-eyebrow">Visual Tour</p>
        <h2>Make more possible.</h2>
        <div class="ndovu-scene-description"><p>Authentic scene styling with variable CSS properties, dark background, and typography.</p></div>
      </header>
    </div>
  </article>
</div>`;
    }, []);

    const samplePreviewData = useMemo(() => {
        const parsed = parseHtmlToVisualData(samplePreviewHtml);
        parsed.customCss = cssValue;
        return parsed;
    }, [samplePreviewHtml, cssValue]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-100 text-gray-400">
                <Icon icon="solar:spinner-linear" className="animate-spin text-blue-600 mr-2" width={24} />
                <span className="text-sm font-semibold">Loading Visual Description Settings...</span>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl border border-gray-200/90 p-6 shadow-xs">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                        <Icon icon="solar:layers-minimalistic-bold" width={26} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-gray-900">
                                Visual Description CSS
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                                Server-Side CSS
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Global pre-built CSS for product visual descriptions — dynamically injected in server layout
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <Icon icon="solar:spinner-linear" className="animate-spin" width={16} />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Icon icon="solar:diskette-bold" width={16} />
                                <span>Save Changes</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Alert message */}
            {message && (
                <div
                    className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between ${
                        message.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-800"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Icon
                            icon={
                                message.type === "success"
                                    ? "solar:check-circle-bold"
                                    : "solar:danger-triangle-bold"
                            }
                            width={18}
                        />
                        <span>{message.text}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMessage(null)}
                        className="text-gray-400 hover:text-gray-600 font-bold"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Tabs & Presets Bar */}
            <div className="bg-white rounded-3xl border border-gray-200/90 p-4 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab("editor")}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                activeTab === "editor"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : "text-gray-600 hover:bg-gray-100"
                            }`}
                        >
                            <Icon icon="solar:code-bold" width={16} />
                            <span>Pre-built CSS Editor</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab("preview")}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                activeTab === "preview"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : "text-gray-600 hover:bg-gray-100"
                            }`}
                        >
                            <Icon icon="solar:eye-bold" width={16} />
                            <span>Live CSS Preview</span>
                        </button>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-400">Presets:</span>
                        <button
                            type="button"
                            onClick={() => handleLoadPreset("xiaomi")}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer shadow-xs"
                        >
                            Xiaomi & Ndovu (Live Reference)
                        </button>
                        <button
                            type="button"
                            onClick={() => handleLoadPreset("cards")}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer"
                        >
                            Modern Cards
                        </button>
                        <button
                            type="button"
                            onClick={() => handleLoadPreset("minimal")}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer"
                        >
                            Minimal
                        </button>
                    </div>
                </div>

                {/* Editor Tab */}
                {activeTab === "editor" && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <Icon icon="solar:info-circle-linear" width={14} className="text-blue-500" />
                                Paste your brand pre-built CSS here. These styles will be loaded on the server across all product pages.
                            </span>
                            <span>{cssValue.length.toLocaleString()} characters</span>
                        </div>

                        <div className="relative rounded-2xl border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition overflow-hidden bg-slate-950">
                            <textarea
                                rows={20}
                                value={cssValue}
                                onChange={(e) => setCssValue(e.target.value)}
                                placeholder="/* Paste CSS styles here */"
                                className="w-full p-4 font-mono text-xs text-emerald-400 bg-transparent resize-y focus:outline-hidden leading-relaxed"
                            />
                        </div>
                    </div>
                )}

                {/* Live Preview Tab */}
                {activeTab === "preview" && (
                    <div className="p-4 bg-gray-50/60 rounded-2xl border border-gray-200">
                        <div className="mb-4 pb-2 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700">
                                Simulated Product Showcase with Applied CSS
                            </span>
                            <span className="text-[10px] text-gray-400">
                                Testing reactive styling
                            </span>
                        </div>
                        <VisualDescriptionRenderer data={samplePreviewData} />
                    </div>
                )}
            </div>
        </div>
    );
}
