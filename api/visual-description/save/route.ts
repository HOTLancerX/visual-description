import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PostInfo from "@/models/post_info";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();

        const body = await req.json();
        const { items = [] } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided to save." }, { status: 400 });
        }

        const validItems = items.filter((item: any) => item && item.id && item.visualData);
        if (validItems.length === 0) {
            return NextResponse.json({ success: true, savedCount: 0 });
        }

        const bulkOps = validItems.map((item: any) => ({
            updateOne: {
                filter: {
                    postId: item.id,
                    name: "_visual_description",
                },
                update: {
                    $set: {
                        value: typeof item.visualData === "string"
                            ? item.visualData
                            : JSON.stringify(item.visualData),
                    },
                },
                upsert: true,
            },
        }));

        const result = await PostInfo.bulkWrite(bulkOps, { ordered: false });
        const savedCount =
            (result.upsertedCount || 0) +
            (result.modifiedCount || 0) +
            (result.matchedCount || 0);

        return NextResponse.json({
            success: true,
            totalRequested: items.length,
            savedCount,
        });
    } catch (err: any) {
        console.error("Error in visual description save API:", err);
        return NextResponse.json({ error: err.message || "Failed to save visual descriptions" }, { status: 500 });
    }
}
