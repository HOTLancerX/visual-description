"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import type { SpecificationBox } from "../lib/specHtmlParser";

export interface SpecProductRow {
    id: string;
    title: string;
    slug: string;
    category?: string;
    status?: string;
    image?: string;
    hasSpecifications: boolean;
    boxCount: number;
    fieldCount: number;
    specifications?: SpecificationBox[] | null;
    selected?: boolean;

    // Sitemap & Crawl Match State
    matchedUrl?: string;
    matchedImage?: string;
    matchConfidence?: "exact" | "partial" | "manual" | "none";
    crawlStatus?: "idle" | "crawling" | "success" | "error";
    crawledSpecs?: SpecificationBox[] | null;
    crawlError?: string;
    isSaving?: boolean;
}

interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    totalMissingCount: number;
    totalCompletedCount: number;
    totalProducts: number;
}

export default function BulkSpecificationPage() {
    // ─── Products & Listing State ───
    const [products, setProducts] = useState<SpecProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(100);
    const [filter, setFilter] = useState<"all" | "missing" | "completed" | "matched" | "exact_matched" | "crawled">("all");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [categories, setCategories] = useState<{ _id: string; title: string }[]>([]);
    const [pagination, setPagination] = useState<PaginationInfo>({
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 1,
        totalMissingCount: 0,
        totalCompletedCount: 0,
        totalProducts: 0,
    });

    // ─── Sitemap & Crawler Configuration ───
    const [sitemapInput, setSitemapInput] = useState(
        "https://exelicgadgets.co.ke/product-sitemap.xml"
    );
    const [targetClass, setTargetClass] = useState("ndovu-scene-inner");
    const [excludeSelectors, setExcludeSelectors] = useState(
        "nav.ndovu-dedicated-links, #ndovu-specs-heading, .ndovu-section-subheading"
    );
    const [isFetchingSitemap, setIsFetchingSitemap] = useState(false);
    const [sitemapStats, setSitemapStats] = useState<{
        processed: number;
        found: number;
        matched: number;
    } | null>(null);

    // Persistent Map of matched sitemap URLs & images keyed by slug
    const [sitemapMatches, setSitemapMatches] = useState<
        Record<string, { url: string; imageUrl?: string; slug: string; confidence: "exact" | "partial" | "manual" }>
    >({});

    // ─── Batch Crawl & Save States ───
    const [isBatchCrawling, setIsBatchCrawling] = useState(false);
    const [crawlProgress, setCrawlProgress] = useState({ current: 0, total: 0 });
    const [isBatchSaving, setIsBatchSaving] = useState(false);
    const [autoSave, setAutoSave] = useState(true);
    const stopCrawlingRef = useRef(false);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState("");
    const [globalError, setGlobalError] = useState("");

    // ─── Modals State ───
    const [previewModal, setPreviewModal] = useState<{
        isOpen: boolean;
        specs: SpecificationBox[] | null;
        title: string;
    }>({ isOpen: false, specs: null, title: "" });

    const [jsonModal, setJsonModal] = useState<{
        isOpen: boolean;
        title: string;
        jsonString: string;
    }>({ isOpen: false, title: "", jsonString: "" });

    const [manualUrlModal, setManualUrlModal] = useState<{
        isOpen: boolean;
        productId: string;
        currentUrl: string;
        productTitle: string;
    }>({ isOpen: false, productId: "", currentUrl: "", productTitle: "" });

    // ─── Load categories for filter ───
    useEffect(() => {
        fetch("/api/product/import")
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d?.categories)) {
                    setCategories(d.categories);
                }
            })
            .catch(() => {});
    }, []);

    // ─── Fetch Products List ───
    const fetchProducts = useCallback(
        async (targetPage = page, targetLimit = limit, targetCategory = category) => {
            setLoading(true);
            setGlobalError("");
            try {
                const params = new URLSearchParams({
                    page: String(targetPage),
                    limit: String(targetLimit),
                    filter: filter === "matched" || filter === "exact_matched" || filter === "crawled" ? "all" : filter,
                    search,
                    ...(targetCategory && targetCategory !== "all" ? { category: targetCategory } : {}),
                });

                const res = await fetch(`/api/visual-description/specs/posts?${params.toString()}`);
                const data = await res.json();

                if (!res.ok) {
                    setGlobalError(data.error || "Failed to load products.");
                    return;
                }

                const rows: SpecProductRow[] = (data.items || []).map((item: any) => {
                    const existingMatch = sitemapMatches[item.slug];
                    return {
                        ...item,
                        selected: false,
                        matchedUrl: existingMatch?.url,
                        matchedImage: existingMatch?.imageUrl,
                        matchConfidence: existingMatch?.confidence || "none",
                        crawlStatus: "idle",
                    };
                });

                setProducts(rows);
                setPagination({
                    page: data.page,
                    limit: data.limit,
                    total: data.total,
                    totalPages: data.totalPages,
                    totalMissingCount: data.totalMissingCount,
                    totalCompletedCount: data.totalCompletedCount,
                    totalProducts: data.totalProducts,
                });
            } catch (err: any) {
                setGlobalError(err.message || "Network error loading products.");
            } finally {
                setLoading(false);
            }
        },
        [page, limit, filter, search, category, sitemapMatches]
    );

    useEffect(() => {
        fetchProducts(page, limit, category);
    }, [page, limit, filter, category]);

    // ─── Sitemap Fetch & Auto-Match ───
    const handleFetchSitemaps = async () => {
        const urls = sitemapInput
            .split("\n")
            .map((u) => u.trim())
            .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

        if (urls.length === 0) {
            setGlobalError("Please provide at least one valid HTTP/HTTPS sitemap URL.");
            return;
        }

        setIsFetchingSitemap(true);
        setGlobalError("");
        setSaveSuccessMessage("");

        try {
            const localSlugs = products.map((p) => p.slug).filter(Boolean);

            const res = await fetch("/api/visual-description/sitemap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sitemapUrls: urls,
                    localSlugs,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setGlobalError(data.error || "Failed to process sitemaps.");
                return;
            }

            const newMatches = { ...sitemapMatches, ...(data.matches || {}) };
            setSitemapMatches(newMatches);

            setSitemapStats({
                processed: data.totalSitemapsProcessed || urls.length,
                found: data.totalSitemapItemsFound || 0,
                matched: data.matchedCount || Object.keys(newMatches).length,
            });

            setProducts((prev) =>
                prev.map((p) => {
                    const match = newMatches[p.slug];
                    if (match) {
                        return {
                            ...p,
                            matchedUrl: match.url,
                            matchedImage: match.imageUrl,
                            matchConfidence: match.confidence,
                        };
                    }
                    return p;
                })
            );

            setSaveSuccessMessage(`Successfully matched ${data.matchedCount || 0} products from sitemaps!`);
        } catch (err: any) {
            setGlobalError(err.message || "Failed to connect to sitemap service.");
        } finally {
            setIsFetchingSitemap(false);
        }
    };

    const handleStopCrawling = () => {
        stopCrawlingRef.current = true;
    };

    // ─── Crawl & Convert Specifications (10 items/batch + Auto-Save) ───
    const handleCrawlProducts = async (targetProducts?: SpecProductRow[]) => {
        const toCrawl = (targetProducts || products).filter(
            (p) => (targetProducts ? true : p.selected) && p.matchedUrl
        );

        if (toCrawl.length === 0) {
            setGlobalError("No products with matched URLs selected for crawling.");
            return;
        }

        stopCrawlingRef.current = false;
        setIsBatchCrawling(true);
        setGlobalError("");
        setSaveSuccessMessage("");
        setCrawlProgress({ current: 0, total: toCrawl.length });

        const toCrawlIds = new Set(toCrawl.map((p) => p.id));
        setProducts((prev) =>
            prev.map((p) => (toCrawlIds.has(p.id) ? { ...p, crawlStatus: "crawling", crawlError: undefined } : p))
        );

        const BATCH_SIZE = 10;
        let processedCount = 0;
        let totalSavedCount = 0;

        const excludeList = excludeSelectors.split(",").map((s) => s.trim()).filter(Boolean);

        for (let i = 0; i < toCrawl.length; i += BATCH_SIZE) {
            if (stopCrawlingRef.current) {
                setSaveSuccessMessage(
                    `Crawling stopped by user. Processed ${processedCount} of ${toCrawl.length} products.`
                );
                break;
            }

            const chunk = toCrawl.slice(i, i + BATCH_SIZE);
            const payload = {
                items: chunk.map((p) => ({ id: p.id, url: p.matchedUrl! })),
                targetClass: targetClass.trim() || "ndovu-scene-inner",
                excludeSelectors: excludeList,
            };

            try {
                const res = await fetch("/api/visual-description/specs/crawl", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();

                if (res.ok && Array.isArray(data.results)) {
                    const resultMap = new Map<string, any>();
                    const itemsToAutoSave: { id: string; specifications: SpecificationBox[] }[] = [];

                    data.results.forEach((r: any) => {
                        resultMap.set(r.id, r);
                        if (r.success && Array.isArray(r.specifications)) {
                            itemsToAutoSave.push({ id: r.id, specifications: r.specifications });
                        }
                    });

                    // Continuous Auto-Save to Database
                    if (autoSave && itemsToAutoSave.length > 0) {
                        try {
                            const saveRes = await fetch("/api/visual-description/specs/save", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ items: itemsToAutoSave }),
                            });
                            if (saveRes.ok) {
                                totalSavedCount += itemsToAutoSave.length;
                            }
                        } catch (saveErr) {
                            console.error("Auto-save specs error:", saveErr);
                        }
                    }

                    // Update UI state
                    setProducts((prev) =>
                        prev.map((p) => {
                            if (!resultMap.has(p.id)) return p;
                            const resItem = resultMap.get(p.id);
                            if (resItem.success) {
                                return {
                                    ...p,
                                    crawlStatus: "success",
                                    crawledSpecs: resItem.specifications,
                                    boxCount: resItem.boxCount,
                                    fieldCount: resItem.fieldCount,
                                    hasSpecifications: autoSave ? true : p.hasSpecifications,
                                    specifications: autoSave ? resItem.specifications : p.specifications,
                                };
                            } else {
                                return {
                                    ...p,
                                    crawlStatus: "error",
                                    crawlError: resItem.error || "Failed to parse specifications",
                                };
                            }
                        })
                    );
                }
            } catch (err: any) {
                chunk.forEach((p) => {
                    setProducts((prev) =>
                        prev.map((item) =>
                            item.id === p.id
                                ? { ...item, crawlStatus: "error", crawlError: err.message || "Network error" }
                                : item
                        )
                    );
                });
            }

            processedCount += chunk.length;
            setCrawlProgress({ current: Math.min(processedCount, toCrawl.length), total: toCrawl.length });
        }

        setIsBatchCrawling(false);
        if (!stopCrawlingRef.current) {
            setSaveSuccessMessage(
                autoSave
                    ? `Done! Successfully crawled and auto-saved ${totalSavedCount} product specifications to database.`
                    : "Crawling complete! Review specifications and click Save to Database."
            );
        }
    };

    // ─── Manual Save to Database ───
    const handleSaveToDatabase = async (targetProducts?: SpecProductRow[]) => {
        const toSave = (targetProducts || products).filter(
            (p) => (targetProducts ? true : p.selected) && p.crawledSpecs
        );

        if (toSave.length === 0) {
            setGlobalError("No crawled specifications ready to save.");
            return;
        }

        setIsBatchSaving(true);
        setGlobalError("");
        setSaveSuccessMessage("");

        try {
            const payload = {
                items: toSave.map((p) => ({
                    id: p.id,
                    specifications: p.crawledSpecs,
                })),
            };

            const res = await fetch("/api/visual-description/specs/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) {
                setGlobalError(data.error || "Failed to save specifications.");
                return;
            }

            const savedIds = new Set(toSave.map((p) => p.id));
            setProducts((prev) =>
                prev.map((p) => {
                    if (savedIds.has(p.id)) {
                        return {
                            ...p,
                            hasSpecifications: true,
                            specifications: p.crawledSpecs,
                            crawlStatus: "idle",
                        };
                    }
                    return p;
                })
            );

            setSaveSuccessMessage(`Successfully saved ${data.savedCount || toSave.length} specifications to database!`);
        } catch (err: any) {
            setGlobalError(err.message || "Failed to save to database.");
        } finally {
            setIsBatchSaving(false);
        }
    };

    // ─── Selection helpers ───
    const exactMatchedCount = useMemo(() => {
        return products.filter((p) => p.matchedUrl && p.matchConfidence === "exact").length;
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (filter === "matched") return products.filter((p) => p.matchedUrl);
        if (filter === "exact_matched") return products.filter((p) => p.matchedUrl && p.matchConfidence === "exact");
        if (filter === "crawled") return products.filter((p) => p.crawledSpecs);
        return products;
    }, [products, filter]);

    const handleCrawlExactMatched = () => {
        const exactProducts = products.filter((p) => p.matchedUrl && p.matchConfidence === "exact");
        if (exactProducts.length === 0) {
            setGlobalError("No 100% exact matched products found to crawl. Fetch sitemaps first!");
            return;
        }
        handleCrawlProducts(exactProducts);
    };

    const selectedCount = filteredProducts.filter((p) => p.selected).length;
    const allSelected = filteredProducts.length > 0 && selectedCount === filteredProducts.length;

    const toggleSelectAll = () => {
        const next = !allSelected;
        setProducts((prev) => prev.map((p) => ({ ...p, selected: next })));
    };

    const toggleSelectRow = (id: string) => {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
    };

    const readyToSaveCount = products.filter((p) => p.crawledSpecs).length;

    return (
        <div className="container space-y-6">
            {/* ─── Breadcrumb & Title ─── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Link href="/admin/posts/product" className="hover:text-indigo-600 transition-colors">
                            Products
                        </Link>
                        <span>/</span>
                        <span className="text-gray-900 font-medium">Bulk Specifications</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
                        <Icon icon="solar:checklist-minimalistic-bold" className="w-7 h-7 text-indigo-600" />
                        Bulk Product Specifications
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Crawl technical specifications from remote product pages into structured SpecificationBox categories with 10-batch auto-save.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchProducts(page, limit, category)}
                        disabled={loading}
                        className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all flex items-center gap-1.5"
                    >
                        <Icon icon="solar:refresh-circle-bold" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <Link
                        href="/admin/visual-description/bulk"
                        className="px-3.5 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 shadow-sm transition-all flex items-center gap-1.5"
                    >
                        <Icon icon="solar:layers-minimalistic-bold" className="w-4 h-4" />
                        Bulk Visual Description
                    </Link>
                </div>
            </div>

            {/* ─── Success & Error Banners ─── */}
            {saveSuccessMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                        <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="font-medium">{saveSuccessMessage}</span>
                    </div>
                    <button onClick={() => setSaveSuccessMessage("")} className="text-emerald-500 hover:text-emerald-700">
                        <Icon icon="solar:close-circle-linear" className="w-4 h-4" />
                    </button>
                </div>
            )}

            {globalError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-800">
                    <div className="flex items-center gap-2">
                        <Icon icon="solar:danger-triangle-bold" className="w-5 h-5 text-red-600 shrink-0" />
                        <span className="font-medium">{globalError}</span>
                    </div>
                    <button onClick={() => setGlobalError("")} className="text-red-500 hover:text-red-700">
                        <Icon icon="solar:close-circle-linear" className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ─── Sitemap & Crawler Configuration ─── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <Icon icon="solar:link-circle-bold" className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">Sitemap & Specs Crawler Setup</h2>
                            <p className="text-[11px] text-gray-500">
                                Match product slugs and extract specification boxes from target container.
                            </p>
                        </div>
                    </div>

                    {sitemapStats && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">
                                URLs Found: <strong className="text-gray-800">{sitemapStats.found}</strong>
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                Matched: {sitemapStats.matched}
                            </span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    {/* Sitemaps textarea */}
                    <div className="lg:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium text-gray-700 flex items-center justify-between">
                            <span>Sitemap URL(s) (one per line)</span>
                            <span className="text-gray-400 font-normal">Supports multiple & sitemap indexes</span>
                        </label>
                        <textarea
                            rows={3}
                            value={sitemapInput}
                            onChange={(e) => setSitemapInput(e.target.value)}
                            placeholder="https://exelicgadgets.co.ke/product-sitemap.xml"
                            className="w-full text-xs font-mono p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    {/* Target Class & Excluded Selectors */}
                    <div className="space-y-2">
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-gray-700">Target Container Class</label>
                            <input
                                type="text"
                                value={targetClass}
                                onChange={(e) => setTargetClass(e.target.value)}
                                placeholder="ndovu-scene-inner"
                                className="w-full text-xs font-mono p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                                <Icon icon="solar:shield-cross-bold" className="w-3.5 h-3.5" />
                                Remove / Bypass Selectors
                            </label>
                            <input
                                type="text"
                                value={excludeSelectors}
                                onChange={(e) => setExcludeSelectors(e.target.value)}
                                placeholder="nav.ndovu-dedicated-links, #ndovu-specs-heading, .ndovu-section-subheading"
                                title="Comma-separated CSS selectors to remove (e.g. comparisons nav, heading, subtitle)"
                                className="w-full text-xs font-mono p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-400 outline-none"
                            />
                        </div>
                    </div>

                    {/* Fetch & Match button */}
                    <div className="flex flex-col justify-end">
                        <button
                            type="button"
                            onClick={handleFetchSitemaps}
                            disabled={isFetchingSitemap}
                            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isFetchingSitemap ? (
                                <>
                                    <Icon icon="solar:refresh-circle-bold" className="w-4 h-4 animate-spin" />
                                    Fetching & Matching Sitemaps...
                                </>
                            ) : (
                                <>
                                    <Icon icon="solar:magnifer-bold" className="w-4 h-4" />
                                    Fetch & Match Sitemaps
                                </>
                            )}
                        </button>
                        <p className="text-[11px] text-gray-400 mt-2 text-center">
                            Automatically removes comparison links & subtitles.
                        </p>
                    </div>
                </div>
            </div>

            {/* ─── Batch Operations & Filters Bar ─── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Status Tabs */}
                    <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs">
                        <button
                            onClick={() => {
                                setFilter("all");
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            All ({pagination.totalProducts})
                        </button>
                        <button
                            onClick={() => {
                                setFilter("missing");
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filter === "missing"
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            Missing Specs ({pagination.totalMissingCount})
                        </button>
                        <button
                            onClick={() => {
                                setFilter("completed");
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filter === "completed"
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            Has Specs ({pagination.totalCompletedCount})
                        </button>
                        <button
                            onClick={() => setFilter("matched")}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                filter === "matched"
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                        >
                            All Matched ({Object.keys(sitemapMatches).length})
                        </button>
                        <button
                            onClick={() => {
                                setFilter("exact_matched");
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                                filter === "exact_matched"
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50"
                            }`}
                        >
                            <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5" />
                            100% Matched ({exactMatchedCount})
                        </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Auto-Save Toggle */}
                        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl hover:bg-emerald-100/60 transition-colors">
                            <input
                                type="checkbox"
                                checked={autoSave}
                                onChange={(e) => setAutoSave(e.target.checked)}
                                className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                            />
                            <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                                <Icon icon="solar:diskette-bold" className="w-3.5 h-3.5 text-emerald-600" />
                                Continuous Auto-Save (Every 10)
                            </span>
                        </label>

                        {/* Stop Crawling Button (shown when crawling is active) */}
                        {isBatchCrawling && (
                            <button
                                type="button"
                                onClick={handleStopCrawling}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 animate-pulse"
                            >
                                <Icon icon="solar:stop-circle-bold" className="w-4 h-4" />
                                Stop Crawling ({crawlProgress.current}/{crawlProgress.total})
                            </button>
                        )}

                        {/* 100% Matched Crawl Action */}
                        {!isBatchCrawling && (
                            <button
                                type="button"
                                onClick={handleCrawlExactMatched}
                                disabled={exactMatchedCount === 0}
                                className="px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                                title="Crawl all 100% exact matched specifications (10 per batch with auto-save)"
                            >
                                <Icon icon="solar:check-read-bold" className="w-4 h-4" />
                                Crawl 100% Matched ({exactMatchedCount})
                            </button>
                        )}

                        {!isBatchCrawling && (
                            <button
                                type="button"
                                onClick={() => handleCrawlProducts()}
                                disabled={selectedCount === 0}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                            >
                                <Icon icon="solar:cloud-download-bold" className="w-4 h-4" />
                                Crawl Selected ({selectedCount})
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => handleSaveToDatabase()}
                            disabled={isBatchSaving || isBatchCrawling || readyToSaveCount === 0}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                        >
                            {isBatchSaving ? (
                                <>
                                    <Icon icon="solar:refresh-circle-bold" className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Icon icon="solar:diskette-bold" className="w-4 h-4" />
                                    Save to DB ({readyToSaveCount})
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Search & Category Filter */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex items-center gap-3 flex-1 min-w-70">
                        <div className="relative flex-1">
                            <Icon
                                icon="solar:magnifer-linear"
                                className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                            />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search products by title or slug..."
                                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500"
                            />
                        </div>

                        {categories.length > 0 && (
                            <select
                                value={category}
                                onChange={(e) => {
                                    setCategory(e.target.value);
                                    setPage(1);
                                }}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
                            >
                                <option value="all">All Categories</option>
                                {categories.map((c) => (
                                    <option key={c._id} value={c._id}>
                                        {c.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-gray-500">
                        <span>Items per page:</span>
                        <select
                            value={limit}
                            onChange={(e) => {
                                const newLimit = Number(e.target.value);
                                setLimit(newLimit);
                                setPage(1);
                                fetchProducts(1, newLimit);
                            }}
                            className="px-2 py-1 border border-gray-200 rounded-lg outline-none bg-white text-xs font-semibold text-gray-700"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={250}>250</option>
                            <option value={500}>500</option>
                            <option value={1000}>1,000</option>
                            <option value={2000}>2,000</option>
                            <option value={3000}>3,000 (Load All)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ─── Side-by-Side Product Table ─── */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-700">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[11px]">
                            <tr>
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                    />
                                </th>
                                <th className="p-4 min-w-72">Store Product (Local)</th>
                                <th className="p-4 min-w-80">Matched Remote Page (Sitemap)</th>
                                <th className="p-4 w-44">Specifications Status</th>
                                <th className="p-4 w-36 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Icon icon="solar:refresh-circle-bold" className="w-6 h-6 animate-spin text-indigo-600" />
                                            <span>Loading products...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-400">
                                        No products found for the selected filter.
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((row) => {
                                    const activeSpecs = row.crawledSpecs || row.specifications;
                                    const boxCount = row.crawledSpecs ? row.boxCount : row.boxCount;
                                    const fieldCount = row.crawledSpecs ? row.fieldCount : row.fieldCount;

                                    return (
                                        <tr
                                            key={row.id}
                                            className={`hover:bg-gray-50/80 transition-colors ${
                                                row.selected ? "bg-indigo-50/30" : ""
                                            }`}
                                        >
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={!!row.selected}
                                                    onChange={() => toggleSelectRow(row.id)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                                />
                                            </td>

                                            {/* Local Product Column */}
                                            <td className="p-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                                                        {row.image ? (
                                                            <img
                                                                src={row.image}
                                                                alt={row.title}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    (e.target as HTMLElement).style.display = "none";
                                                                }}
                                                            />
                                                        ) : (
                                                            <Icon icon="solar:box-minimalistic-linear" className="w-5 h-5 text-gray-400" />
                                                        )}
                                                    </div>

                                                    <div className="space-y-1 min-w-0">
                                                        <h3 className="font-semibold text-gray-900 truncate max-w-sm" title={row.title}>
                                                            {row.title}
                                                        </h3>
                                                        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono truncate">
                                                            <span>/{row.slug}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Matched Remote Page Column */}
                                            <td className="p-4">
                                                {row.matchedUrl ? (
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center relative group">
                                                            {row.matchedImage ? (
                                                                <img
                                                                    src={row.matchedImage}
                                                                    alt="Remote"
                                                                    className="w-full h-full object-cover"
                                                                    onError={(e) => {
                                                                        (e.target as HTMLElement).style.display = "none";
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Icon icon="solar:gallery-minimalistic-linear" className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </div>

                                                        <div className="space-y-1 min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {row.matchConfidence === "exact" && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                                                        100% Match
                                                                    </span>
                                                                )}
                                                                {row.matchConfidence === "partial" && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                                                        Partial Match
                                                                    </span>
                                                                )}
                                                                {row.matchConfidence === "manual" && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                                                        Manual
                                                                    </span>
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setManualUrlModal({
                                                                            isOpen: true,
                                                                            productId: row.id,
                                                                            productTitle: row.title,
                                                                            currentUrl: row.matchedUrl || "",
                                                                        })
                                                                    }
                                                                    className="text-gray-400 hover:text-indigo-600 transition-colors text-[11px] underline"
                                                                >
                                                                    Edit URL
                                                                </button>
                                                            </div>

                                                            <a
                                                                href={row.matchedUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-indigo-600 hover:text-indigo-800 text-[11px] truncate block font-mono max-w-xs"
                                                                title={row.matchedUrl}
                                                            >
                                                                {row.matchedUrl}
                                                            </a>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <Icon icon="solar:link-broken-minimalistic-linear" className="w-4 h-4 text-gray-300" />
                                                        <span className="text-[11px]">No sitemap match found</span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setManualUrlModal({
                                                                    isOpen: true,
                                                                    productId: row.id,
                                                                    productTitle: row.title,
                                                                    currentUrl: "",
                                                                })
                                                            }
                                                            className="text-indigo-600 hover:underline text-[11px] ml-1"
                                                        >
                                                            Add URL
                                                        </button>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Specifications Status Column */}
                                            <td className="p-4">
                                                <div className="space-y-1">
                                                    {row.crawlStatus === "crawling" ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 animate-pulse">
                                                            <Icon icon="solar:refresh-circle-bold" className="w-3.5 h-3.5 animate-spin" />
                                                            Crawling...
                                                        </span>
                                                    ) : row.crawlStatus === "error" ? (
                                                        <span
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700"
                                                            title={row.crawlError}
                                                        >
                                                            <Icon icon="solar:danger-triangle-bold" className="w-3.5 h-3.5" />
                                                            Crawl Error
                                                        </span>
                                                    ) : row.crawledSpecs ? (
                                                        <div className="space-y-0.5">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                                                <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5" />
                                                                {row.hasSpecifications ? "Saved" : "Crawled (Ready)"}
                                                            </span>
                                                            <div className="text-[11px] text-gray-500 font-medium">
                                                                {boxCount} boxes • {fieldCount} fields
                                                            </div>
                                                        </div>
                                                    ) : row.hasSpecifications ? (
                                                        <div className="space-y-0.5">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                <Icon icon="solar:check-read-bold" className="w-3.5 h-3.5 text-emerald-600" />
                                                                Has Specs
                                                            </span>
                                                            <div className="text-[11px] text-gray-500 font-medium">
                                                                {boxCount} boxes • {fieldCount} fields
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                            <Icon icon="solar:minus-circle-linear" className="w-3.5 h-3.5" />
                                                            Missing
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Action Buttons Column */}
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Preview Button */}
                                                    {activeSpecs && activeSpecs.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setPreviewModal({
                                                                    isOpen: true,
                                                                    specs: activeSpecs,
                                                                    title: row.title,
                                                                })
                                                            }
                                                            title="Preview Structured Specification Boxes"
                                                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        >
                                                            <Icon icon="solar:eye-bold" className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    {/* JSON Inspector */}
                                                    {activeSpecs && activeSpecs.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setJsonModal({
                                                                    isOpen: true,
                                                                    title: `${row.title} — Specifications JSON`,
                                                                    jsonString: JSON.stringify(activeSpecs, null, 2),
                                                                })
                                                            }
                                                            title="View JSON"
                                                            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                        >
                                                            <Icon icon="solar:code-bold" className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    {/* Single Crawl */}
                                                    {row.matchedUrl && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCrawlProducts([row])}
                                                            disabled={row.crawlStatus === "crawling" || isBatchCrawling}
                                                            title="Crawl this product page"
                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30"
                                                        >
                                                            <Icon icon="solar:cloud-download-bold" className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                    <div>
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, pagination.total)} of{" "}
                        <strong className="text-gray-900">{pagination.total}</strong> products
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1.5 font-medium text-gray-800">
                            Page {page} of {pagination.totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                            disabled={page >= pagination.totalPages}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Specification Preview Modal ─── */}
            {previewModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2.5">
                                <Icon icon="solar:checklist-minimalistic-bold" className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-gray-900">{previewModal.title} — Specifications</h3>
                            </div>
                            <button
                                onClick={() => setPreviewModal({ isOpen: false, specs: null, title: "" })}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {previewModal.specs && previewModal.specs.length > 0 ? (
                                <div className="space-y-6">
                                    {previewModal.specs.map((box, bIdx) => (
                                        <div key={bIdx} className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 font-bold text-gray-900 text-sm flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                                                {box.title}
                                            </div>
                                            <div className="divide-y divide-gray-100 text-xs">
                                                {box.fields.map((f, fIdx) => (
                                                    <div key={fIdx} className="grid grid-cols-1 md:grid-cols-3 p-3 hover:bg-gray-50/50">
                                                        <div className="font-semibold text-gray-600">{f.title}</div>
                                                        <div className="md:col-span-2 text-gray-900">{f.description}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 py-10">No specifications found.</p>
                            )}
                        </div>

                        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setPreviewModal({ isOpen: false, specs: null, title: "" })}
                                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Raw JSON Modal ─── */}
            {jsonModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-2.5">
                                <Icon icon="solar:code-bold" className="w-5 h-5 text-amber-600" />
                                <h3 className="text-sm font-bold text-gray-900">{jsonModal.title}</h3>
                            </div>
                            <button
                                onClick={() => setJsonModal({ isOpen: false, title: "", jsonString: "" })}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto bg-gray-950 font-mono text-xs text-emerald-400 leading-relaxed select-all">
                            <pre>{jsonModal.jsonString}</pre>
                        </div>

                        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(jsonModal.jsonString);
                                    setSaveSuccessMessage("JSON copied to clipboard!");
                                    setJsonModal({ isOpen: false, title: "", jsonString: "" });
                                }}
                                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                                <Icon icon="solar:copy-bold" className="w-4 h-4" />
                                Copy JSON
                            </button>
                            <button
                                onClick={() => setJsonModal({ isOpen: false, title: "", jsonString: "" })}
                                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Manual URL Override Modal ─── */}
            {manualUrlModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                            <h3 className="text-sm font-bold text-gray-900">Set Remote Page URL</h3>
                            <button
                                onClick={() => setManualUrlModal({ isOpen: false, productId: "", currentUrl: "", productTitle: "" })}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                            >
                                <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500">
                                Product: <strong className="text-gray-900">{manualUrlModal.productTitle}</strong>
                            </p>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-700">Remote Product Page URL</label>
                                <input
                                    type="text"
                                    value={manualUrlModal.currentUrl}
                                    onChange={(e) => setManualUrlModal((prev) => ({ ...prev, currentUrl: e.target.value }))}
                                    placeholder="https://exelicgadgets.co.ke/product/example-slug/"
                                    className="w-full text-xs font-mono p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => setManualUrlModal({ isOpen: false, productId: "", currentUrl: "", productTitle: "" })}
                                className="px-3.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const { productId, currentUrl } = manualUrlModal;
                                    if (!productId || !currentUrl.trim()) return;
                                    setProducts((prev) =>
                                        prev.map((p) => {
                                            if (p.id === productId) {
                                                const updatedMatch = {
                                                    url: currentUrl.trim(),
                                                    imageUrl: p.matchedImage,
                                                    slug: p.slug,
                                                    confidence: "manual" as const,
                                                };
                                                setSitemapMatches((m) => ({ ...m, [p.slug]: updatedMatch }));
                                                return {
                                                    ...p,
                                                    matchedUrl: currentUrl.trim(),
                                                    matchConfidence: "manual",
                                                };
                                            }
                                            return p;
                                        })
                                    );
                                    setManualUrlModal({ isOpen: false, productId: "", currentUrl: "", productTitle: "" });
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
                            >
                                Save URL
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
