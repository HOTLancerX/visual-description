/**
 * htmlToJsonParser.ts
 *
 * Authentic HTML parser for Product Visual Descriptions.
 * Converts raw source HTML into clean, organized JSON sections with full metadata.
 * Does NOT save raw unparsed HTML blob; converts into structured VisualSection[].
 *
 * Preserves authentic tags & classes (ndovu-why, ndovu-scene, scene-video, scene-gallery)
 * inside each individual section so the pre-built CSS matches with 100% design fidelity.
 */

import type {
    VisualDescriptionData,
    VisualSection,
    VisualSectionType,
    VisualSectionMetric,
    VisualSectionMediaItem,
} from "../types";

/**
 * Classifies an element into a recognizable VisualSectionType
 */
function classifySectionType(el: Element): VisualSectionType {
    const cls = el.className || "";
    const id = el.id || "";

    if (cls.includes("ndovu-why") || id === "why") {
        return "highlights-grid";
    }
    if (cls.includes("ndovu-catalog-compare") || cls.includes("ndovu-comparison") || id.includes("compare") || id.includes("comparison")) {
        return "comparison";
    }
    if (cls.includes("scene-video") || el.querySelector("video")) {
        return "scene-video";
    }
    if (cls.includes("scene-gallery") || cls.includes("ndovu-scene-cards") || el.getAttribute("data-cards-mode") === "carousel") {
        return "scene-gallery";
    }
    if (cls.includes("scene-accordion") || cls.includes("ndovu-tour") || el.getAttribute("data-viewer-style") === "product-tour" || el.hasAttribute("data-product-tour") || el.querySelector(".ndovu-tour-stage, [data-product-tour]")) {
        return "scene-accordion";
    }
    if (cls.includes("scene-metrics") || el.querySelector(".ndovu-scene-metrics, dl")) {
        return "scene-metrics";
    }
    if (cls.includes("scene-tabs") || el.querySelector(".ndovu-scene-tabs, [role='tablist']")) {
        return "scene-tabs";
    }
    if (cls.includes("xiaomi-story")) {
        return "story-split";
    }
    return "generic";
}

/**
 * Extracts structured metrics from a section (e.g. .ndovu-why__tile or dl/dt/dd)
 */
function extractMetrics(el: Element): VisualSectionMetric[] {
    const metrics: VisualSectionMetric[] = [];

    // 1. .ndovu-why tiles
    const tiles = Array.from(el.querySelectorAll(".ndovu-why__tile"));
    tiles.forEach((tile) => {
        const valEl = tile.querySelector(".ndovu-why__value");
        const capEl = tile.querySelector(".ndovu-why__caption, .ndovu-why__kicker");
        if (valEl) {
            metrics.push({
                value: valEl.textContent?.trim() || "",
                label: capEl?.textContent?.trim() || "",
            });
        }
    });

    // 2. Definition lists (.ndovu-scene-metrics dl div)
    if (metrics.length === 0) {
        const dls = Array.from(el.querySelectorAll("dl div, dl.ndovu-scene-metrics > div"));
        dls.forEach((div) => {
            const dt = div.querySelector("dt");
            const dd = div.querySelector("dd");
            if (dt) {
                metrics.push({
                    value: dt.textContent?.trim() || "",
                    label: dd?.textContent?.trim() || "",
                });
            }
        });
    }

    return metrics;
}

/**
 * Extracts media items (videos and images) from a section
 */
function extractMedia(el: Element): VisualSectionMediaItem[] {
    const media: VisualSectionMediaItem[] = [];

    // Videos
    const videos = Array.from(el.querySelectorAll("video"));
    videos.forEach((v) => {
        const src = v.getAttribute("src") || v.querySelector("source")?.getAttribute("src") || "";
        const poster = v.getAttribute("poster") || "";
        const alt = v.getAttribute("aria-label") || "";
        if (src || poster) {
            media.push({
                type: "video",
                url: src,
                poster: poster || undefined,
                alt: alt || undefined,
            });
        }
    });

    // Images
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (src && !src.includes("data:image/svg+xml")) {
            media.push({
                type: "image",
                url: src,
                alt: img.getAttribute("alt") || undefined,
            });
        }
    });

    return media;
}

/**
 * Cleans and resolves media attributes in a DOM tree, and removes excluded elements
 */
function cleanAndResolveDom(
    doc: Document,
    excludeIds: string[] = ["product-comparison", "specs"],
    excludeClasses: string[] = ["ndovu-catalog-compare", "ndovu-spec-tabs", "ndovu-spec-surface", "ndovu-pdp-tables"]
) {
    // 1. Remove script tags for safety
    Array.from(doc.querySelectorAll("script")).forEach((s) => s.remove());

    // 2. Remove bypassed / excluded elements by ID
    excludeIds.forEach((id) => {
        const clean = id.trim().replace(/^#/, "");
        if (!clean) return;
        try {
            Array.from(doc.querySelectorAll(`#${clean}, [id="${clean}"]`)).forEach((el) => el.remove());
        } catch {}
    });

    // 3. Remove bypassed / excluded elements by Class
    excludeClasses.forEach((cls) => {
        const clean = cls.trim().replace(/^\./, "");
        if (!clean) return;
        try {
            Array.from(doc.querySelectorAll(`.${clean}, [class*="${clean}"]`)).forEach((el) => el.remove());
        } catch {}
    });

    // 4. Resolve lazy images
    Array.from(doc.querySelectorAll("img")).forEach((img) => {
        const lazySrc =
            img.getAttribute("data-src") ||
            img.getAttribute("data-lazy-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-url");
        if (lazySrc && !img.getAttribute("src")) {
            img.setAttribute("src", lazySrc.trim());
        }
        if (!img.getAttribute("loading")) {
            img.setAttribute("loading", "lazy");
        }
    });

    // 5. Resolve lazy videos
    Array.from(doc.querySelectorAll("video")).forEach((video) => {
        const poster =
            video.getAttribute("data-ndovu-poster") ||
            video.getAttribute("data-poster") ||
            video.getAttribute("data-ndovu-mobile-poster");
        if (poster && !video.getAttribute("poster")) {
            video.setAttribute("poster", poster.trim());
        }
        Array.from(video.querySelectorAll("source")).forEach((source) => {
            const dataSrc = source.getAttribute("data-ndovu-src") || source.getAttribute("data-src");
            if (dataSrc && !source.getAttribute("src")) {
                source.setAttribute("src", dataSrc.trim());
            }
        });
        const directSrc = video.getAttribute("data-ndovu-src") || video.getAttribute("data-src");
        if (directSrc && !video.getAttribute("src")) {
            video.setAttribute("src", directSrc.trim());
        }
    });
}

/**
 * Balanced section extractor for environments without native DOMParser (SSR / Node.js).
 * Avoids truncating nested section/article elements and requires ZERO external dependencies.
 */
function extractBalancedSections(html: string): { tag: string; fullHtml: string }[] {
    const results: { tag: string; fullHtml: string }[] = [];
    const openRegex = /<(section|article)\b[^>]*>/gi;
    let match: RegExpExecArray | null;

    let cursor = 0;
    while ((match = openRegex.exec(html)) !== null) {
        const startIdx = match.index;
        if (startIdx < cursor) continue;

        const tagName = match[1].toLowerCase();
        const closeTag = `</${tagName}>`;
        const openTagPrefix = `<${tagName}`;

        let depth = 1;
        let pos = startIdx + match[0].length;

        while (depth > 0 && pos < html.length) {
            const nextOpen = html.toLowerCase().indexOf(openTagPrefix, pos);
            const nextClose = html.toLowerCase().indexOf(closeTag, pos);

            if (nextClose === -1) break;

            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++;
                pos = nextOpen + openTagPrefix.length;
            } else {
                depth--;
                pos = nextClose + closeTag.length;
            }
        }

        if (depth === 0) {
            results.push({
                tag: tagName,
                fullHtml: html.slice(startIdx, pos),
            });
            cursor = pos;
            openRegex.lastIndex = pos;
        }
    }

    return results;
}

/**
 * Helper to obtain a Document instance in browser environment.
 */
function parseHtmlDoc(rawHtml: string): Document | null {
    if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
        try {
            return new DOMParser().parseFromString(rawHtml, "text/html");
        } catch (e) {
            console.error("DOMParser error in parseHtmlDoc:", e);
        }
    }
    return null;
}

/**
 * Parses raw HTML string into structured VisualDescriptionData JSON.
 * Bypasses / excludes sections or elements matching excludeIds & excludeClasses.
 */
export function parseHtmlToVisualData(
    rawHtml: string,
    extraCss?: string,
    excludeIds: string[] = ["product-comparison", "specs"],
    excludeClasses: string[] = ["ndovu-catalog-compare", "ndovu-spec-tabs", "ndovu-spec-surface", "ndovu-pdp-tables"]
): VisualDescriptionData {
    if (!rawHtml || typeof rawHtml !== "string" || !rawHtml.trim()) {
        return {
            version: "1.0.0",
            customCss: extraCss?.trim() || undefined,
            sections: [],
            stats: { sectionCount: 0, imageCount: 0, videoCount: 0, charCount: 0 },
        };
    }

    let customCss = extraCss ? `${extraCss.trim()}\n` : "";
    const sections: VisualSection[] = [];
    let totalImages = 0;
    let totalVideos = 0;

    const doc = parseHtmlDoc(rawHtml);
    if (!doc) {
        // Node.js SSR fallback using balanced tag extraction with ZERO external dependencies
        const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = styleRegex.exec(rawHtml)) !== null) {
            if (sMatch[1]) customCss += `\n${sMatch[1].trim()}\n`;
        }

        let cleaned = rawHtml
            .replace(styleRegex, "")
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/data-ndovu-src=(["'])(.*?)\1/gi, 'src="$2" data-ndovu-src="$2"')
            .replace(/data-ndovu-poster=(["'])(.*?)\1/gi, 'poster="$2" data-ndovu-poster="$2"')
            .replace(/data-src=(["'])(.*?)\1/gi, 'src="$2" data-src="$2"');

        // Remove excluded elements by ID or Class
        excludeIds.forEach((id) => {
            const clean = id.trim().replace(/^#/, "");
            if (!clean) return;
            const r = new RegExp(`<(section|article|div)[^>]*?\\bid=["']?${clean}["']?[^>]*>[\\s\\S]*?<\\/\\1>`, "gi");
            cleaned = cleaned.replace(r, "");
        });
        excludeClasses.forEach((cls) => {
            const clean = cls.trim().replace(/^\./, "");
            if (!clean) return;
            const r = new RegExp(`<(section|article|div)[^>]*?\\bclass=["'][^"']*?${clean}[^"']*?["'][^>]*>[\\s\\S]*?<\\/\\1>`, "gi");
            cleaned = cleaned.replace(r, "");
        });

        const balancedSections = extractBalancedSections(cleaned);
        balancedSections.forEach((sec, idx) => {
            const fullTag = sec.fullHtml;
            const idMatch = /id=(["'])(.*?)\1/i.exec(fullTag);
            const id = idMatch ? idMatch[2] : `section-${idx + 1}`;
            const sId = id.toLowerCase();
            const sClass = (fullTag.match(/class=(["'])(.*?)\1/i)?.[2] || "").toLowerCase();

            if (excludeIds.some((x) => x && sId.includes(x.trim().toLowerCase().replace(/^#/, "")))) {
                return;
            }
            if (excludeClasses.some((x) => x && sClass.includes(x.trim().toLowerCase().replace(/^\./, "")))) {
                return;
            }

            const titleMatch = /<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/i.exec(fullTag);
            const title = titleMatch ? titleMatch[2].replace(/<[^>]+>/g, "").trim() : id;

            sections.push({
                id,
                type: fullTag.includes("video") ? "scene-video" : fullTag.includes("ndovu-why") ? "highlights-grid" : "generic",
                title,
                html: fullTag,
                enabled: true,
            });
        });

        if (sections.length === 0 && cleaned.trim()) {
            sections.push({
                id: "main-content",
                type: "generic",
                title: "Overview",
                html: cleaned.trim(),
                enabled: true,
            });
        }

        return {
            version: "1.0.0",
            customCss: customCss.trim() || undefined,
            sections,
            stats: {
                sectionCount: sections.length,
                imageCount: totalImages,
                videoCount: totalVideos,
                charCount: JSON.stringify(sections).length,
            },
        };
    }

    try {
        // Extract all <style> blocks
        Array.from(doc.querySelectorAll("style")).forEach((styleEl) => {
            const cssText = styleEl.textContent || "";
            if (cssText.trim()) {
                customCss += `\n${cssText.trim()}\n`;
            }
            styleEl.remove();
        });

        // Clean & resolve media & remove excluded elements
        cleanAndResolveDom(doc, excludeIds, excludeClasses);

        // Find all candidate section elements
        let sectionEls = Array.from(
            doc.querySelectorAll(".ndovu-why, article.ndovu-scene, .ndovu-catalog-compare, .xiaomi-story, .ndovu-tour-surface, [data-product-tour]")
        );

        // If none of those specialized classes were found, grab top-level sections / articles
        if (sectionEls.length === 0) {
            const rootChildren = Array.from(doc.body.children);
            if (rootChildren.length === 1 && rootChildren[0].classList.contains("xiaomi-ux3b2-components")) {
                sectionEls = Array.from(rootChildren[0].querySelectorAll("section, article"));
            } else {
                sectionEls = Array.from(doc.querySelectorAll("section, article"));
            }
        }

        // Fallback: If still empty, use body children or entire body
        if (sectionEls.length === 0) {
            const directChildren = Array.from(doc.body.children);
            if (directChildren.length > 0) {
                sectionEls = directChildren;
            } else if (doc.body.innerHTML.trim()) {
                const genericSection: VisualSection = {
                    id: "main-content",
                    type: "generic",
                    title: "Overview",
                    html: doc.body.innerHTML.trim(),
                    enabled: true,
                };
                return {
                    version: "1.0.0",
                    customCss: customCss.trim() || undefined,
                    sections: [genericSection],
                    stats: { sectionCount: 1, imageCount: 0, videoCount: 0, charCount: doc.body.innerHTML.length },
                };
            }
        }

        // Process each section into a clean VisualSection object
        sectionEls.forEach((el, index) => {
            const id = el.id || `section-${index + 1}`;
            const sId = (el.id || "").toLowerCase();
            const sClass = (el.className || "").toLowerCase();

            // Skip / Bypass if section matches excluded ID
            if (excludeIds.some((x) => x && sId.includes(x.trim().toLowerCase().replace(/^#/, "")))) {
                return;
            }
            // Skip / Bypass if section matches excluded Class
            if (excludeClasses.some((x) => x && sClass.includes(x.trim().toLowerCase().replace(/^\./, "")))) {
                return;
            }

            const type = classifySectionType(el);

            // Extract Title
            const titleEl = el.querySelector("h1, h2, h3, .ndovu-why__title, header h2, .ndovu-scene-copy h2");
            let title = titleEl ? titleEl.textContent?.trim().replace(/\s+/g, " ") || "" : "";
            if (!title) {
                title = id
                    .replace(/^pro-/, "")
                    .replace(/[-_]/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
            }

            // Extract Eyebrow / Badge
            const eyebrowEl = el.querySelector(".ndovu-scene-eyebrow, .ndovu-product-badge, .visual-badge");
            const badge = eyebrowEl ? eyebrowEl.textContent?.trim() : undefined;

            // Extract Description
            const descEl = el.querySelector(".ndovu-scene-description, .ndovu-section-subheading, .ndovu-scene-caption");
            const description = descEl ? descEl.textContent?.trim().replace(/\s+/g, " ") : undefined;

            // Extract Metrics & Media
            const metrics = extractMetrics(el);
            const media = extractMedia(el);

            totalImages += media.filter((m) => m.type === "image").length;
            totalVideos += media.filter((m) => m.type === "video").length;

            // Clean authentic HTML of this specific section
            const sectionHtml = el.outerHTML;

            sections.push({
                id,
                type,
                badge,
                title,
                description,
                html: sectionHtml,
                metrics: metrics.length > 0 ? metrics : undefined,
                media: media.length > 0 ? media : undefined,
                enabled: true,
            });
        });
    } catch (err) {
        console.error("Error parsing visual description HTML:", err);
    }

    return {
        version: "1.0.0",
        customCss: customCss.trim() || undefined,
        sections,
        stats: {
            sectionCount: sections.length,
            imageCount: totalImages,
            videoCount: totalVideos,
            charCount: JSON.stringify(sections).length,
        },
    };
}

