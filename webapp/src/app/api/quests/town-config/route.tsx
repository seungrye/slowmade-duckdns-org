import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import TownConfig from "@/models/town-config";
import { validateTownConfig, normalizeTownConfig } from "@/lib/town-config-validation";
import { TOWN_CONFIG_DEFAULTS } from "@/types/town-config";

// 시작 마을(ZoneId::Town) 의 생성 옵션 단일 doc API.
// GET → 현재 doc. 없으면 TOWN_CONFIG_DEFAULTS 반환.
// PUT → upsert.
//
// 권한: 다른 카탈로그 PUT 들과 동일하게 별도 인증 없음(기존 패턴 따름).
//      필요 시 middleware 가 quests 경로를 통합 가드.

export async function GET() {
  await connectToDB();
  const doc = await TownConfig.findById("default").lean();
  if (!doc) {
    return apiSuccess({
      _id: "default",
      ...TOWN_CONFIG_DEFAULTS,
      version: 0,
    });
  }
  return apiSuccess(doc);
}

export async function PUT(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  const v = validateTownConfig(body);
  if (!v.ok) return apiError(v.message, 400);

  const def = normalizeTownConfig(body as Record<string, unknown>);

  const existing = await TownConfig.findById("default");
  if (existing) {
    existing.size = def.size;
    existing.roads = def.roads;
    existing.wealth = def.wealth;
    existing.defenses = def.defenses;
    existing.landmarks = def.landmarks;
    existing.fields = def.fields;
    existing.environment = def.environment;
    existing.version = (existing.version ?? 1) + 1;
    await existing.save();
    return apiSuccess(existing);
  } else {
    const created = await TownConfig.create({
      _id: "default",
      ...def,
      version: 1,
    });
    return apiSuccess(created, 201);
  }
}
