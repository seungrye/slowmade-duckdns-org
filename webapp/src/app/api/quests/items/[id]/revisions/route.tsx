import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import ItemRevision from "@/models/item-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  const item = await Item.findOne({ id: decoded }).select("_id").lean();
  if (!item) return apiError("item 을 찾을 수 없습니다.", 404);

  const revisions = await ItemRevision.find({ itemId: item._id })
    .sort({ version: -1 })
    .lean();

  return apiSuccess(revisions);
}
