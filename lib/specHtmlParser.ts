/**
 * cms/plugin/visual-description/lib/specHtmlParser.ts
 *
 * High-precision HTML parser that converts crawled specification containers
 * (such as .ndovu-scene-inner containing .ndovu-pdp-card sections) into structured
 * SpecificationBox[] data.
 *
 * Removes unwanted elements like:
 * - <nav class="ndovu-dedicated-links" ...>
 * - <h2 id="ndovu-specs-heading">Specs</h2>
 * - <p class="ndovu-section-subheading">... specifications</p>
 */

export interface SpecificationField {
    title: string;
    description: string;
    image?: string;
}

export interface SpecificationBox {
    title: string;
    icon?: string;
    fields: SpecificationField[];
}

const DEFAULT_EXCLUDE_SELECTORS = [
    "nav.ndovu-dedicated-links",
    ".ndovu-dedicated-links",
    "[aria-label='Technical comparisons']",
    "#ndovu-specs-heading",
    "h2#ndovu-specs-heading",
    ".ndovu-section-subheading",
    "p.ndovu-section-subheading",
    "script",
    "style",
];

/**
 * Clean up text content
 */
function cleanText(text: string): string {
    return (text || "")
        .replace(/\s+/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .trim();
}

/**
 * Parses raw HTML string into structured SpecificationBox[]
 */
function parseHtmlDoc(rawHtml: string): Document | null {
    if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
        try {
            return new DOMParser().parseFromString(rawHtml, "text/html");
        } catch (e) {
            console.error("DOMParser error in specHtmlParser:", e);
        }
    }
    return null;
}

/**
 * Parses raw HTML string into structured SpecificationBox[]
 */
export function parseHtmlToSpecifications(
    rawHtml: string,
    excludeSelectors: string[] = DEFAULT_EXCLUDE_SELECTORS
): SpecificationBox[] {
    if (!rawHtml || typeof rawHtml !== "string" || !rawHtml.trim()) {
        return [];
    }

    const boxes: SpecificationBox[] = [];
    const doc = parseHtmlDoc(rawHtml);

    if (!doc) {
        // Zero-dependency Node.js fallback
        let cleaned = rawHtml;
        cleaned = cleaned
            .replace(/<nav\b[^>]*class=["'][^"']*ndovu-dedicated-links[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<nav\b[^>]*aria-label=["'][^"']*Technical comparisons[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<h2\b[^>]*id=["']ndovu-specs-heading["'][^>]*>[\s\S]*?<\/h2>/gi, "")
            .replace(/<p\b[^>]*class=["'][^"']*ndovu-section-subheading[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, "")
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

        // Match section.ndovu-pdp-card
        const cardRegex = /<section\b[^>]*class=["'][^"']*ndovu-pdp-card[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi;
        let cardMatch: RegExpExecArray | null;

        while ((cardMatch = cardRegex.exec(cleaned)) !== null) {
            const cardContent = cardMatch[1];
            const hMatch = /<h3[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i.exec(cardContent) ||
                           /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(cardContent);
            const boxTitle = cleanText(hMatch ? hMatch[1].replace(/<[^>]+>/g, "") : "");

            const fields: SpecificationField[] = [];
            const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let trMatch: RegExpExecArray | null;

            while ((trMatch = trRegex.exec(cardContent)) !== null) {
                const trContent = trMatch[1];
                const thMatch = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(trContent);
                const tdMatch = /<span\b[^>]*class=["'][^"']*ndovu-pdp-value[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(trContent) ||
                                /<td[^>]*>([\s\S]*?)<\/td>/i.exec(trContent);

                if (thMatch && tdMatch) {
                    const key = cleanText(thMatch[1].replace(/<[^>]+>/g, ""));
                    const val = cleanText(tdMatch[1].replace(/<[^>]+>/g, ""));
                    if (key && val) {
                        fields.push({ title: key, description: val });
                    }
                }
            }

            if (boxTitle || fields.length > 0) {
                boxes.push({
                    title: boxTitle || `Section ${boxes.length + 1}`,
                    fields,
                });
            }
        }

        return boxes;
    }

    try {
        // 1. Remove unwanted elements
        excludeSelectors.forEach((sel) => {
            if (!sel.trim()) return;
            try {
                Array.from(doc.querySelectorAll(sel.trim())).forEach((el) => el.remove());
            } catch {}
        });

        // 2. Query cards / sections
        let cardElements = Array.from(doc.querySelectorAll("section.ndovu-pdp-card, .ndovu-pdp-card, section.pdp-card"));

        // Fallback: If no specialized card classes, look for sections or tables
        if (cardElements.length === 0) {
            cardElements = Array.from(doc.querySelectorAll("section, article, .spec-group, .specs-box"));
        }

        // 3. Process each card into a SpecificationBox
        cardElements.forEach((card) => {
            // Extract Box Title
            const headingEl = card.querySelector("header h3 span, header h3, h3 span, h3, h2, .ndovu-pdp-card-heading, caption");
            let boxTitle = cleanText(headingEl?.textContent || "");

            // Strip leading SVG icon text if any
            boxTitle = boxTitle.replace(/^[^\w]+/, "").trim();

            const fields: SpecificationField[] = [];

            // Extract fields from table rows
            const rows = Array.from(card.querySelectorAll("table.ndovu-pdp-spec-table tr, table tr, tr"));
            rows.forEach((row) => {
                const th = row.querySelector("th, .label, .spec-name, dt");
                const td = row.querySelector("td .ndovu-pdp-value, td .value, td, dd");

                if (th && td) {
                    const key = cleanText(th.textContent || "");
                    const val = cleanText(td.textContent || "");
                    if (key && val) {
                        fields.push({ title: key, description: val });
                    }
                }
            });

            // Fallback for dl/dt/dd inside section
            if (fields.length === 0) {
                const dts = Array.from(card.querySelectorAll("dt"));
                dts.forEach((dt) => {
                    const dd = dt.nextElementSibling;
                    if (dd && dd.tagName.toLowerCase() === "dd") {
                        const key = cleanText(dt.textContent || "");
                        const val = cleanText(dd.textContent || "");
                        if (key && val) {
                            fields.push({ title: key, description: val });
                        }
                    }
                });
            }

            if (boxTitle || fields.length > 0) {
                boxes.push({
                    title: boxTitle || `Section ${boxes.length + 1}`,
                    fields,
                });
            }
        });

        // If no structured cards were found, try direct <table> elements
        if (boxes.length === 0) {
            const tables = Array.from(doc.querySelectorAll("table"));
            tables.forEach((table, idx) => {
                const caption = table.querySelector("caption, th[colspan]");
                const boxTitle = cleanText(caption?.textContent || `Specifications ${idx + 1}`);
                const fields: SpecificationField[] = [];

                const rows = Array.from(table.querySelectorAll("tr"));
                rows.forEach((row) => {
                    const th = row.querySelector("th");
                    const td = row.querySelector("td");
                    if (th && td) {
                        const key = cleanText(th.textContent || "");
                        const val = cleanText(td.textContent || "");
                        if (key && val) {
                            fields.push({ title: key, description: val });
                        }
                    }
                });

                if (fields.length > 0) {
                    boxes.push({ title: boxTitle, fields });
                }
            });
        }
    } catch (err) {
        console.error("DOMParser error in parseHtmlToSpecifications:", err);
    }

    return boxes;
}
