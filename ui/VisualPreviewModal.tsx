"use client";

/**
 * VisualPreviewModal.tsx
 *
 * Fullscreen live preview modal for Product Visual Descriptions.
 * Supports instant switching between Desktop, Tablet (768px), and Mobile (375px) viewports
 * to test layouts, sliders, multi-column grids, and CSS fidelity.
 */

import React, { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import type { VisualDescriptionData } from "../types";
import VisualDescriptionRenderer from "./VisualDescriptionRenderer";

export interface VisualPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: VisualDescriptionData | string | null;
    productTitle?: string;
}

type ViewportMode = "desktop" | "tablet" | "mobile";

export default function VisualPreviewModal({
    isOpen,
    onClose,
    data,
    productTitle = "Visual Description Preview",
}: VisualPreviewModalProps) {
    const [viewport, setViewport] = useState<ViewportMode>("desktop");

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Prevent body scrolling while modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    if (!isOpen) return null;

    let containerWidth = "max-w-6xl w-full";
    if (viewport === "tablet") containerWidth = "w-[768px] max-w-full";
    else if (viewport === "mobile") containerWidth = "w-[375px] max-w-full";

    return (
        <div className="fixed inset-0 z-9999 flex flex-col bg-slate-950/85 backdrop-blur-md transition-all">
            {/* Top Toolbar */}
            <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 md:px-6 flex items-center justify-between shrink-0 select-none">
                {/* Left: Title & Badge */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                        <Icon icon="solar:layers-minimalistic-bold" width={18} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Visual Description Preview</span>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                Live Simulator
                            </span>
                        </h2>
                        {productTitle && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs md:max-w-md">
                                {productTitle}
                            </p>
                        )}
                    </div>
                </div>

                {/* Center: Device Switcher */}
                <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 shadow-inner">
                    <button
                        type="button"
                        onClick={() => setViewport("desktop")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            viewport === "desktop"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        }`}
                        title="Desktop (100% responsive)"
                    >
                        <Icon icon="solar:laptop-minimalistic-bold" width={16} />
                        <span className="hidden md:inline">Desktop</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewport("tablet")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            viewport === "tablet"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        }`}
                        title="Tablet (768px)"
                    >
                        <Icon icon="solar:tablet-bold" width={16} />
                        <span className="hidden md:inline">Tablet (768px)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewport("mobile")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            viewport === "mobile"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        }`}
                        title="Mobile (375px)"
                    >
                        <Icon icon="solar:smartphone-bold" width={16} />
                        <span className="hidden md:inline">Mobile (375px)</span>
                    </button>
                </div>

                {/* Right: Close Action */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/30 flex items-center justify-center transition cursor-pointer"
                        title="Close preview (Esc)"
                    >
                        <Icon icon="solar:close-circle-bold" width={18} />
                    </button>
                </div>
            </div>

            {/* Scrollable Viewport Canvas */}
            <div className="grow overflow-y-auto p-4 md:p-8 flex justify-center items-start">
                <div
                    className={`${containerWidth} transition-all duration-300 ${
                        viewport !== "desktop"
                            ? "bg-white rounded-3xl shadow-2xl border-4 border-slate-800 p-4 md:p-6 my-4 ring-1 ring-slate-700/50"
                            : "bg-transparent"
                    }`}
                >
                    {/* Device Header Indicator for Mobile/Tablet */}
                    {viewport !== "desktop" && (
                        <div className="w-full flex items-center justify-between pb-3 mb-4 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <span>{viewport === "tablet" ? "iPad / Tablet 768px" : "iPhone / Mobile 375px"}</span>
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                100% Zoom
                            </span>
                        </div>
                    )}

                    <VisualDescriptionRenderer data={data} isInteractivePreview={true} />
                </div>
            </div>
        </div>
    );
}
