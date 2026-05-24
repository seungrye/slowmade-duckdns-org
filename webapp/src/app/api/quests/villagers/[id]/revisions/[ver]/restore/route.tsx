import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";

type Params = { params: Promise<{ id: string; ver: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id, ver } = await params;
  const decoded = decodeURIComponent(id);
  const version = Number(ver);

  const villager = await Villager.findOne({ id: decoded });
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);

  const revision = await VillagerRevision.findOne({ villagerId: villager._id, version })
    .lean<{ villager: Record<string, unknown> }>();
  if (!revision) return apiError(`버전 ${version}을 찾을 수 없습니다.`, 404);

  // 현재 상태를 revision 으로 백업 후 덮어쓰기
  await VillagerRevision.create({
    villagerId: villager._id,
    version: villager.version,
    villager: {
      id: villager.id,
      name: villager.name,
      color: villager.color,
      dialogs: villager.dialogs,
      speed: villager.speed,
    },
  });

  const def = revision.villager as Record<string, unknown>;
  villager.name = (def.name as string) ?? villager.name;
  villager.color = (def.color as number[]) ?? villager.color;
  villager.dialogs = (def.dialogs as string[]) ?? villager.dialogs;
  villager.speed = typeof def.speed === "number" ? def.speed : villager.speed;
  villager.version = (villager.version ?? 1) + 1;

  await villager.save();
  return apiSuccess(villager, 200, `버전 ${version}으로 롤백 완료`);
}
