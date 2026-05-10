import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Zone from "@/models/zone";
import ZoneRevision from "@/models/zone-revision";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const zone = await Zone.findOne({ name: decodeURIComponent(name) }).lean();
  if (!zone) return apiError("zone 을 찾을 수 없습니다.", 404);
  return apiSuccess(zone);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const body = await req.json();

  const zone = await Zone.findOne({ name: decoded });
  if (!zone) return apiError("zone 을 찾을 수 없습니다.", 404);

  if (body.generator !== undefined && (typeof body.generator !== "string" || !body.generator.trim())) {
    return apiError("generator 는 비어있지 않은 문자열이어야 합니다.", 400);
  }

  // 갱신 직전 현재 버전을 revision 으로 백업
  await ZoneRevision.create({
    zoneId: zone._id,
    version: zone.version,
    zone: {
      name: zone.name,
      generator: zone.generator,
      description: zone.description,
    },
  });

  if (body.generator !== undefined) zone.generator = body.generator;
  if (body.description !== undefined) zone.description = body.description;
  zone.version = (zone.version ?? 1) + 1;

  await zone.save();
  return apiSuccess(zone);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const zone = await Zone.findOne({ name: decoded });
  if (!zone) return apiError("zone 을 찾을 수 없습니다.", 404);
  await ZoneRevision.deleteMany({ zoneId: zone._id });
  await zone.deleteOne();
  return apiSuccess({ name: decoded });
}
