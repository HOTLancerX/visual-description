import { NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { parseHtmlToSpecifications, type SpecificationBox } from "../../../../lib/specHtmlParser";

export const dynamic = "force-dynamic";

export interface SpecCrawlItem {
    id: string;
    url: string;
}

export interface SpecCrawlResult {
    id: string;
    url: string;
    success: boolean;
    boxCount: number;
    fieldCount: number;
    specifications?: SpecificationBox[];
    error?: string;
}

const DEFAULT_EXCLUDE_SELECTORS = [
    "nav.ndovu-dedicated-links",
    ".ndovu-dedicated-links",
    "[aria-label='Technical comparisons']",
    "#ndovu-specs-heading",
    "h2#ndovu-specs-heading",
    ".ndovu-section-subheading",
    "p.ndovu-section-subheading",
];

async function crawlProductSpecs(
    url: string,
    targetClass = "ndovu-scene-inner",
    excludeSelectors: string[] = DEFAULT_EXCLUDE_SELECTORS
): Promise<SpecificationBox[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

    // 1. Remove unwanted elements before extracting container
    excludeSelectors.forEach((sel) => {
        if (!sel.trim()) return;
        try {
            doc.querySelectorAll(sel.trim()).forEach((el) => el.remove());
        } catch {}
    });

    // 2. Locate target container
    const cleanClass = targetClass.replace(/^\./, "").trim();
    let container = doc.querySelector(`.${cleanClass}`);

    if (!container) {
        // Fallbacks if container class was slightly different
        container = doc.querySelector(".ndovu-scene-inner, #specs, .ndovu-spec-surface, .ndovu-pdp-tables");
    }

    let htmlToParse = "";
    if (container) {
        // Also remove excluded selectors from inside the matched container
        excludeSelectors.forEach((sel) => {
            if (!sel.trim()) return;
            try {
                container.querySelectorAll(sel.trim()).forEach((el) => el.remove());
            } catch {}
        });
        htmlToParse = container.outerHTML;
    } else {
        // Fallback: gather all .ndovu-pdp-card elements across page
        const cards = Array.from(doc.querySelectorAll("section.ndovu-pdp-card, .ndovu-pdp-card"));
        if (cards.length > 0) {
            htmlToParse = `<div>${cards.map((c) => c.outerHTML).join("\n")}</div>`;
        }
    }

    if (!htmlToParse || htmlToParse.trim().length === 0) {
        throw new Error(`Target container ".${cleanClass}" or specification cards not found on page.`);
    }

    const boxes = parseHtmlToSpecifications(htmlToParse, excludeSelectors);
    return boxes;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            items = [],
            targetClass = "ndovu-scene-inner",
            excludeSelectors = DEFAULT_EXCLUDE_SELECTORS,
        } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided for specification crawling." }, { status: 400 });
        }

        const batch = items.slice(0, 30);

        // Crawl in parallel
        const results: SpecCrawlResult[] = await Promise.all(
            batch.map(async (item: SpecCrawlItem): Promise<SpecCrawlResult> => {
                try {
                    if (!item.url || !item.url.startsWith("http")) {
                        return {
                            id: item.id,
                            url: item.url || "",
                            success: false,
                            boxCount: 0,
                            fieldCount: 0,
                            error: "Invalid or empty product URL.",
                        };
                    }

                    const boxes = await crawlProductSpecs(item.url, targetClass, excludeSelectors);
                    const boxCount = boxes.length;
                    const fieldCount = boxes.reduce((acc, b) => acc + (b.fields?.length || 0), 0);

                    if (boxCount === 0 || fieldCount === 0) {
                        return {
                            id: item.id,
                            url: item.url,
                            success: false,
                            boxCount: 0,
                            fieldCount: 0,
                            error: "No specifications could be extracted from page.",
                        };
                    }

                    return {
                        id: item.id,
                        url: item.url,
                        success: true,
                        boxCount,
                        fieldCount,
                        specifications: boxes,
                    };
                } catch (err: any) {
                    return {
                        id: item.id,
                        url: item.url,
                        success: false,
                        boxCount: 0,
                        fieldCount: 0,
                        error: err.message || "Failed to crawl or parse specifications.",
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
        console.error("Error in specification crawl API:", err);
        return NextResponse.json({ error: err.message || "Failed to process crawl request" }, { status: 500 });
    }
}
