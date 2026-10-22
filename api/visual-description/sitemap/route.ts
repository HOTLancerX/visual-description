import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface SitemapProductItem {
    url: string;
    slug: string;
    imageUrl?: string;
    title?: string;
}

// Helper to extract clean slug from a product URL
function extractSlugFromUrl(url: string): string {
    try {
        const u = new URL(url);
        const pathSegments = u.pathname.split("/").filter(Boolean);
        if (pathSegments.length > 0) {
            return pathSegments[pathSegments.length - 1];
        }
    } catch {
        const clean = url.replace(/\/+$/, "");
        const parts = clean.split("/");
        return parts[parts.length - 1] || "";
    }
    return "";
}

// Normalizer for slug matching (lowercase, strip trailing dashes)
function normalizeSlug(s: string): string {
    return s.toLowerCase().trim().replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "");
}

// Helper to fetch XML and parse sitemaps (handles <sitemapindex> and <urlset>)
async function fetchAndParseSitemap(sitemapUrl: string, visited = new Set<string>()): Promise<SitemapProductItem[]> {
    if (visited.has(sitemapUrl) || visited.size > 20) return [];
    visited.add(sitemapUrl);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(sitemapUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/xml, text/xml, */*",
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`Failed to fetch sitemap: ${sitemapUrl} (${res.status})`);
            return [];
        }

        const xmlText = await res.text();
        const items: SitemapProductItem[] = [];

        // Check if this is a sitemapindex file referencing multiple sub-sitemaps
        if (xmlText.includes("<sitemapindex") || xmlText.includes("<sitemap>")) {
            const sitemapRegex = /<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gi;
            let m: RegExpExecArray | null;
            const subUrls: string[] = [];
            while ((m = sitemapRegex.exec(xmlText)) !== null) {
                const subUrl = m[1].trim();
                if (subUrl && !visited.has(subUrl)) {
                    subUrls.push(subUrl);
                }
            }
            // Fetch child sitemaps in parallel
            const childResults = await Promise.all(
                subUrls.slice(0, 10).map((u) => fetchAndParseSitemap(u, visited))
            );
            childResults.forEach((arr) => items.push(...arr));
            return items;
        }

        // Standard urlset parsing
        const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
        let match: RegExpExecArray | null;

        while ((match = urlRegex.exec(xmlText)) !== null) {
            const block = match[1];

            // Extract <loc>
            const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(block);
            if (!locMatch) continue;
            const loc = locMatch[1].trim();

            // Extract slug
            const slug = extractSlugFromUrl(loc);
            if (!slug) continue;

            // Extract <image:loc> or <image:image>
            let imageUrl = "";
            const imgMatch = /<image:loc>([\s\S]*?)<\/image:loc>/i.exec(block);
            if (imgMatch) {
                imageUrl = imgMatch[1].trim();
            } else {
                const fallbackImg = /<image[^>]*>[\s\S]*?<loc>([\s\S]*?)<\/loc>/i.exec(block);
                if (fallbackImg) imageUrl = fallbackImg[1].trim();
            }

            // Extract optional <image:title>
            let title = "";
            const titleMatch = /<image:title>([\s\S]*?)<\/image:title>/i.exec(block);
            if (titleMatch) title = titleMatch[1].trim();

            items.push({
                url: loc,
                slug,
                imageUrl: imageUrl || undefined,
                title: title || undefined,
            });
        }

        return items;
    } catch (err) {
        console.error(`Error processing sitemap ${sitemapUrl}:`, err);
        return [];
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sitemapUrls = [], localSlugs = [] } = body;

        const cleanUrls: string[] = (Array.isArray(sitemapUrls) ? sitemapUrls : [sitemapUrls])
            .map((u: any) => String(u || "").trim())
            .filter((u: string) => u.startsWith("http://") || u.startsWith("https://"));

        if (cleanUrls.length === 0) {
            return NextResponse.json(
                { error: "Please provide at least one valid sitemap URL (e.g. https://exelicgadgets.co.ke/product-sitemap.xml)" },
                { status: 400 }
            );
        }

        // Fetch all provided sitemaps in parallel
        const allItemsNested = await Promise.all(cleanUrls.map((url) => fetchAndParseSitemap(url)));
        const allItems: SitemapProductItem[] = allItemsNested.flat();

        // Build slug lookup map for sitemap items
        const sitemapMap = new Map<string, SitemapProductItem>();
        allItems.forEach((item) => {
            const norm = normalizeSlug(item.slug);
            if (!sitemapMap.has(norm)) {
                sitemapMap.set(norm, item);
            }
        });

        // Perform matching against local slugs
        const matches: Record<string, { url: string; imageUrl?: string; slug: string; confidence: "exact" | "partial" }> = {};
        let matchedCount = 0;

        if (Array.isArray(localSlugs) && localSlugs.length > 0) {
            localSlugs.forEach((localSlug: string) => {
                const norm = normalizeSlug(localSlug);
                if (sitemapMap.has(norm)) {
                    const matchedItem = sitemapMap.get(norm)!;
                    matches[localSlug] = {
                        url: matchedItem.url,
                        imageUrl: matchedItem.imageUrl,
                        slug: matchedItem.slug,
                        confidence: "exact",
                    };
                    matchedCount++;
                } else {
                    // Try partial match if one contains the other
                    for (const [sNorm, sItem] of sitemapMap.entries()) {
                        if (
                            (norm.length > 5 && sNorm.includes(norm)) ||
                            (sNorm.length > 5 && norm.includes(sNorm))
                        ) {
                            matches[localSlug] = {
                                url: sItem.url,
                                imageUrl: sItem.imageUrl,
                                slug: sItem.slug,
                                confidence: "partial",
                            };
                            matchedCount++;
                            break;
                        }
                    }
                }
            });
        }

        return NextResponse.json({
            success: true,
            totalSitemapsProcessed: cleanUrls.length,
            totalSitemapItemsFound: allItems.length,
            matchedCount,
            matches,
            sampleItems: allItems.slice(0, 10),
        });
    } catch (err: any) {
        console.error("Error in sitemap parsing API:", err);
        return NextResponse.json({ error: err.message || "Failed to parse sitemap" }, { status: 500 });
    }
}
