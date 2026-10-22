import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Post from "@/models/post";
import PostInfo from "@/models/post_info";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") || "100", 10)));
        const filter = searchParams.get("filter") || "all"; // "all" | "missing" | "completed"
        const search = searchParams.get("search")?.trim() || "";
        const category = searchParams.get("category")?.trim() || "";

        // Base query for product posts
        const query: Record<string, any> = {
            type: "product",
            status: { $ne: "trash" },
        };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { slug: { $regex: search, $options: "i" } },
            ];
        }

        if (category && category !== "all") {
            query.category = category;
        }

        // Handle missing / completed filters for _visual_description
        if (filter === "missing") {
            const completedDocs = await PostInfo.find({
                name: "_visual_description",
                value: { $exists: true, $ne: "" },
            }).select("postId value").lean();

            const completedPostIds = completedDocs
                .filter((d: any) => {
                    const val = String(d.value || "").trim();
                    return val.length > 5 && val !== "{}" && val !== "null";
                })
                .map((d: any) => d.postId);

            query._id = { $nin: completedPostIds };
        } else if (filter === "completed") {
            const completedDocs = await PostInfo.find({
                name: "_visual_description",
                value: { $exists: true, $ne: "" },
            }).select("postId value").lean();

            const completedPostIds = completedDocs
                .filter((d: any) => {
                    const val = String(d.value || "").trim();
                    return val.length > 5 && val !== "{}" && val !== "null";
                })
                .map((d: any) => d.postId);

            query._id = { $in: completedPostIds };
        }

        const total = await Post.countDocuments(query);
        const skip = (page - 1) * limit;

        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("category", "title")
            .select("_id title slug category status createdAt")
            .lean();

        const postIds = posts.map((p: any) => p._id);

        // Fetch image, images, gallery, and _visual_description from PostInfo
        const infoDocs = await PostInfo.find({
            postId: { $in: postIds },
            name: { $in: ["image", "images", "gallery", "_visual_description"] },
        }).lean();

        const infoMap = new Map<string, Record<string, string>>();
        infoDocs.forEach((d: any) => {
            const pId = String(d.postId);
            if (!infoMap.has(pId)) infoMap.set(pId, {});
            infoMap.get(pId)![d.name] = String(d.value || "");
        });

        const items = posts.map((p: any) => {
            const pId = String(p._id);
            const infos = infoMap.get(pId) || {};

            // Resolve main product image
            let resolvedImage = infos.image || "";
            if (!resolvedImage && infos.images) {
                try {
                    const parsed = JSON.parse(infos.images);
                    if (Array.isArray(parsed) && parsed[0]) resolvedImage = parsed[0];
                } catch {}
            }
            if (!resolvedImage && infos.gallery) {
                try {
                    const parsed = JSON.parse(infos.gallery);
                    if (Array.isArray(parsed) && parsed[0]) resolvedImage = parsed[0];
                } catch {}
            }

            // Check visual description status
            const rawVd = infos._visual_description || "";
            let hasVisualDescription = false;
            let sectionCount = 0;
            let visualData: any = null;

            if (rawVd && rawVd.trim().length > 5) {
                try {
                    const parsed = JSON.parse(rawVd);
                    if (parsed && typeof parsed === "object") {
                        visualData = parsed;
                        hasVisualDescription = true;
                        sectionCount = Array.isArray(parsed.sections) ? parsed.sections.length : 0;
                    }
                } catch {}
            }

            return {
                id: pId,
                title: String(p.title || ""),
                slug: String(p.slug || ""),
                category: p.category?.title || String(p.category || ""),
                status: String(p.status || "draft"),
                image: resolvedImage,
                hasVisualDescription,
                sectionCount,
                visualData,
                createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
            };
        });

        // Total missing count across all products
        const totalProducts = await Post.countDocuments({ type: "product", status: { $ne: "trash" } });
        const allCompletedDocs = await PostInfo.find({
            name: "_visual_description",
            value: { $exists: true, $ne: "" },
        }).select("postId value").lean();

        const validCompletedCount = allCompletedDocs.filter((d: any) => {
            const val = String(d.value || "").trim();
            return val.length > 5 && val !== "{}" && val !== "null";
        }).length;

        const totalMissingCount = Math.max(0, totalProducts - validCompletedCount);

        return NextResponse.json({
            posts: items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
                totalMissingCount,
                totalCompletedCount: validCompletedCount,
                totalProducts,
            },
        });
    } catch (err: any) {
        console.error("Error fetching visual description posts:", err);
        return NextResponse.json({ error: err.message || "Failed to load products" }, { status: 500 });
    }
}
