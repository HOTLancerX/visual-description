"use client";

/**
 * VisualDescriptionRenderer.tsx
 *
 * Authentic renderer for Product Visual Descriptions.
 * Renders 100% ORIGINAL HTML, TAGS, AND CLASSES (xiaomi-ux3b2-components, ndovu-scene, ndovu-why).
 * Does NOT replace source markup with generic Tailwind CSS.
 *
 * Features:
 * 1. Automatically activates CSS scopes (xiaomi-ux3b2-active, ndovu-has-scenes).
 * 2. Injects global pre-built CSS from CMS settings and product-specific custom CSS.
 * 3. Provides seamless native interactivity for tabs, carousels (prev/next scrolling),
 *    and product tour accordions without external framework bloat.
 */

import React, { useMemo, useEffect, useRef } from "react";
import type { VisualDescriptionData } from "../types";
import { parseHtmlToVisualData } from "../lib/htmlToJsonParser";
import useSettings from "@/lib/useSettings";
import { XIAOMI_MASTER_PREBUILT_CSS } from "../presets/xiaomiPrebuiltCss";

export interface VisualDescriptionRendererProps {
    data: VisualDescriptionData | string | null | undefined;
    className?: string;
    isInteractivePreview?: boolean;
}

/**
 * Ensures all HTML tags are balanced and strictly closed so that unclosed
 * elements cannot leak out during SSR and swallow parent/sibling layout elements (like footer).
 */
function balanceHtml(html: string): string {
    if (!html || !html.trim()) return "";
    if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
        try {
            const doc = new DOMParser().parseFromString(html, "text/html");
            return doc.body.innerHTML;
        } catch {
            return html;
        }
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { JSDOM } = require("jsdom");
        const dom = new JSDOM(html);
        return dom.window.document.body.innerHTML;
    } catch {
        return html;
    }
}

export default function VisualDescriptionRenderer({
    data,
    className = "",
    isInteractivePreview = false,
}: VisualDescriptionRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { settings } = useSettings();
    const globalPrebuiltCss = settings?.visual_description_css || XIAOMI_MASTER_PREBUILT_CSS;

    // Resolve raw HTML string and custom CSS from structured sections or legacy string
    const { rawHtml, customCss } = useMemo(() => {
        if (!data) return { rawHtml: "", customCss: "" };

        let parsedObj: VisualDescriptionData | null = null;

        if (typeof data === "object") {
            parsedObj = data as VisualDescriptionData;
        } else if (typeof data === "string") {
            const trimmed = data.trim();
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                try {
                    parsedObj = JSON.parse(trimmed) as VisualDescriptionData;
                } catch {
                    // Fallback to parseHtmlToVisualData
                }
            }
            if (!parsedObj) {
                parsedObj = parseHtmlToVisualData(trimmed);
            }
        }

        if (!parsedObj) return { rawHtml: "", customCss: "" };

        const extractedCss = parsedObj.customCss || "";

        // If we have structured sections
        if (Array.isArray(parsedObj.sections) && parsedObj.sections.length > 0) {
            const active = parsedObj.sections.filter((s) => s.enabled !== false);

            // Group contiguous <article> elements into a .xiaomi-story-system wrapper
            const groups: { isStory: boolean; htmls: string[] }[] = [];
            active.forEach((sec) => {
                const trimmedHtml = (sec.html || "").trim();
                const isStory = trimmedHtml.startsWith("<article") || sec.type.startsWith("scene-");
                const last = groups[groups.length - 1];
                if (last && last.isStory === isStory) {
                    last.htmls.push(trimmedHtml);
                } else {
                    groups.push({ isStory, htmls: [trimmedHtml] });
                }
            });

            let compiledHtml = "";
            groups.forEach((g) => {
                if (g.isStory) {
                    compiledHtml += `\n<section class="xiaomi-story-system xiaomi-story-system--cinematic" aria-label="Product highlights" data-motion-mobile="all">\n${g.htmls.join("\n")}\n</section>\n`;
                } else {
                    compiledHtml += `\n${g.htmls.join("\n")}\n`;
                }
            });

            return { rawHtml: balanceHtml(compiledHtml.trim()), customCss: extractedCss };
        }

        // Legacy fallback
        if ((parsedObj as any).rawHtml) {
            return { rawHtml: balanceHtml((parsedObj as any).rawHtml), customCss: extractedCss };
        }
        if ((parsedObj as any).rawHtmlBackup) {
            return { rawHtml: balanceHtml((parsedObj as any).rawHtmlBackup), customCss: extractedCss };
        }

        return { rawHtml: "", customCss: extractedCss };
    }, [data]);

    // Native client-side interactions for tabs, carousels, dots, swiping, and accordions
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        // 1. Ensure body has xiaomi-ux3b2-active and ndovu-has-scenes classes
        document.body.classList.add("xiaomi-ux3b2-active", "ndovu-has-scenes");

        // Set viewport scrollbar width variable used by Xiaomi CSS for full bleed
        const syncScrollbar = () => {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.documentElement.style.setProperty("--ndovu-scrollbar-width", `${scrollbarWidth}px`);
        };
        syncScrollbar();
        window.addEventListener("resize", syncScrollbar, { passive: true });

        // 2. Decorate buttons with proper ndovu-story-control classes and attributes if missing
        const decorateButtons = () => {
            root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
                if (
                    b.classList.contains("ndovu-story-control") ||
                    b.classList.contains("ndovu-tile-open") ||
                    b.type === "submit" ||
                    b.closest("form")
                )
                    return;

                let icon = "label",
                    shape = "pill";
                if (
                    b.matches(
                        ".ndovu-video-control,[data-wv-video-toggle],[data-gallery-play],[data-ndovu-story-rail-toggle]"
                    )
                )
                    icon = "playback";
                else if (b.matches(".ndovu-video-start")) icon = "media-start";
                else if (b.matches("[data-close-dialog],[data-wv-close-trailer],[data-mb-view-close]"))
                    icon = "close";
                else if (b.matches(".poco-native-controls button,.xn-controls button"))
                    icon = /^Previous/i.test(b.getAttribute("aria-label") || "") ? "previous" : "next";
                else if (b.matches("[data-gallery-index],[data-wv-gallery-index]")) icon = "pager";
                else if (b.matches("[data-xn-index]")) icon = "thumbnail";
                else if (
                    b.matches("[data-band-colour],[data-device-colour],[data-mb-color],[data-product-image]")
                )
                    icon = "swatch";
                else if (b.matches("[data-wv-youtube]")) {
                    icon = "play";
                    b.dataset.ndovuControlOverlay = "center";
                }

                if (["swatch", "thumbnail"].includes(icon)) shape = icon;
                else if (icon !== "label") shape = "icon";

                b.classList.add("ndovu-story-control");
                b.dataset.ndovuControl = icon;
                b.dataset.ndovuControlShape = shape;
            });

            root.querySelectorAll(".wv-gallery-thumbs, .ndovu-gallery-dots").forEach((g) =>
                g.classList.add("ndovu-story-pagination")
            );
        };
        decorateButtons();

        // 3. Tab switching logic (aperture tabs, scene tabs)
        const tabButtons = Array.from(
            root.querySelectorAll<HTMLButtonElement>(
                '.ndovu-scene-tabs button, .ndovu-story-control[role="tab"]'
            )
        );

        const handleTabClick = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
            if (!btn) return;

            const tabsContainer = btn.closest(".ndovu-scene-tabs, [role='tablist']");
            if (!tabsContainer) return;

            const siblings = Array.from(tabsContainer.querySelectorAll<HTMLButtonElement>("button"));
            siblings.forEach((b) => {
                b.setAttribute("aria-selected", "false");
                b.setAttribute("tabindex", "-1");
            });

            btn.setAttribute("aria-selected", "true");
            btn.setAttribute("tabindex", "0");

            const panelId = btn.getAttribute("aria-controls");
            const sceneContainer = btn.closest(".ndovu-scene, .ndovu-scene-switcher, article");
            if (sceneContainer && panelId) {
                const targetPanel = sceneContainer.querySelector<HTMLElement>(`#${panelId}`);
                if (targetPanel) {
                    const siblingPanels = Array.from(
                        sceneContainer.querySelectorAll<HTMLElement>(".ndovu-scene-panel")
                    );
                    siblingPanels.forEach((p) => (p.hidden = true));
                    targetPanel.hidden = false;
                }
            }
        };

        tabButtons.forEach((btn) => btn.addEventListener("click", handleTabClick));

        // 4. Product Tour accordions & arrows
        const tourStages = Array.from(root.querySelectorAll<HTMLElement>("[data-product-tour], .ndovu-tour-stage, .ndovu-tour-surface"));
        const cleanupTourFns: (() => void)[] = [];

        tourStages.forEach((stage) => {
            const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>("[data-tour-index]"));
            const panels = Array.from(stage.querySelectorAll<HTMLElement>(".ndovu-tour-panel"));
            const arrows = Array.from(stage.querySelectorAll<HTMLButtonElement>("[data-tour-direction]"));

            let current = 0;
            const selectTour = (index: number) => {
                if (buttons.length === 0) return;
                current = Math.max(0, Math.min(buttons.length - 1, index));
                buttons.forEach((b, i) => {
                    const active = i === current;
                    b.setAttribute("aria-expanded", String(active));
                    const controlsAttr = b.getAttribute("aria-controls") || "";
                    controlsAttr.split(" ").forEach((cid) => {
                        if (!cid) return;
                        const caption = root.querySelector<HTMLElement>(`#${cid}`);
                        if (caption && caption.classList.contains("ndovu-tour-caption")) {
                            caption.hidden = !active;
                        }
                    });
                    if (panels[i]) {
                        panels[i].hidden = !active;
                        panels[i].querySelectorAll("video").forEach((v) => {
                            if (active) {
                                v.muted = true;
                                v.play().catch(() => {});
                            } else {
                                v.pause();
                            }
                        });
                    }
                });
                arrows.forEach((arr) => {
                    const dir = Number(arr.dataset.tourDirection);
                    arr.disabled = dir < 0 ? current === 0 : current === buttons.length - 1;
                    arr.style.opacity = arr.disabled ? "0.35" : "1";
                });
            };

            buttons.forEach((b, i) => {
                const clickH = () => selectTour(i);
                b.addEventListener("click", clickH);
                cleanupTourFns.push(() => b.removeEventListener("click", clickH));
            });

            arrows.forEach((arr) => {
                const arrowH = () => {
                    const dir = Number(arr.dataset.tourDirection) || 1;
                    selectTour(current + dir);
                };
                arr.addEventListener("click", arrowH);
                cleanupTourFns.push(() => arr.removeEventListener("click", arrowH));
            });

            if (buttons.length > 0) {
                selectTour(0);
            }
        });

        // 5. CAROUSELS & SLIDERS CONTROLLER (Swiping + Next/Prev + Dots + Auto-Progress)
        const rails = Array.from(
            root.querySelectorAll<HTMLElement>(".ndovu-scene-cards, [data-cards-mode='carousel'], [id$='-cards']")
        );
        const cleanupCarouselFns: (() => void)[] = [];

        rails.forEach((rail) => {
            const cards = Array.from(rail.children) as HTMLElement[];
            if (cards.length === 0) return;

            const railId = rail.id;

            // Find Prev/Next buttons
            let prevBtn = root.querySelector<HTMLButtonElement>(
                `button[data-carousel-direction="-1"][aria-controls="${railId}"]`
            );
            let nextBtn = root.querySelector<HTMLButtonElement>(
                `button[data-carousel-direction="1"][aria-controls="${railId}"]`
            );

            // Fallback: look in the same scene or article
            if (!prevBtn || !nextBtn) {
                const scene = rail.closest(".ndovu-scene, article");
                if (scene) {
                    prevBtn =
                        prevBtn ||
                        scene.querySelector<HTMLButtonElement>(
                            ".ndovu-carousel-controls button[data-carousel-direction='-1'], button[data-carousel-direction='-1']"
                        );
                    nextBtn =
                        nextBtn ||
                        scene.querySelector<HTMLButtonElement>(
                            ".ndovu-carousel-controls button[data-carousel-direction='1'], button[data-carousel-direction='1']"
                        );
                }
            }

            // Find gallery progress container & dots
            let progressControl = root.querySelector<HTMLElement>(`[data-progress-gallery="${railId}"]`);
            if (!progressControl) {
                const scene = rail.closest(".ndovu-scene, article");
                if (scene) {
                    progressControl = scene.querySelector<HTMLElement>("[data-progress-gallery]");
                }
            }

            const dotButtons: HTMLButtonElement[] = [];
            if (progressControl) {
                dotButtons.push(
                    ...Array.from(progressControl.querySelectorAll<HTMLButtonElement>("[data-gallery-index]"))
                );
            } else {
                cards.forEach((card) => {
                    const cardId = card.id;
                    if (cardId) {
                        const dot = root.querySelector<HTMLButtonElement>(`button[aria-controls="${cardId}"]`);
                        if (dot) dotButtons.push(dot);
                    }
                });
            }

            const playBtn = progressControl?.querySelector<HTMLButtonElement>("[data-gallery-play]");

            // Calculate card nearest to view
            const getNearestIndex = () => {
                let nearest = 0;
                let minDist = Infinity;
                cards.forEach((card, i) => {
                    const dist = Math.abs(card.offsetLeft - cards[0].offsetLeft - rail.scrollLeft);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = i;
                    }
                });
                return nearest;
            };

            // Smooth scroll to card index
            const scrollToCard = (index: number, smooth = true) => {
                const targetIdx = Math.max(0, Math.min(cards.length - 1, index));
                const targetX = cards[targetIdx].offsetLeft - cards[0].offsetLeft;
                rail.scrollTo({
                    left: targetX,
                    behavior: smooth ? "smooth" : "instant",
                });
                updateControls(targetIdx);
            };

            // Update disabled status, dots aria-pressed, and progress
            const updateControls = (forcedIndex?: number) => {
                const currentIdx = forcedIndex !== undefined ? forcedIndex : getNearestIndex();
                const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);

                if (prevBtn) {
                    const shouldDisable = rail.scrollLeft <= 5 || currentIdx === 0;
                    prevBtn.disabled = shouldDisable;
                    prevBtn.style.opacity = shouldDisable ? "0.35" : "1";
                    prevBtn.style.pointerEvents = shouldDisable ? "none" : "auto";
                    prevBtn.style.cursor = shouldDisable ? "default" : "pointer";
                }

                if (nextBtn) {
                    const shouldDisable = rail.scrollLeft >= maxScroll - 5 || currentIdx >= cards.length - 1;
                    nextBtn.disabled = shouldDisable;
                    nextBtn.style.opacity = shouldDisable ? "0.35" : "1";
                    nextBtn.style.pointerEvents = shouldDisable ? "none" : "auto";
                    nextBtn.style.cursor = shouldDisable ? "default" : "pointer";
                }

                if (dotButtons.length > 0) {
                    dotButtons.forEach((dot, idx) => {
                        const isActive = idx === currentIdx;
                        dot.setAttribute("aria-pressed", isActive ? "true" : "false");
                    });

                    // Center active dot if pagination strip overflows
                    const activeDot = dotButtons[currentIdx];
                    if (activeDot) {
                        const strip = activeDot.closest(".ndovu-story-pagination, .ndovu-gallery-dots");
                        if (strip) {
                            const b = activeDot.getBoundingClientRect();
                            const r = strip.getBoundingClientRect();
                            if (b.left < r.left + 8 || b.right > r.right - 8) {
                                strip.scrollTo({
                                    left: strip.scrollLeft + b.left - r.left - (strip.clientWidth - b.width) / 2,
                                    behavior: "smooth",
                                });
                            }
                        }
                    }
                }

                if (progressControl) {
                    const fraction = cards.length > 1 ? currentIdx / (cards.length - 1) : 0;
                    progressControl.style.setProperty("--ndovu-gallery-progress", String(fraction));
                }
            };

            // Auto-play slideshow support
            let playInterval: ReturnType<typeof setInterval> | null = null;
            let isPlaying = false;

            const pauseAutoPlay = () => {
                if (!isPlaying) return;
                isPlaying = false;
                if (playInterval) clearInterval(playInterval);
                playInterval = null;
                if (playBtn) {
                    playBtn.setAttribute("aria-pressed", "false");
                    playBtn.setAttribute("aria-label", "Play gallery");
                }
            };

            const startAutoPlay = () => {
                if (isPlaying) return;
                isPlaying = true;
                if (playBtn) {
                    playBtn.setAttribute("aria-pressed", "true");
                    playBtn.setAttribute("aria-label", "Pause gallery");
                }
                playInterval = setInterval(() => {
                    const curr = getNearestIndex();
                    const nextIdx = (curr + 1) % cards.length;
                    scrollToCard(nextIdx);
                }, 5000);
            };

            if (playBtn) {
                const playClick = (e: MouseEvent) => {
                    e.preventDefault();
                    if (isPlaying) pauseAutoPlay();
                    else startAutoPlay();
                };
                playBtn.addEventListener("click", playClick);
                cleanupCarouselFns.push(() => playBtn.removeEventListener("click", playClick));
            }

            // Previous / Next button click handlers
            if (prevBtn) {
                const prevClick = (e: MouseEvent) => {
                    e.preventDefault();
                    pauseAutoPlay();
                    const curr = getNearestIndex();
                    scrollToCard(Math.max(0, curr - 1));
                };
                prevBtn.addEventListener("click", prevClick);
                cleanupCarouselFns.push(() => prevBtn.removeEventListener("click", prevClick));
            }

            if (nextBtn) {
                const nextClick = (e: MouseEvent) => {
                    e.preventDefault();
                    pauseAutoPlay();
                    const curr = getNearestIndex();
                    scrollToCard(Math.min(cards.length - 1, curr + 1));
                };
                nextBtn.addEventListener("click", nextClick);
                cleanupCarouselFns.push(() => nextBtn.removeEventListener("click", nextClick));
            }

            // Dot button click handlers
            dotButtons.forEach((dot, idx) => {
                const dotClick = (e: MouseEvent) => {
                    e.preventDefault();
                    pauseAutoPlay();
                    scrollToCard(idx);
                };
                dot.addEventListener("click", dotClick);
                cleanupCarouselFns.push(() => dot.removeEventListener("click", dotClick));
            });

            // Native scroll event listener with requestAnimationFrame debounce
            let scrollRaf: number | null = null;
            const scrollHandler = () => {
                if (scrollRaf) cancelAnimationFrame(scrollRaf);
                scrollRaf = requestAnimationFrame(() => {
                    updateControls();
                });
            };
            rail.addEventListener("scroll", scrollHandler, { passive: true });
            cleanupCarouselFns.push(() => {
                rail.removeEventListener("scroll", scrollHandler);
                if (scrollRaf) cancelAnimationFrame(scrollRaf);
                if (playInterval) clearInterval(playInterval);
            });

            // Mouse Drag Swiping & Touch Gesture support
            let isPointerDown = false;
            let startX = 0;
            let startScrollLeft = 0;
            let hasMoved = false;

            const onPointerDown = (e: PointerEvent) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                isPointerDown = true;
                hasMoved = false;
                startX = e.clientX;
                startScrollLeft = rail.scrollLeft;
                pauseAutoPlay();
            };

            const onPointerMove = (e: PointerEvent) => {
                if (!isPointerDown) return;
                const dx = e.clientX - startX;
                if (Math.abs(dx) > 6) {
                    hasMoved = true;
                    rail.style.scrollSnapType = "none";
                    rail.style.cursor = "grabbing";
                    rail.style.userSelect = "none";
                    rail.scrollLeft = startScrollLeft - dx;
                }
            };

            const onPointerUp = () => {
                if (!isPointerDown) return;
                isPointerDown = false;
                rail.style.cursor = "";
                rail.style.scrollSnapType = "";
                rail.style.userSelect = "";

                if (hasMoved) {
                    const curr = getNearestIndex();
                    scrollToCard(curr);

                    const cancelClick = (ev: MouseEvent) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                    };
                    rail.addEventListener("click", cancelClick, { capture: true, once: true });
                }
            };

            rail.addEventListener("pointerdown", onPointerDown);
            rail.addEventListener("pointermove", onPointerMove);
            rail.addEventListener("pointerup", onPointerUp);
            rail.addEventListener("pointercancel", onPointerUp);

            cleanupCarouselFns.push(() => {
                rail.removeEventListener("pointerdown", onPointerDown);
                rail.removeEventListener("pointermove", onPointerMove);
                rail.removeEventListener("pointerup", onPointerUp);
                rail.removeEventListener("pointercancel", onPointerUp);
            });

            // Initial controls state
            updateControls();
        });

        // 6. Comprehensive Video Controller (ndovu-lazy-video, autoplay, play/pause buttons)
        const allVideos = Array.from(root.querySelectorAll<HTMLVideoElement>("video"));
        const cleanupVideoFns: (() => void)[] = [];

        // Helper to pick responsive source (mobile vs desktop)
        const resolveVideoSource = (v: HTMLVideoElement) => {
            const isMobile = window.matchMedia("(max-width: 767px)").matches;
            const sources = Array.from(v.querySelectorAll<HTMLSourceElement>("source"));
            if (sources.length === 0) {
                return v.src || v.getAttribute("data-ndovu-src") || "";
            }
            const mobileSource = sources.find((s) => s.media && window.matchMedia(s.media).matches);
            const desktopSource = sources.find((s) => !s.media);
            const chosen = isMobile && mobileSource ? mobileSource : desktopSource || sources[0];
            return chosen ? chosen.src || chosen.getAttribute("data-ndovu-src") || "" : "";
        };

        allVideos.forEach((video) => {
            const parent = video.closest(".ndovu-scene-media, .ndovu-scene-inner, .ndovu-scene, article");
            const controlBtn = parent?.querySelector<HTMLButtonElement>(
                ".ndovu-video-control, .ndovu-video-start, [data-wv-video-toggle]"
            );

            // Ensure attributes for reliable mobile & browser inline playback
            video.muted = true;
            video.playsInline = true;
            video.setAttribute("muted", "");
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");

            // Resolve and set video.src if needed
            const sourceUrl = resolveVideoSource(video);
            if (sourceUrl && (!video.src || video.src === window.location.href)) {
                video.src = sourceUrl;
            }
            video.preload = "auto";
            video.load();

            // Sync control button state
            const syncButtonState = () => {
                if (!controlBtn) return;
                const isPlaying = !video.paused && !video.ended;
                controlBtn.setAttribute("aria-pressed", String(isPlaying));
                const label = video.getAttribute("aria-label") || "Product detail";
                if (video.ended) {
                    controlBtn.setAttribute("aria-label", `Replay video: ${label}`);
                } else if (isPlaying) {
                    controlBtn.setAttribute("aria-label", `Pause video: ${label}`);
                } else {
                    controlBtn.setAttribute("aria-label", `Play video: ${label}`);
                }
            };

            const onPlay = () => syncButtonState();
            const onPause = () => syncButtonState();
            const onEnded = () => {
                syncButtonState();
                if (video.hasAttribute("loop") || video.getAttribute("data-ndovu-loop") === "1") {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                }
            };

            video.addEventListener("play", onPlay);
            video.addEventListener("pause", onPause);
            video.addEventListener("ended", onEnded);

            cleanupVideoFns.push(() => {
                video.removeEventListener("play", onPlay);
                video.removeEventListener("pause", onPause);
                video.removeEventListener("ended", onEnded);
            });

            // Wire up control button click
            if (controlBtn) {
                const onControlClick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (video.paused || video.ended) {
                        delete video.dataset.userPaused;
                        if (video.ended) {
                            video.currentTime = 0;
                        }
                        video.play().catch(() => {
                            video.muted = true;
                            video.play().catch(() => {});
                        });
                    } else {
                        video.dataset.userPaused = "1";
                        video.pause();
                    }
                    syncButtonState();
                };

                controlBtn.addEventListener("click", onControlClick);
                cleanupVideoFns.push(() => controlBtn.removeEventListener("click", onControlClick));
            }

            // Clicking the video directly toggles play/pause
            const onVideoClick = () => {
                if (video.paused || video.ended) {
                    delete video.dataset.userPaused;
                    if (video.ended) video.currentTime = 0;
                    video.play().catch(() => {});
                } else {
                    video.dataset.userPaused = "1";
                    video.pause();
                }
                syncButtonState();
            };
            video.addEventListener("click", onVideoClick);
            cleanupVideoFns.push(() => video.removeEventListener("click", onVideoClick));

            // Viewport intersection observer for auto-play & pause
            const isAutoplay =
                video.hasAttribute("data-ndovu-autoplay") ||
                video.hasAttribute("autoplay") ||
                video.classList.contains("ndovu-lazy-video");

            if (isAutoplay && "IntersectionObserver" in window) {
                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                if (video.dataset.userPaused !== "1") {
                                    video.play().catch(() => {
                                        video.muted = true;
                                        video.play().catch(() => {});
                                    });
                                }
                            } else {
                                if (!video.paused) {
                                    video.pause();
                                }
                            }
                            syncButtonState();
                        });
                    },
                    { threshold: 0.15 }
                );

                observer.observe(video);
                cleanupVideoFns.push(() => observer.disconnect());
            } else if (isAutoplay) {
                video.play().catch(() => {});
            }

            syncButtonState();
        });

        // Cleanup all attached event listeners on re-render / unmount
        return () => {
            window.removeEventListener("resize", syncScrollbar);
            tabButtons.forEach((btn) => btn.removeEventListener("click", handleTabClick));
            cleanupTourFns.forEach((fn) => fn());
            cleanupCarouselFns.forEach((fn) => fn());
            cleanupVideoFns.forEach((fn) => fn());
        };
    }, [rawHtml]);


    if (!rawHtml) return null;

    return (
        <div
            ref={containerRef}
            className={`${className}`}
            suppressHydrationWarning
        >
            {/* Render 100% Authentic Original HTML */}
            <div
                dangerouslySetInnerHTML={{ __html: rawHtml }}
                suppressHydrationWarning
            />
        </div>
    );
}
