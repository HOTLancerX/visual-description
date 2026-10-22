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
            return NextResponse.json({ error: "No specification items provided to save." }, { status: 400 });
        }

        const validItems = items.filter((item: any) => item && item.id && item.specifications);
        if (validItems.length === 0) {
            return NextResponse.json({ success: true, savedCount: 0 });
        }

        const bulkOps: any[] = [];

        validItems.forEach((item: any) => {
            const serialized = typeof item.specifications === "string"
                ? item.specifications
                : JSON.stringify(item.specifications);

            // Upsert _specifications
            bulkOps.push({
                updateOne: {
                    filter: {
                        postId: item.id,
                        name: "_specifications",
                    },
                    update: {
                        $set: { value: serialized },
                    },
                    upsert: true,
                },
            });

            // Upsert specifications
            bulkOps.push({
                updateOne: {
                    filter: {
                        postId: item.id,
                        name: "specifications",
                    },
                    update: {
                        $set: { value: serialized },
                    },
                    upsert: true,
                },
            });
        });

        const result = await PostInfo.bulkWrite(bulkOps, { ordered: false });
        const savedCount = validItems.length;

        return NextResponse.json({
            success: true,
            totalRequested: items.length,
            savedCount,
            upsertedCount: result.upsertedCount || 0,
            modifiedCount: result.modifiedCount || 0,
        });
    } catch (err: any) {
        console.error("Error in specifications save API:", err);
        return NextResponse.json({ error: err.message || "Failed to save specifications" }, { status: 500 });
    }
}
