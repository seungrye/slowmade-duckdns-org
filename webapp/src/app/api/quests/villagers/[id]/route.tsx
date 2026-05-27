import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";

type Params = { params: Promise<{ id: string }> };

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const villager = await Villager.findOne({ id: decodeURIComponent(id) }).lean();
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);
  return apiSuccess(villager);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const body = await req.json();

  const villager = await Villager.findOne({ id: decoded });
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);

  if (body.color !== undefined && !isValidColor(body.color)) {
    return apiError("color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.", 400);
  }

  // 갱신 직전 현재 버전을 revision 으로 백업
  await VillagerRevision.create({
    villagerId: villager._id,
    version: villager.version,
    villager: {
      id: villager.id,
      name: villager.name,
      color: villager.color,
      dialogs: villager.dialogs,
      speed: villager.speed,
      stationary: villager.stationary,
      vendor: villager.vendor,
    },
  });

  if (body.name !== undefined) villager.name = body.name;
  if (body.color !== undefined) villager.color = body.color;
  if (body.dialogs !== undefined) villager.dialogs = body.dialogs;
  if (body.speed !== undefined) villager.speed = body.speed;
  if (body.stationary !== undefined) villager.stationary = body.stationary;
  if (body.vendor !== undefined) villager.vendor = body.vendor;
  villager.version = (villager.version ?? 1) + 1;

  await villager.save();
  return apiSuccess(villager);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const villager = await Villager.findOne({ id: decoded });
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);
  await VillagerRevision.deleteMany({ villagerId: villager._id });
  await villager.deleteOne();
  return apiSuccess({ id: decoded });
}
