/**
 * cms/plugin/visual-description/index.ts
 *
 * Visual Description Plugin for Products.
 *
 * Provides:
 * 1. Admin product form hook (_visual_description) with raw HTML code input,
 *    automatic parsing into structured JSON (banners, sliders, grids, split features),
 *    and fullscreen live preview modal with Desktop, Tablet, and Mobile viewport testing.
 * 2. Dedicated Admin Settings Page at /admin/visual-description for managing
 *    global pre-built CSS dynamically loaded on the server-side.
 * 3. Shared SSR-compatible VisualDescriptionRenderer.
 */

import { addHook, isPluginActive, type PluginMeta } from "@/hook";
import VisualDescriptionField from "./ui/VisualDescriptionField";
import VisualDescriptionRenderer from "./ui/VisualDescriptionRenderer";
import VisualPreviewModal from "./ui/VisualPreviewModal";
import VisualDescriptionSettingsPage from "./settings/VisualDescriptionSettingsPage";

export { VisualDescriptionField, VisualDescriptionRenderer, VisualPreviewModal, VisualDescriptionSettingsPage };
export * from "./types";
export * from "./lib/htmlToJsonParser";

export const PLUGINS: PluginMeta = {
    nx: "visual-description",
    name: "visual-description",
    version: "1.0.0",
    description: "Visual Description HTML to JSON converter with responsive preview and server-side pre-built CSS for products.",
    author: "System",
    icon: "solar:layers-minimalistic-bold",
    color: "from-blue-600 to-indigo-600",
    path: "https://github.com/HOTLancerX/visual-description.git",
};

/**
 * Register hooks for this plugin.
 * Called automatically by PluginList.reregisterHooks().
 */
export function register(): void {
    // Determine active nx: allow both standalone 'visual-description' and 'product' activation
    const activeNx = isPluginActive(PLUGINS.nx)
        ? PLUGINS.nx
        : isPluginActive("product")
        ? "product"
        : PLUGINS.nx;

    // ─── 1. Product Form Field Hook ───────────────────────────────────────────
    addHook(
        "post.form",
        [
            {
                key: "_visual_description",
                label: "Visual Description",
                type: "product",
                style: "left",
                position: 22,
                component: VisualDescriptionField,
            },
        ],
        activeNx
    );

    // ─── 2. Admin Navigation Item ─────────────────────────────────────────────
    addHook(
        "admin.nav",
        [
            {
                key: "visual-description",
                label: "Visual Description",
                icon: "solar:layers-minimalistic-bold",
                slug: "visual-description",
                parent: "product",
                position: 8.5,
            },
        ],
        activeNx
    );

    // ─── 3. Admin Dynamic Page (/admin/visual-description) ────────────────────
    addHook(
        "admin.pages",
        [
            {
                key: "visual-description",
                label: "Visual Description CSS",
                type: "visual-description",
                style: "left",
                position: 10,
                path: VisualDescriptionSettingsPage,
            },
        ],
        activeNx
    );
}
