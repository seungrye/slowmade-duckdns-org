import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";

type Params = { params: Promise<{ name: string }> };

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const villager = await Villager.findOne({ name: decodeURIComponent(name) }).lean();
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);
  return apiSuccess(villager);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const body = await req.json();

  const villager = await Villager.findOne({ name: decoded });
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);

  if (body.color !== undefined && !isValidColor(body.color)) {
    return apiError("color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.", 400);
  }

  // 갱신 직전 현재 버전을 revision 으로 백업
  await VillagerRevision.create({
    villagerId: villager._id,
    version: villager.version,
    villager: {
      name: villager.name,
      color: villager.color,
      dialogs: villager.dialogs,
      questId: villager.questId,
      speed: villager.speed,
    },
  });

  if (body.color !== undefined) villager.color = body.color;
  if (body.dialogs !== undefined) villager.dialogs = body.dialogs;
  if (body.questId !== undefined) villager.questId = body.questId;
  if (body.speed !== undefined) villager.speed = body.speed;
  villager.version = (villager.version ?? 1) + 1;

  await villager.save();
  return apiSuccess(villager);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const villager = await Villager.findOne({ name: decoded });
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);
  await VillagerRevision.deleteMany({ villagerId: villager._id });
  await villager.deleteOne();
  return apiSuccess({ name: decoded });
}
