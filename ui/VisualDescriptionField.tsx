"use client";

/**
 * VisualDescriptionField.tsx
 *
 * Admin form component for Product Visual Descriptions.
 * Hooked into post.form via `_visual_description`.
 *
 * KEY FEATURES:
 * 1. Pure JSON Storage: Does NOT save raw HTML blob to the database;
 *    converts input into clean, structured JSON (`sections: VisualSection[]`).
 * 2. Section Editor:
 *    - Lists all individual sections (highlights, video scenes, galleries, product tours, metrics).
 *    - Each section has a DELETE (Close / Trash) button to remove unwanted sections (e.g. giant comparison tables).
 *    - Edit inline (Title, Eyebrow badge, Description, raw section HTML).
 *    - Reorder (Move Up / Down) and toggle enabled/disabled.
 * 3. HTML Importer: Paste HTML from reference sites; instantly parses into JSON sections.
 * 4. Responsive Live Preview: Test on Desktop, Tablet, and Mobile with master prebuilt CSS.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import type { FieldProps } from "@/hook";
import type { VisualDescriptionData, VisualSection, VisualSectionType } from "../types";
import { parseHtmlToVisualData } from "../lib/htmlToJsonParser";
import VisualPreviewModal from "./VisualPreviewModal";
import VisualDescriptionRenderer from "./VisualDescriptionRenderer";

export default function VisualDescriptionField({
    value,
    onChange,
    label = "Visual Description",
    ctx,
}: FieldProps) {
    const productTitle = (ctx?.title as string) || "Product";

    // Active View Tab: "sections" (Editor) | "html" (Paste) | "preview" | "json"
    const [activeTab, setActiveTab] = useState<"sections" | "html" | "preview" | "json">("sections");

    // Modal state for fullscreen simulator
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

    // Raw HTML paste buffer
    const [rawHtmlInput, setRawHtmlInput] = useState("");

    // Custom CSS extra buffer
    const [showCssInput, setShowCssInput] = useState(false);
    const [customCssInput, setCustomCssInput] = useState("");

    // Feedback toast
    const [feedback, setFeedback] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);

    // ID of section currently being edited inline
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

    // Search filter for sections list
    const [sectionSearch, setSectionSearch] = useState("");

    // Parse stored value into VisualDescriptionData
    const parsedData: VisualDescriptionData | null = useMemo(() => {
        if (!value || typeof value !== "string" || !value.trim()) return null;
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object") {
                // Structured JSON format
                if (Array.isArray(parsed.sections)) {
                    return parsed as VisualDescriptionData;
                }
                // Legacy format with rawHtml
                if (parsed.rawHtml) {
                    return parseHtmlToVisualData(parsed.rawHtml);
                }
            }
        } catch {
            // Raw HTML string was previously saved
            return parseHtmlToVisualData(value);
        }
        return null;
    }, [value]);

    // Current sections array
    const sections: VisualSection[] = useMemo(() => {
        return parsedData?.sections || [];
    }, [parsedData]);

    // Set initial active tab based on data presence
    useEffect(() => {
        if (sections.length > 0 && activeTab === "html") {
            setActiveTab("sections");
        } else if (sections.length === 0 && !value && activeTab === "sections") {
            setActiveTab("html");
        }
    }, [sections.length, value]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync custom CSS from stored data
    useEffect(() => {
        if (parsedData?.customCss && !customCssInput) {
            setCustomCssInput(parsedData.customCss);
        }
    }, [parsedData]);

    // Save helper: updates form state with clean JSON string only
    const saveUpdatedData = useCallback(
        (updatedSections: VisualSection[], newCss?: string) => {
            const finalCss = newCss !== undefined ? newCss : customCssInput;

            const totalImages = updatedSections.reduce((acc, s) => acc + (s.media?.filter((m) => m.type === "image").length || 0), 0);
            const totalVideos = updatedSections.reduce((acc, s) => acc + (s.media?.filter((m) => m.type === "video").length || 0), 0);

            const updatedData: VisualDescriptionData = {
                version: "1.0.0",
                customCss: finalCss.trim() || undefined,
                sections: updatedSections,
                stats: {
                    sectionCount: updatedSections.length,
                    imageCount: totalImages,
                    videoCount: totalVideos,
                    charCount: JSON.stringify(updatedSections).length,
                },
            };

            const jsonString = JSON.stringify(updatedData, null, 2);
            onChange(jsonString);
        },
        [customCssInput, onChange]
    );

    // Handler: Convert pasted HTML into structured JSON sections
    const handleConvertHtml = useCallback(
        (htmlToParse?: string) => {
            const targetHtml = (htmlToParse !== undefined ? htmlToParse : rawHtmlInput).trim();
            if (!targetHtml) {
                setFeedback({ text: "Please paste HTML code before converting.", type: "error" });
                return;
            }

            try {
                const result = parseHtmlToVisualData(targetHtml);

                if (customCssInput.trim()) {
                    result.customCss = `${result.customCss ? result.customCss + "\n" : ""}${customCssInput.trim()}`;
                }

                // Save clean JSON only to the database
                const jsonString = JSON.stringify(result, null, 2);
                onChange(jsonString);

                setFeedback({
                    text: `Converted successfully into ${result.sections.length} structured sections! Ready to review, edit, or delete unnecessary sections below.`,
                    type: "success",
                });
                setActiveTab("sections");
            } catch (err: any) {
                setFeedback({ text: `Error converting HTML: ${err?.message || "Failed"}`, type: "error" });
            }
        },
        [rawHtmlInput, customCssInput, onChange]
    );

    // Handler: Auto-process on paste
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = e.clipboardData.getData("text");
        if (pastedText && pastedText.trim().startsWith("<")) {
            setTimeout(() => {
                handleConvertHtml(pastedText);
            }, 60);
        }
    };

    // Handler: Delete a specific section
    const handleDeleteSection = (sectionId: string) => {
        const target = sections.find((s) => s.id === sectionId);
        const name = target?.title || sectionId;
        if (window.confirm(`Delete section "${name}"? This section will be removed completely from the JSON and will not be saved.`)) {
            const nextSections = sections.filter((s) => s.id !== sectionId);
            saveUpdatedData(nextSections);
            if (editingSectionId === sectionId) {
                setEditingSectionId(null);
            }
            setFeedback({ text: `Section "${name}" deleted.`, type: "info" });
        }
    };

    // Handler: Toggle enable/disable for a section
    const handleToggleSection = (sectionId: string) => {
        const nextSections = sections.map((s) => {
            if (s.id === sectionId) {
                return { ...s, enabled: s.enabled === false ? true : false };
            }
            return s;
        });
        saveUpdatedData(nextSections);
    };

    // Handler: Move section up or down
    const handleMoveSection = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= sections.length) return;

        const next = [...sections];
        const temp = next[index];
        next[index] = next[targetIndex];
        next[targetIndex] = temp;

        saveUpdatedData(next);
    };

    // Handler: Update edited fields of a single section
    const handleSaveSectionEdit = (updatedSection: VisualSection) => {
        const next = sections.map((s) => (s.id === updatedSection.id ? updatedSection : s));
        saveUpdatedData(next);
        setEditingSectionId(null);
        setFeedback({ text: `Section "${updatedSection.title || updatedSection.id}" updated.`, type: "success" });
    };

    // Handler: Delete all comparison sections (quick shortcut)
    const handleDeleteComparison = () => {
        const hasComp = sections.some((s) => s.type === "comparison" || s.id.includes("compare"));
        if (!hasComp) return;

        if (window.confirm("Remove all comparison table sections? This removes heavy external product tables.")) {
            const next = sections.filter((s) => s.type !== "comparison" && !s.id.includes("compare"));
            saveUpdatedData(next);
            setFeedback({ text: "Comparison table section removed.", type: "info" });
        }
    };

    // Handler: Clear all
    const handleClearAll = () => {
        if (window.confirm("Are you sure you want to clear all visual description sections?")) {
            setRawHtmlInput("");
            setCustomCssInput("");
            onChange("");
            setFeedback({ text: "Visual description cleared.", type: "info" });
            setActiveTab("html");
        }
    };

    // Filtered sections for search
    const filteredSections = useMemo(() => {
        if (!sectionSearch.trim()) return sections;
        const q = sectionSearch.toLowerCase();
        return sections.filter(
            (s) =>
                s.title.toLowerCase().includes(q) ||
                s.id.toLowerCase().includes(q) ||
                (s.badge && s.badge.toLowerCase().includes(q)) ||
                s.type.toLowerCase().includes(q)
        );
    }, [sections, sectionSearch]);

    // Section Type Pill renderer
    const renderTypePill = (type: VisualSectionType) => {
        switch (type) {
            case "highlights-grid":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <Icon icon="solar:star-fall-minimalistic-2-bold" width={11} />
                        Highlights Grid
                    </span>
                );
            case "scene-video":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                        <Icon icon="solar:videocamera-record-bold" width={11} />
                        Video Scene
                    </span>
                );
            case "scene-gallery":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Icon icon="solar:gallery-wide-bold" width={11} />
                        Gallery Carousel
                    </span>
                );
            case "scene-accordion":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                        <Icon icon="solar:magnifer-zoom-in-bold" width={11} />
                        Product Tour
                    </span>
                );
            case "scene-metrics":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center gap-1">
                        <Icon icon="solar:chart-square-bold" width={11} />
                        Specs & Metrics
                    </span>
                );
            case "scene-tabs":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                        <Icon icon="solar:slider-minimalistic-horizontal-bold" width={11} />
                        Aperture Tabs
                    </span>
                );
            case "comparison":
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <Icon icon="solar:scale-bold" width={11} />
                        Comparison Table
                    </span>
                );
            default:
                return (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1">
                        <Icon icon="solar:document-text-bold" width={11} />
                        Content
                    </span>
                );
        }
    };

    const hasComparison = sections.some((s) => s.type === "comparison" || s.id.includes("compare"));

    return (
        <div className="w-full bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
            {/* Header Bar */}
            <div className="px-4 py-3.5 bg-gray-50/80 border-b border-gray-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 border border-blue-500/20 flex items-center justify-center">
                        <Icon icon="solar:layers-minimalistic-bold" width={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-900">{label}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                JSON Structured
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            Parses source HTML into clean JSON sections with individual delete, edit, and reorder controls
                        </p>
                    </div>
                </div>

                {/* Primary Top Actions */}
                <div className="flex items-center gap-2">
                    {hasComparison && (
                        <button
                            type="button"
                            onClick={handleDeleteComparison}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Remove heavy 100KB+ comparison table section"
                        >
                            <Icon icon="solar:trash-bin-trash-bold" width={14} />
                            <span>Remove Comparison Table</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setIsPreviewModalOpen(true)}
                        disabled={sections.length === 0}
                        className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            sections.length > 0
                                ? "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-blue-600 shadow-2xs"
                                : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                        title="Open interactive fullscreen responsive simulator"
                    >
                        <Icon icon="solar:eye-bold" width={15} />
                        <span>Preview Live</span>
                    </button>

                    {sections.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
                            title="Clear All Sections"
                        >
                            <Icon icon="solar:trash-bin-trash-bold" width={17} />
                        </button>
                    )}
                </div>
            </div>

            {/* Statistics Banner */}
            {sections.length > 0 && (
                <div className="px-4 py-2 bg-emerald-50/60 border-b border-emerald-100/70 flex flex-wrap items-center justify-between text-xs text-gray-600 gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="font-bold text-emerald-900 flex items-center gap-1">
                            <Icon icon="solar:check-circle-bold" className="text-emerald-500" width={14} />
                            JSON Saved in Database
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-gray-700 font-medium">
                            <strong>{sections.filter((s) => s.enabled !== false).length}</strong> of <strong>{sections.length}</strong> Sections Active
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-gray-700 font-medium">
                            <strong>{parsedData?.stats?.imageCount || 0}</strong> Images
                        </span>
                        {Boolean(parsedData?.stats?.videoCount) && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="text-blue-700 font-medium">
                                    <strong>{parsedData?.stats?.videoCount}</strong> Videos
                                </span>
                            </>
                        )}
                    </div>

                    <span className="text-[11px] text-gray-500">
                        Delete or reorder sections below to customize product layout
                    </span>
                </div>
            )}

            {/* Feedback Alert */}
            {feedback && (
                <div
                    className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
                        feedback.type === "success"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : feedback.type === "error"
                            ? "bg-red-50 text-red-800 border-red-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                    }`}
                >
                    <span>{feedback.text}</span>
                    <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="text-gray-400 hover:text-gray-700 font-bold ml-2 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* View Switcher Tabs */}
            <div className="px-4 pt-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("sections")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                            activeTab === "sections"
                                ? "border-blue-600 text-blue-600 bg-blue-50/40"
                                : "border-transparent text-gray-500 hover:text-gray-800"
                        }`}
                    >
                        <Icon icon="solar:widget-2-bold" width={14} />
                        <span>Sections Editor</span>
                        {sections.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                                {sections.length}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("html")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                            activeTab === "html"
                                ? "border-blue-600 text-blue-600 bg-blue-50/40"
                                : "border-transparent text-gray-500 hover:text-gray-800"
                        }`}
                    >
                        <Icon icon="solar:code-bold" width={14} />
                        <span>Paste HTML</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("preview")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                            activeTab === "preview"
                                ? "border-blue-600 text-blue-600 bg-blue-50/40"
                                : "border-transparent text-gray-500 hover:text-gray-800"
                        }`}
                    >
                        <Icon icon="solar:eye-bold" width={14} />
                        <span>Live Preview</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("json")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                            activeTab === "json"
                                ? "border-blue-600 text-blue-600 bg-blue-50/40"
                                : "border-transparent text-gray-500 hover:text-gray-800"
                        }`}
                    >
                        <Icon icon="solar:file-text-bold" width={14} />
                        <span>JSON Data</span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => setShowCssInput(!showCssInput)}
                    className="text-[11px] font-bold text-gray-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer pb-1"
                >
                    <Icon icon="solar:tuning-bold" width={13} />
                    <span>{showCssInput ? "Hide Extra CSS" : "Custom CSS"}</span>
                </button>
            </div>

            {/* Optional Custom CSS Drawer */}
            {showCssInput && (
                <div className="p-3 bg-gray-50 border-b border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-semibold">Product-Specific Extra CSS Rules (Optional):</span>
                        <button
                            type="button"
                            onClick={() => {
                                saveUpdatedData(sections, customCssInput);
                                setFeedback({ text: "Custom CSS updated in JSON data.", type: "success" });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold cursor-pointer"
                        >
                            Apply CSS
                        </button>
                    </div>
                    <textarea
                        rows={3}
                        value={customCssInput}
                        onChange={(e) => setCustomCssInput(e.target.value)}
                        placeholder="/* Override or add specific CSS styles for this product */"
                        className="w-full p-2 font-mono text-xs bg-white rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                </div>
            )}

            {/* ─── TAB 1: SECTIONS EDITOR ─── */}
            {activeTab === "sections" && (
                <div className="p-4 space-y-4">
                    {sections.length === 0 ? (
                        <div className="py-12 text-center space-y-3 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                                <Icon icon="solar:code-square-bold" width={26} />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-gray-800">No Visual Sections Yet</h4>
                                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                                    Paste HTML from your reference product page to automatically extract and manage sections.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveTab("html")}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <Icon icon="solar:import-bold" width={15} />
                                <span>Paste Source HTML</span>
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Search and Filter Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                                <div className="relative flex-1 min-w-50 max-w-md">
                                    <Icon
                                        icon="solar:magnifer-linear"
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                        width={14}
                                    />
                                    <input
                                        type="text"
                                        value={sectionSearch}
                                        onChange={(e) => setSectionSearch(e.target.value)}
                                        placeholder="Search sections by title, ID, or type..."
                                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:outline-hidden transition"
                                    />
                                    {sectionSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setSectionSearch("")}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="text-[11px] text-gray-500 font-medium">
                                    Showing {filteredSections.length} of {sections.length} sections
                                </div>
                            </div>

                            {/* Section Cards List */}
                            <div className="space-y-2.5">
                                {filteredSections.map((sec) => {
                                    const originalIndex = sections.findIndex((s) => s.id === sec.id);
                                    const isEditing = editingSectionId === sec.id;
                                    const isEnabled = sec.enabled !== false;

                                    return (
                                        <div
                                            key={sec.id}
                                            className={`rounded-2xl border transition overflow-hidden ${
                                                !isEnabled
                                                    ? "bg-gray-50 border-gray-200 opacity-60"
                                                    : isEditing
                                                    ? "bg-blue-50/20 border-blue-300 ring-2 ring-blue-100"
                                                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-2xs"
                                            }`}
                                        >
                                            {/* Section Row Header */}
                                            <div className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    {/* Section Order Number */}
                                                    <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                                                        {originalIndex + 1}
                                                    </span>

                                                    {/* Section Type Badge */}
                                                    {renderTypePill(sec.type)}

                                                    {/* Title & Badge */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="text-xs font-bold text-gray-900 truncate">
                                                                {sec.title}
                                                            </h4>
                                                            {sec.badge && (
                                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded-md">
                                                                    {sec.badge}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-mono text-gray-400">
                                                                #{sec.id}
                                                            </span>
                                                        </div>

                                                        {/* Description Preview or Media Count */}
                                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                                                            {sec.description ? (
                                                                <p className="truncate max-w-md">{sec.description}</p>
                                                            ) : (
                                                                <span className="text-gray-400 italic">No description</span>
                                                            )}

                                                            {sec.media && sec.media.length > 0 && (
                                                                <span className="shrink-0 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded-md">
                                                                    {sec.media.length} {sec.media.length === 1 ? "media item" : "media items"}
                                                                </span>
                                                            )}

                                                            {sec.metrics && sec.metrics.length > 0 && (
                                                                <span className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-md">
                                                                    {sec.metrics.length} metrics
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Controls for this Section */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {/* Move Up */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMoveSection(originalIndex, "up")}
                                                        disabled={originalIndex === 0}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                                        title="Move Up"
                                                    >
                                                        <Icon icon="solar:arrow-up-linear" width={14} />
                                                    </button>

                                                    {/* Move Down */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMoveSection(originalIndex, "down")}
                                                        disabled={originalIndex === sections.length - 1}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                                        title="Move Down"
                                                    >
                                                        <Icon icon="solar:arrow-down-linear" width={14} />
                                                    </button>

                                                    {/* Toggle Visibility */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSection(sec.id)}
                                                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                                                            isEnabled
                                                                ? "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                                : "text-amber-500 bg-amber-50"
                                                        }`}
                                                        title={isEnabled ? "Hide section from rendering" : "Enable section"}
                                                    >
                                                        <Icon
                                                            icon={isEnabled ? "solar:eye-bold" : "solar:eye-closed-bold"}
                                                            width={15}
                                                        />
                                                    </button>

                                                    {/* Edit Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingSectionId(isEditing ? null : sec.id)}
                                                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                                                            isEditing
                                                                ? "bg-blue-600 text-white"
                                                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                        }`}
                                                        title="Edit section details & code"
                                                    >
                                                        <Icon icon="solar:pen-bold" width={12} />
                                                        <span>{isEditing ? "Close" : "Edit"}</span>
                                                    </button>

                                                    {/* DELETE / CLOSE BUTTON (Exact user request) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteSection(sec.id)}
                                                        className="p-1.5 rounded-lg text-red-500 hover:text-white hover:bg-red-600 transition cursor-pointer ml-1"
                                                        title="Delete this section"
                                                        aria-label={`Delete ${sec.title}`}
                                                    >
                                                        <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Inline Section Editor Panel */}
                                            {isEditing && (
                                                <SectionInlineEditor
                                                    section={sec}
                                                    onSave={(updated) => handleSaveSectionEdit(updated)}
                                                    onCancel={() => setEditingSectionId(null)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ─── TAB 2: PASTE RAW HTML ─── */}
            {activeTab === "html" && (
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                            <Icon icon="solar:info-circle-linear" width={14} className="text-blue-500" />
                            Paste raw HTML from reference product page (e.g. exelicgadgets.co.ke, Apple, Xiaomi). It will be converted into clean JSON sections.
                        </span>
                        <span>{rawHtmlInput.length.toLocaleString()} characters</span>
                    </div>

                    <div className="relative rounded-xl border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition overflow-hidden bg-slate-950">
                        <textarea
                            rows={14}
                            value={rawHtmlInput}
                            onChange={(e) => setRawHtmlInput(e.target.value)}
                            onPaste={handlePaste}
                            placeholder="<div class=&quot;xiaomi-ux3b2-components&quot;>&#10;  <section id=&quot;why&quot; class=&quot;ndovu-why&quot;>...</section>&#10;  ...&#10;</div>"
                            className="w-full p-4 font-mono text-xs text-emerald-400 bg-transparent resize-y focus:outline-hidden leading-relaxed"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <p className="text-[11px] text-gray-400">
                            Tags, IDs, and classes will be preserved inside individual JSON sections for 100% CSS fidelity.
                        </p>
                        <button
                            type="button"
                            onClick={() => handleConvertHtml()}
                            disabled={!rawHtmlInput.trim()}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <Icon icon="solar:magic-stick-bold" width={15} />
                            <span>Convert & Save as JSON</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ─── TAB 3: LIVE PREVIEW ─── */}
            {activeTab === "preview" && (
                <div className="p-4 bg-gray-50/60 border-t border-gray-100">
                    <div className="mb-4 pb-2 border-b border-gray-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">
                            Rendered Visual Showcase ({sections.filter((s) => s.enabled !== false).length} active sections)
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsPreviewModalOpen(true)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                        >
                            <Icon icon="solar:maximize-square-bold" width={14} />
                            <span>Expand Fullscreen</span>
                        </button>
                    </div>

                    {parsedData ? (
                        <VisualDescriptionRenderer data={parsedData} />
                    ) : (
                        <div className="py-12 text-center text-xs text-gray-400">
                            No visual sections ready for preview. Paste HTML to begin.
                        </div>
                    )}
                </div>
            )}

            {/* ─── TAB 4: JSON DATA VIEW ─── */}
            {activeTab === "json" && (
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">Database JSON Value:</span>
                        <button
                            type="button"
                            onClick={() => {
                                if (value) {
                                    navigator.clipboard.writeText(value);
                                    setFeedback({ text: "JSON copied to clipboard!", type: "info" });
                                }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer flex items-center gap-1"
                        >
                            <Icon icon="solar:copy-bold" width={13} />
                            <span>Copy JSON</span>
                        </button>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-900 p-4 max-h-96 overflow-auto">
                        <pre className="text-xs font-mono text-cyan-300 whitespace-pre-wrap leading-relaxed">
                            {value || "// No JSON data saved yet"}
                        </pre>
                    </div>
                </div>
            )}

            {/* Responsive Fullscreen Preview Modal */}
            <VisualPreviewModal
                isOpen={isPreviewModalOpen}
                onClose={() => setIsPreviewModalOpen(false)}
                data={parsedData}
                productTitle={productTitle}
            />
        </div>
    );
}

/**
 * Inline Editor Component for a single section
 */
function SectionInlineEditor({
    section,
    onSave,
    onCancel,
}: {
    section: VisualSection;
    onSave: (updated: VisualSection) => void;
    onCancel: () => void;
}) {
    const [title, setTitle] = useState(section.title);
    const [badge, setBadge] = useState(section.badge || "");
    const [description, setDescription] = useState(section.description || "");
    const [html, setHtml] = useState(section.html);
    const [showHtmlCode, setShowHtmlCode] = useState(false);

    const handleSave = () => {
        onSave({
            ...section,
            title: title.trim(),
            badge: badge.trim() || undefined,
            description: description.trim() || undefined,
            html: html.trim(),
        });
    };

    return (
        <div className="p-4 bg-gray-50/80 border-t border-gray-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Section Title
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-hidden"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Eyebrow / Badge Text
                    </label>
                    <input
                        type="text"
                        value={badge}
                        onChange={(e) => setBadge(e.target.value)}
                        placeholder="e.g. Design, Camera, Highlights"
                        className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-hidden"
                    />
                </div>
            </div>

            <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Description Text
                </label>
                <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief section summary..."
                    className="w-full p-2 text-xs bg-white rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-hidden"
                />
            </div>

            <div>
                <button
                    type="button"
                    onClick={() => setShowHtmlCode(!showHtmlCode)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                    <Icon icon="solar:code-bold" width={13} />
                    <span>{showHtmlCode ? "Hide Section HTML Code" : "Edit Section HTML Code"}</span>
                </button>

                {showHtmlCode && (
                    <div className="mt-2 rounded-lg border border-gray-300 overflow-hidden bg-slate-950">
                        <textarea
                            rows={8}
                            value={html}
                            onChange={(e) => setHtml(e.target.value)}
                            className="w-full p-3 font-mono text-xs text-emerald-400 bg-transparent resize-y focus:outline-hidden"
                        />
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                    Save Section
                </button>
            </div>
        </div>
    );
}
