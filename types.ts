/**
 * types.ts
 *
 * Structured data types for the Visual Description system.
 * Converts raw source HTML into clean, organized JSON sections with full metadata.
 * Enables section-by-section editing, reordering, deleting, and high-fidelity rendering.
 */

export type VisualSectionType =
    | "highlights-grid"    // .ndovu-why or metric tiles grid
    | "scene-video"        // .scene-video (hero video, camera, performance, battery, etc.)
    | "scene-gallery"      // .scene-gallery (highlights carousel, bento cards, photos)
    | "scene-accordion"    // .scene-accordion (interactive product tour, details)
    | "scene-metrics"      // .scene-metrics (charging, cooling, lenses specs)
    | "scene-tabs"         // .scene-tabs (aperture switcher, interactive tab panels)
    | "comparison"         // .ndovu-catalog-compare (product comparison tables)
    | "story-split"        // .xiaomi-story (split media & copy)
    | "generic";           // other generic visual sections

export interface VisualSectionMetric {
    label: string;       // e.g. "battery", "storage", "display"
    value: string;       // e.g. "4,288 mAh", "256GB", "6.3-inch"
    caption?: string;
}

export interface VisualSectionMediaItem {
    type: "image" | "video";
    url: string;
    poster?: string;
    alt?: string;
    label?: string;
}

export interface VisualSection {
    id: string;                      // unique section id, e.g. "why", "pro-hero", "pro-highlights"
    type: VisualSectionType;         // classified type for badges & icon display
    badge?: string;                  // e.g. "iPhone 18 Pro", "Design", "A20 Pro"
    title: string;                   // section title / heading
    description?: string;            // summary description / caption
    html: string;                    // authentic HTML of this single section (classes preserved)
    metrics?: VisualSectionMetric[]; // structured metrics if present
    media?: VisualSectionMediaItem[];// media assets found in this section
    enabled?: boolean;               // toggle section visibility without deleting
    customStyles?: Record<string, string>; // extracted CSS vars (--ns-*)
}

export interface VisualDescriptionData {
    version: string;
    title?: string;
    customCss?: string;
    sections: VisualSection[];       // Clean array of individual sections
    rawHtmlBackup?: string;          // optional fallback
    stats?: {
        sectionCount: number;
        imageCount: number;
        videoCount: number;
        charCount?: number;
    };
}
