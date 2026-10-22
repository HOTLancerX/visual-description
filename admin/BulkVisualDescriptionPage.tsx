"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import VisualPreviewModal from "../ui/VisualPreviewModal";
import type { VisualDescriptionData } from "../types";

export interface ProductRow {
    id: string;
    title: string;
    slug: string;
    category?: string;
    status?: string;
    image?: string;
    hasVisualDescription: boolean;
    sectionCount: number;
    visualData?: VisualDescriptionData | null;
    selected?: boolean;

    // Sitemap & Crawl Match State
    matchedUrl?: string;
    matchedImage?: string;
    matchConfidence?: "exact" | "partial" | "manual" | "none";
    crawlStatus?: "idle" | "crawling" | "success" | "error";
    crawledData?: VisualDescriptionData | null;
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

export default function BulkVisualDescriptionPage() {
    // ─── Products & Listing State ───
    const [products, setProducts] = useState<ProductRow[]>([]);
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
    const [targetClass, setTargetClass] = useState("xiaomi-ux3b2-components");
    const [excludeIds, setExcludeIds] = useState("product-comparison, specs");
    const [excludeClasses, setExcludeClasses] = useState("ndovu-catalog-compare, ndovu-spec-tabs, ndovu-spec-surface, ndovu-pdp-tables");
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
        data: VisualDescriptionData | null;
        title: string;
    }>({ isOpen: false, data: null, title: "" });

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

                const res = await fetch(`/api/visual-description/posts?${params.toString()}`);
                const data = await res.json();

                if (!res.ok) {
                    setGlobalError(data.error || "Failed to load products.");
                    setProducts([]);
                    return;
                }

                const items: ProductRow[] = (data.posts || []).map((p: any) => {
                    // Check if already matched via sitemapMatches
                    const matched = sitemapMatches[p.slug];

                    return {
                        id: p.id,
                        title: p.title || "",
                        slug: p.slug || "",
                        category: p.category || "",
                        status: p.status || "draft",
                        image: p.image || "",
                        hasVisualDescription: Boolean(p.hasVisualDescription),
                        sectionCount: p.sectionCount || 0,
                        visualData: p.visualData || null,
                        selected: true,

                        matchedUrl: matched?.url || undefined,
                        matchedImage: matched?.imageUrl || undefined,
                        matchConfidence: matched?.confidence || (matched?.url ? "exact" : "none"),
                        crawlStatus: "idle",
                        crawledData: null,
                    };
                });

                setProducts(items);
                if (data.pagination) {
                    setPagination(data.pagination);
                }
            } catch {
                setGlobalError("Network error while loading products.");
                setProducts([]);
            } finally {
                setLoading(false);
            }
        },
        [page, limit, filter, search, category, sitemapMatches]
    );

    useEffect(() => {
        fetchProducts(page, limit, category);
    }, [fetchProducts, page, limit, category]);

    // ─── Fetch & Match Sitemaps ───
    const handleFetchSitemaps = async () => {
        const urls = sitemapInput
            .split("\n")
            .map((u) => u.trim())
            .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

        if (urls.length === 0) {
            setGlobalError("Please enter at least one valid sitemap URL.");
            return;
        }

        setIsFetchingSitemap(true);
        setGlobalError("");
        setSaveSuccessMessage("");

        try {
            // Collect all current product slugs
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

            // Update matching in current products list
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

            setSaveSuccessMessage(
                `Successfully matched ${data.matchedCount || 0} products from sitemaps!`
            );
        } catch (err: any) {
            setGlobalError(err.message || "Failed to connect to sitemap service.");
        } finally {
            setIsFetchingSitemap(false);
        }
    };

    const handleStopCrawling = () => {
        stopCrawlingRef.current = true;
    };

    // ─── Crawl & Convert Single or Selected Products (10 items/batch + Auto-Save) ───
    const handleCrawlProducts = async (targetProducts?: ProductRow[]) => {
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

        // Update crawlStatus to "crawling" for selected
        const toCrawlIds = new Set(toCrawl.map((p) => p.id));
        setProducts((prev) =>
            prev.map((p) => (toCrawlIds.has(p.id) ? { ...p, crawlStatus: "crawling", crawlError: undefined } : p))
        );

        // Process in batches of 10 items
        const BATCH_SIZE = 10;
        let processedCount = 0;
        let totalSavedCount = 0;

        for (let i = 0; i < toCrawl.length; i += BATCH_SIZE) {
            // Check stop signal
            if (stopCrawlingRef.current) {
                setSaveSuccessMessage(
                    `Crawling stopped by user. Processed ${processedCount} of ${toCrawl.length} products.`
                );
                break;
            }

            const chunk = toCrawl.slice(i, i + BATCH_SIZE);
            const payload = {
                items: chunk.map((p) => ({ id: p.id, url: p.matchedUrl! })),
                targetClass: targetClass.trim() || "xiaomi-ux3b2-components",
                excludeIds: excludeIds.split(",").map((s) => s.trim()).filter(Boolean),
                excludeClasses: excludeClasses.split(",").map((s) => s.trim()).filter(Boolean),
            };

            try {
                const res = await fetch("/api/visual-description/crawl", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();

                if (res.ok && Array.isArray(data.results)) {
                    const resultMap = new Map<string, any>();
                    const itemsToAutoSave: { id: string; visualData: any }[] = [];

                    data.results.forEach((r: any) => {
                        resultMap.set(r.id, r);
                        if (r.success && r.visualData) {
                            itemsToAutoSave.push({ id: r.id, visualData: r.visualData });
                        }
                    });

                    // Continuous Auto-Save to Database
                    if (autoSave && itemsToAutoSave.length > 0) {
                        try {
                            const saveRes = await fetch("/api/visual-description/save", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ items: itemsToAutoSave }),
                            });
                            if (saveRes.ok) {
                                totalSavedCount += itemsToAutoSave.length;
                            }
                        } catch (saveErr) {
                            console.error("Auto-save batch error:", saveErr);
                        }
                    }

                    // Update UI state for this batch
                    setProducts((prev) =>
                        prev.map((p) => {
                            if (!resultMap.has(p.id)) return p;
                            const resItem = resultMap.get(p.id);
                            if (resItem.success) {
                                return {
                                    ...p,
                                    crawlStatus: "success",
                                    crawledData: resItem.visualData,
                                    sectionCount: resItem.sectionCount,
                                    hasVisualDescription: autoSave ? true : p.hasVisualDescription,
                                    visualData: autoSave ? resItem.visualData : p.visualData,
                                };
                            } else {
                                return {
                                    ...p,
                                    crawlStatus: "error",
                                    crawlError: resItem.error || "Failed to parse content",
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
                    ? `Done! Successfully crawled and auto-saved ${totalSavedCount} products to the database.`
                    : "Crawling & JSON conversion complete! Review and click Save to Database."
            );
        }
    };

    // ─── Save Crawled Visual Descriptions to Database ───
    const handleSaveToDatabase = async (targetProducts?: ProductRow[]) => {
        const toSave = (targetProducts || products).filter(
            (p) => (targetProducts ? true : p.selected) && p.crawledData
        );

        if (toSave.length === 0) {
            setGlobalError("No crawled visual descriptions ready to save.");
            return;
        }

        setIsBatchSaving(true);
        setGlobalError("");
        setSaveSuccessMessage("");

        try {
            const payload = {
                items: toSave.map((p) => ({
                    id: p.id,
                    visualData: p.crawledData,
                })),
            };

            const res = await fetch("/api/visual-description/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) {
                setGlobalError(data.error || "Failed to save visual descriptions.");
                return;
            }

            const savedIds = new Set(toSave.map((p) => p.id));
            setProducts((prev) =>
                prev.map((p) => {
                    if (savedIds.has(p.id)) {
                        return {
                            ...p,
                            hasVisualDescription: true,
                            visualData: p.crawledData,
                            crawlStatus: "idle",
                        };
                    }
                    return p;
                })
            );

            setSaveSuccessMessage(
                `Successfully saved ${data.savedCount || toSave.length} visual descriptions to database!`
            );
        } catch (err: any) {
            setGlobalError(err.message || "Failed to save to database.");
        } finally {
            setIsBatchSaving(false);
        }
    };

    // ─── Manual URL Override ───
    const openManualUrlModal = (row: ProductRow) => {
        setManualUrlModal({
            isOpen: true,
            productId: row.id,
            productTitle: row.title,
            currentUrl: row.matchedUrl || "",
        });
    };

    const handleSaveManualUrl = () => {
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
    };

    // ─── Selection helpers ───
    const exactMatchedCount = useMemo(() => {
        return products.filter((p) => p.matchedUrl && p.matchConfidence === "exact").length;
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (filter === "matched") return products.filter((p) => p.matchedUrl);
        if (filter === "exact_matched") return products.filter((p) => p.matchedUrl && p.matchConfidence === "exact");
        if (filter === "crawled") return products.filter((p) => p.crawledData);
        return products;
    }, [products, filter]);

    const handleCrawlExactMatched = () => {
        const exactProducts = products.filter((p) => p.matchedUrl && p.matchConfidence === "exact");
        if (exactProducts.length === 0) {
            setGlobalError("No 100% exact matched products found to crawl. Please fetch and match sitemaps first!");
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

    const readyToSaveCount = products.filter((p) => p.crawledData).length;

    return (
        <div className="container space-y-6">
            {/* ─── Breadcrumb & Title ─── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Link href="/admin/product" className="hover:underline">
                            Products
                        </Link>
                        <span>/</span>
                        <span>Bulk Visual Description</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
                        <Icon icon="solar:layers-minimalistic-bold" className="w-7 h-7 text-indigo-600" />
                        Bulk Visual Description Manager
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Match store products against XML sitemaps, visually compare images side-by-side, crawl HTML
                        scenes, and convert them to rich structured JSON visual descriptions.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/admin/visual-description"
                        className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-1.5"
                    >
                        <Icon icon="solar:settings-bold" className="w-4 h-4 text-gray-500" />
                        Master CSS Settings
                    </Link>
                </div>
            </div>

            {/* ─── Feedback Messages ─── */}
            {saveSuccessMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm">
                    <div className="flex items-center gap-2">
                        <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>{saveSuccessMessage}</span>
                    </div>
                    <button
                        onClick={() => setSaveSuccessMessage("")}
                        className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {globalError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-sm">
                    <div className="flex items-center gap-2">
                        <Icon icon="solar:danger-triangle-bold" className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>{globalError}</span>
                    </div>
                    <button
                        onClick={() => setGlobalError("")}
                        className="text-rose-600 hover:text-rose-800 text-xs font-semibold"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* ─── Sitemaps & Crawler Configuration Panel ─── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
                        <Icon icon="solar:sitemap-bold" className="w-5 h-5 text-indigo-600" />
                        Sitemap Source & Target Class
                    </div>
                    {sitemapStats && (
                        <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">
                                Sitemaps: <strong className="text-gray-800">{sitemapStats.processed}</strong>
                            </span>
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
                                placeholder="xiaomi-ux3b2-components"
                                className="w-full text-xs font-mono p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                                <Icon icon="solar:shield-cross-bold" className="w-3.5 h-3.5" />
                                Bypass / Exclude IDs
                            </label>
                            <input
                                type="text"
                                value={excludeIds}
                                onChange={(e) => setExcludeIds(e.target.value)}
                                placeholder="product-comparison, specs"
                                title="Comma-separated IDs to bypass/remove (e.g. product-comparison, specs)"
                                className="w-full text-xs font-mono p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-400 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                                <Icon icon="solar:shield-cross-bold" className="w-3.5 h-3.5" />
                                Bypass / Exclude Classes
                            </label>
                            <input
                                type="text"
                                value={excludeClasses}
                                onChange={(e) => setExcludeClasses(e.target.value)}
                                placeholder="ndovu-catalog-compare, ndovu-spec-tabs, ndovu-spec-surface"
                                title="Comma-separated classes to bypass/remove (e.g. ndovu-catalog-compare, ndovu-spec-tabs)"
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
                            Automatically bypasses comparison tables & spec tabs.
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
                            Missing ({pagination.totalMissingCount})
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
                            Has Visual Desc ({pagination.totalCompletedCount})
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
                                title="Crawl all 100% exact matched products (10 per batch with auto-save)"
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
                                <th className="p-4 font-semibold min-w-70">
                                    Local Store Product
                                </th>
                                <th className="p-4 font-semibold min-w-[320px]">
                                    Matched Remote Product (Sitemap)
                                </th>
                                <th className="p-4 font-semibold w-40">
                                    Status
                                </th>
                                <th className="p-4 font-semibold text-right w-44">
                                    Actions
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Icon icon="solar:refresh-circle-bold" className="w-6 h-6 animate-spin text-indigo-600" />
                                            <span>Loading store products...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-400">
                                        No products matched the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`hover:bg-gray-50/80 transition-colors ${
                                            row.selected ? "bg-indigo-50/20" : ""
                                        }`}
                                    >
                                        {/* Checkbox */}
                                        <td className="p-4 align-top">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(row.selected)}
                                                onChange={() => toggleSelectRow(row.id)}
                                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mt-1"
                                            />
                                        </td>

                                        {/* Local Store Product Column */}
                                        <td className="p-4 align-top">
                                            <div className="flex items-start gap-3">
                                                {/* Product Image */}
                                                <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 shrink-0 overflow-hidden flex items-center justify-center">
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
                                                        <Icon icon="solar:gallery-bold" className="w-6 h-6 text-gray-300" />
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <Link
                                                        href={`/admin/product/${row.id}`}
                                                        target="_blank"
                                                        className="font-semibold text-gray-900 hover:text-indigo-600 line-clamp-1 text-sm"
                                                    >
                                                        {row.title}
                                                    </Link>
                                                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-500">
                                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                                                            {row.slug}
                                                        </span>
                                                        {row.category && (
                                                            <span className="text-gray-400">· {row.category}</span>
                                                        )}
                                                    </div>

                                                    {/* Current DB Visual Description badge */}
                                                    <div>
                                                        {row.hasVisualDescription ? (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                <Icon icon="solar:check-circle-bold" className="w-3 h-3 text-emerald-600" />
                                                                In Database ({row.sectionCount} sections)
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                                <Icon icon="solar:close-circle-linear" className="w-3 h-3 text-gray-400" />
                                                                Missing in DB
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Matched Remote Product Column (Side-by-Side Comparison) */}
                                        <td className="p-4 align-top">
                                            {row.matchedUrl ? (
                                                <div className="flex items-start gap-3">
                                                    {/* Remote Image from Sitemap */}
                                                    <div className="w-14 h-14 rounded-lg border border-indigo-200 bg-indigo-50/40 shrink-0 overflow-hidden flex items-center justify-center">
                                                        {row.matchedImage ? (
                                                            <img
                                                                src={row.matchedImage}
                                                                alt="Remote thumbnail"
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    (e.target as HTMLElement).style.display = "none";
                                                                }}
                                                            />
                                                        ) : (
                                                            <Icon icon="solar:link-circle-bold" className="w-6 h-6 text-indigo-300" />
                                                        )}
                                                    </div>

                                                    <div className="space-y-1 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                                                                    row.matchConfidence === "exact"
                                                                        ? "bg-emerald-100 text-emerald-800"
                                                                        : row.matchConfidence === "manual"
                                                                        ? "bg-purple-100 text-purple-800"
                                                                        : "bg-amber-100 text-amber-800"
                                                                }`}
                                                            >
                                                                {row.matchConfidence === "exact"
                                                                    ? "100% Slug Match"
                                                                    : row.matchConfidence === "manual"
                                                                    ? "Manual Override"
                                                                    : "Partial Match"}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-1.5">
                                                            <a
                                                                href={row.matchedUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-blue-600 hover:underline line-clamp-1 truncate font-mono"
                                                            >
                                                                {row.matchedUrl}
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => openManualUrlModal(row)}
                                                                title="Edit or change URL"
                                                                className="text-gray-400 hover:text-gray-600 shrink-0 p-1"
                                                            >
                                                                <Icon icon="solar:pen-linear" className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between p-2.5 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400">
                                                    <span className="text-[11px]">No sitemap match found</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openManualUrlModal(row)}
                                                        className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-100 text-[11px] font-medium"
                                                    >
                                                        Set URL
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        {/* Crawl & Conversion Status */}
                                        <td className="p-4 align-top">
                                            {row.crawlStatus === "crawling" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 animate-pulse">
                                                    <Icon icon="solar:refresh-circle-bold" className="w-3.5 h-3.5 animate-spin" />
                                                    Crawling...
                                                </span>
                                            )}
                                            {row.crawledData && (
                                                <div className="space-y-1">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                                        <Icon icon="solar:check-circle-bold" className="w-3 h-3 text-emerald-600" />
                                                        {row.crawledData.sections?.length || 0} Sections Ready
                                                    </span>
                                                    <span className="block text-[10px] text-gray-400">
                                                        Not saved yet
                                                    </span>
                                                </div>
                                            )}
                                            {row.crawlStatus === "error" && (
                                                <span
                                                    title={row.crawlError}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700"
                                                >
                                                    <Icon icon="solar:danger-circle-bold" className="w-3 h-3 text-rose-500" />
                                                    Crawl Failed
                                                </span>
                                            )}
                                            {!row.crawledData && row.crawlStatus !== "crawling" && row.crawlStatus !== "error" && (
                                                <span className="text-[11px] text-gray-400">
                                                    {row.matchedUrl ? "Ready to Crawl" : "Awaiting Match"}
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="p-4 align-top text-right space-y-1.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Live Preview Button */}
                                                {(row.crawledData || row.visualData) && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPreviewModal({
                                                                isOpen: true,
                                                                data: row.crawledData || row.visualData,
                                                                title: row.title,
                                                            })
                                                        }
                                                        title="Live Responsive Preview (Desktop, Tablet, Mobile)"
                                                        className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 rounded-lg transition-colors"
                                                    >
                                                        <Icon icon="solar:eye-bold" className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* View JSON button */}
                                                {(row.crawledData || row.visualData) && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setJsonModal({
                                                                isOpen: true,
                                                                title: row.title,
                                                                jsonString: JSON.stringify(
                                                                    row.crawledData || row.visualData,
                                                                    null,
                                                                    2
                                                                ),
                                                            })
                                                        }
                                                        title="Inspect Converted JSON"
                                                        className="p-1.5 text-gray-600 hover:text-purple-600 hover:bg-purple-50 border border-gray-200 rounded-lg transition-colors"
                                                    >
                                                        <Icon icon="solar:code-bold" className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Individual Crawl button */}
                                                {row.matchedUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCrawlProducts([row])}
                                                        disabled={isBatchCrawling}
                                                        title="Crawl this product"
                                                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors"
                                                    >
                                                        <Icon icon="solar:cloud-download-bold" className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Individual Save button */}
                                                {row.crawledData && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSaveToDatabase([row])}
                                                        disabled={isBatchSaving}
                                                        title="Save to Database"
                                                        className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors"
                                                    >
                                                        <Icon icon="solar:diskette-bold" className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ─── Pagination Footer ─── */}
                <div className="p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
                    <div>
                        Showing Page <strong>{pagination.page}</strong> of{" "}
                        <strong>{pagination.totalPages}</strong> ({pagination.total} total items)
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="px-2">
                            {page} / {pagination.totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                            disabled={page >= pagination.totalPages}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Live Preview Modal (Desktop, Tablet, Mobile) ─── */}
            <VisualPreviewModal
                isOpen={previewModal.isOpen}
                onClose={() => setPreviewModal({ isOpen: false, data: null, title: "" })}
                data={previewModal.data}
                productTitle={previewModal.title}
            />

            {/* ─── JSON Viewer Modal ─── */}
            {jsonModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-2">
                                <Icon icon="solar:code-bold" className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-bold text-gray-900 text-sm">
                                    Structured JSON: {jsonModal.title}
                                </h3>
                            </div>
                            <button
                                onClick={() => setJsonModal({ isOpen: false, title: "", jsonString: "" })}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-auto bg-gray-900 text-gray-100 font-mono text-xs">
                            <pre className="whitespace-pre-wrap">{jsonModal.jsonString}</pre>
                        </div>
                        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(jsonModal.jsonString);
                                    setSaveSuccessMessage("JSON copied to clipboard!");
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                            >
                                <Icon icon="solar:copy-bold" className="w-4 h-4" />
                                Copy JSON
                            </button>
                            <button
                                onClick={() => setJsonModal({ isOpen: false, title: "", jsonString: "" })}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Manual URL Override Modal ─── */}
            {manualUrlModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl border border-gray-100">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <h3 className="font-bold text-gray-900 text-sm">
                                Set Target Remote URL
                            </h3>
                            <button
                                onClick={() =>
                                    setManualUrlModal({
                                        isOpen: false,
                                        productId: "",
                                        currentUrl: "",
                                        productTitle: "",
                                    })
                                }
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-gray-600">
                                Target Product: <strong>{manualUrlModal.productTitle}</strong>
                            </p>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Remote Product Page URL:
                                </label>
                                <input
                                    type="text"
                                    value={manualUrlModal.currentUrl}
                                    onChange={(e) =>
                                        setManualUrlModal((prev) => ({ ...prev, currentUrl: e.target.value }))
                                    }
                                    placeholder="https://exelicgadgets.co.ke/product/..."
                                    className="w-full text-xs p-2.5 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-mono"
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() =>
                                    setManualUrlModal({
                                        isOpen: false,
                                        productId: "",
                                        currentUrl: "",
                                        productTitle: "",
                                    })
                                }
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveManualUrl}
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
