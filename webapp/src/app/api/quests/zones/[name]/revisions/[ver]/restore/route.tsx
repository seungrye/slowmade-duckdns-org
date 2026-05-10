import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Zone from "@/models/zone";
import ZoneRevision from "@/models/zone-revision";

type Params = { params: Promise<{ name: string; ver: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name, ver } = await params;
  const decoded = decodeURIComponent(name);
  const version = Number(ver);

  const zone = await Zone.findOne({ name: decoded });
  if (!zone) return apiError("zone 을 찾을 수 없습니다.", 404);

  const revision = await ZoneRevision.findOne({ zoneId: zone._id, version })
    .lean<{ zone: Record<string, unknown> }>();
  if (!revision) return apiError(`버전 ${version}을 찾을 수 없습니다.`, 404);

  // 현재 상태 백업
  await ZoneRevision.create({
    zoneId: zone._id,
    version: zone.version,
    zone: {
      name: zone.name,
      generator: zone.generator,
      description: zone.description,
    },
  });

  const def = revision.zone;
  zone.generator = (def.generator as string) ?? zone.generator;
  zone.description = (def.description as string) ?? zone.description;
  zone.version = (zone.version ?? 1) + 1;

  await zone.save();
  return apiSuccess(zone, 200, `버전 ${version}으로 롤백 완료`);
}
