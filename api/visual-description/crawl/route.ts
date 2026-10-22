import { NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { parseHtmlToVisualData } from "../../../lib/htmlToJsonParser";

export const dynamic = "force-dynamic";

export interface CrawlRequestItem {
    id: string;
    url: string;
}

export interface CrawlResultItem {
    id: string;
    url: string;
    success: boolean;
    sectionCount: number;
    visualData?: any;
    error?: string;
}

async function crawlSingleProduct(
    url: string,
    targetClass = "xiaomi-ux3b2-components",
    excludeIds: string[] = ["product-comparison", "specs"],
    excludeClasses: string[] = ["ndovu-catalog-compare", "ndovu-spec-tabs", "ndovu-spec-surface", "ndovu-pdp-tables"]
): Promise<{ html: string; customCss: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch product page`);
    }

    const pageHtml = await res.text();
    const dom = new JSDOM(pageHtml);
    const doc = dom.window.document;

    // 0. Remove bypassed / excluded elements from DOM before extracting container
    excludeIds.forEach((rawId) => {
        const clean = rawId.trim().replace(/^#/, "");
        if (!clean) return;
        try {
            doc.querySelectorAll(`#${clean}, [id="${clean}"]`).forEach((el) => el.remove());
        } catch {}
    });

    excludeClasses.forEach((rawCls) => {
        const clean = rawCls.trim().replace(/^\./, "");
        if (!clean) return;
        try {
            doc.querySelectorAll(`.${clean}, [class*="${clean}"]`).forEach((el) => el.remove());
        } catch {}
    });

    // 1. Extract target container
    const cleanClass = targetClass.replace(/^\./, "").trim();
    let container = doc.querySelector(`.${cleanClass}`);

    // Fallbacks if container class not matched directly
    if (!container) {
        container = doc.querySelector(".xiaomi-ux3b2-components, .xiaomi-story-system, .ndovu-has-scenes, #ndovu-why, .ndovu-why");
    }

    // Clean container if matched
    if (container) {
        excludeIds.forEach((rawId) => {
            const clean = rawId.trim().replace(/^#/, "");
            if (!clean) return;
            try {
                container.querySelectorAll(`#${clean}, [id="${clean}"]`).forEach((el) => el.remove());
            } catch {}
        });
        excludeClasses.forEach((rawCls) => {
            const clean = rawCls.trim().replace(/^\./, "");
            if (!clean) return;
            try {
                container.querySelectorAll(`.${clean}, [class*="${clean}"]`).forEach((el) => el.remove());
            } catch {}
        });
    }

    // Secondary fallback: find collection of article.ndovu-scene elements
    let extractedHtml = "";
    if (container) {
        extractedHtml = container.outerHTML;
    } else {
        const scenes = Array.from(doc.querySelectorAll("article.ndovu-scene, section.ndovu-why"));
        if (scenes.length > 0) {
            extractedHtml = `<div class="${cleanClass}">\n${scenes.map((s) => s.outerHTML).join("\n")}\n</div>`;
        }
    }

    if (!extractedHtml || extractedHtml.trim().length === 0) {
        throw new Error(`Target container class ".${cleanClass}" not found in page.`);
    }

    // 2. Extract inline styles that define variables or scene overrides
    const styleTags = Array.from(doc.querySelectorAll("style"));
    const cssParts: string[] = [];
    styleTags.forEach((st) => {
        const content = st.textContent || "";
        if (content.includes("ndovu-why") || content.includes("xiaomi-ux3b2") || content.includes("ndovu-scene") || content.includes("data-ndovu-design")) {
            cssParts.push(content);
        }
    });

    return {
        html: extractedHtml,
        customCss: cssParts.join("\n\n"),
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            items = [],
            targetClass = "xiaomi-ux3b2-components",
            excludeIds = ["product-comparison", "specs"],
            excludeClasses = ["ndovu-catalog-compare", "ndovu-spec-tabs", "ndovu-spec-surface", "ndovu-pdp-tables"],
        } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided for crawling." }, { status: 400 });
        }

        // Limit per batch to 30 items for server safety
        const batch = items.slice(0, 30);
        // Crawl all items in the batch in parallel
        const results: CrawlResultItem[] = await Promise.all(
            batch.map(async (item): Promise<CrawlResultItem> => {
                try {
                    if (!item.url || !item.url.startsWith("http")) {
                        return {
                            id: item.id,
                            url: item.url || "",
                            success: false,
                            sectionCount: 0,
                            error: "Invalid or empty product URL.",
                        };
                    }

                    const { html, customCss } = await crawlSingleProduct(item.url, targetClass, excludeIds, excludeClasses);
                    const visualData = parseHtmlToVisualData(html, customCss, excludeIds, excludeClasses);

                    return {
                        id: item.id,
                        url: item.url,
                        success: true,
                        sectionCount: visualData.sections?.length || 0,
                        visualData,
                    };
                } catch (err: any) {
                    return {
                        id: item.id,
                        url: item.url,
                        success: false,
                        sectionCount: 0,
                        error: err.message || "Failed to crawl or parse page.",
                    };
                }
            })
        );

        return NextResponse.json({
            success: true,
            total: results.length,
            successfulCount: results.filter((r) => r.success).length,
            results,
        });
    } catch (err: any) {
        console.error("Error in crawl API:", err);
        return NextResponse.json({ error: err.message || "Failed to process crawl request" }, { status: 500 });
    }
}
