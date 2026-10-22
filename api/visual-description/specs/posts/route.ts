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

        // Handle missing / completed filters for specifications
        if (filter === "missing") {
            const completedDocs = await PostInfo.find({
                name: { $in: ["_specifications", "specifications"] },
                value: { $exists: true, $ne: "" },
            }).select("postId value").lean();

            const completedPostIds = completedDocs
                .filter((d: any) => {
                    const val = String(d.value || "").trim();
                    return val.length > 5 && val !== "[]" && val !== "{}";
                })
                .map((d: any) => d.postId);

            query._id = { $nin: completedPostIds };
        } else if (filter === "completed") {
            const completedDocs = await PostInfo.find({
                name: { $in: ["_specifications", "specifications"] },
                value: { $exists: true, $ne: "" },
            }).select("postId value").lean();

            const completedPostIds = completedDocs
                .filter((d: any) => {
                    const val = String(d.value || "").trim();
                    return val.length > 5 && val !== "[]" && val !== "{}";
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
            .select("_id title slug category status createdAt")
            .lean();

        const postIds = posts.map((p) => p._id);

        // Fetch PostInfo for specifications, images, variate
        const postInfos = await PostInfo.find({
            postId: { $in: postIds },
            name: { $in: ["_specifications", "specifications", "_variate", "images", "featuredImage", "_thumbnail"] },
        }).lean();

        // Group postInfo by postId
        const infoMap = new Map<string, Record<string, any>>();
        postInfos.forEach((info) => {
            const pid = String(info.postId);
            if (!infoMap.has(pid)) {
                infoMap.set(pid, {});
            }
            infoMap.get(pid)![info.name] = info.value;
        });

        // Compute overall missing vs completed counts
        const allCompletedPostInfo = await PostInfo.find({
            name: { $in: ["_specifications", "specifications"] },
            value: { $exists: true, $ne: "" },
        }).select("postId value").lean();

        const validCompletedIds = new Set(
            allCompletedPostInfo
                .filter((d: any) => {
                    const val = String(d.value || "").trim();
                    return val.length > 5 && val !== "[]" && val !== "{}";
                })
                .map((d: any) => String(d.postId))
        );

        const totalProducts = await Post.countDocuments({ type: "product", status: { $ne: "trash" } });
        const totalCompletedCount = validCompletedIds.size;
        const totalMissingCount = Math.max(0, totalProducts - totalCompletedCount);

        // Format rows
        const items = posts.map((p) => {
            const pid = String(p._id);
            const infos = infoMap.get(pid) || {};

            let specifications: any[] = [];
            const rawSpecs = infos._specifications || infos.specifications;
            if (rawSpecs) {
                try {
                    const parsed = JSON.parse(rawSpecs);
                    specifications = Array.isArray(parsed) ? parsed : [];
                } catch {
                    specifications = [];
                }
            }

            const boxCount = specifications.length;
            const fieldCount = specifications.reduce((sum, b) => sum + (Array.isArray(b?.fields) ? b.fields.length : 0), 0);
            const hasSpecifications = boxCount > 0 && fieldCount > 0;

            // Extract primary product image
            let image = "";
            if (infos._variate) {
                try {
                    const variate = typeof infos._variate === "string" ? JSON.parse(infos._variate) : infos._variate;
                    if (Array.isArray(variate?.variants) && variate.variants[0]?.image) {
                        image = variate.variants[0].image;
                    }
                } catch {}
            }
            if (!image && infos.images) {
                try {
                    const imgs = typeof infos.images === "string" ? JSON.parse(infos.images) : infos.images;
                    if (Array.isArray(imgs) && imgs[0]) image = imgs[0];
                } catch {}
            }
            if (!image) {
                image = infos.featuredImage || infos._thumbnail || "";
            }

            return {
                id: pid,
                title: p.title || "Untitled Product",
                slug: p.slug || "",
                category: p.category || "",
                status: p.status || "publish",
                image,
                hasSpecifications,
                boxCount,
                fieldCount,
                specifications: hasSpecifications ? specifications : null,
            };
        });

        return NextResponse.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
            totalMissingCount,
            totalCompletedCount,
            totalProducts,
            items,
        });
    } catch (err: any) {
        console.error("Error fetching products for bulk specifications:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch products" }, { status: 500 });
    }
}
