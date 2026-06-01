import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import { HOME_LANDMARKS, type HomeLandmark } from "@/types/villager";

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

function isValidHomeLandmark(v: unknown): v is HomeLandmark {
  return typeof v === "string" && (HOME_LANDMARKS as readonly string[]).includes(v);
}

export async function GET() {
  await connectToDB();
  const villagers = await Villager.find({}).sort({ id: 1 }).lean();
  return apiSuccess(villagers);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  if (typeof body.id !== "string" || !body.id.trim()) {
    return apiError("id 는 필수입니다.", 400);
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return apiError("name 은 필수입니다.", 400);
  }
  if (!isValidColor(body.color)) {
    return apiError("color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.", 400);
  }
  if (body.homeLandmark !== undefined && !isValidHomeLandmark(body.homeLandmark)) {
    return apiError(
      `homeLandmark 는 ${HOME_LANDMARKS.join("/")} 중 하나여야 합니다.`,
      400,
    );
  }
  if (body.vendorVisionRadius !== undefined && body.vendorVisionRadius !== null
      && (typeof body.vendorVisionRadius !== "number"
          || !Number.isInteger(body.vendorVisionRadius)
          || body.vendorVisionRadius < 0)) {
    return apiError("vendorVisionRadius 는 0 이상의 정수 또는 null 이어야 합니다.", 400);
  }

  const existing = await Villager.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 villager id 입니다: ${body.id}`, 409);

  const villager = await Villager.create({
    id: body.id,
    name: body.name,
    color: body.color,
    dialogs: body.dialogs ?? [],
    speed: body.speed ?? 1.0,
    stationary: body.stationary ?? false,
    vendor: body.vendor ?? false,
    // homeZone — 미지정 시 schema default(`{ type: "Town" }`) 가 적용된다.
    homeZone: body.homeZone,
    // homeLandmark — 미지정 시 schema default("random") 가 적용된다.
    homeLandmark: body.homeLandmark,
    // freeRoam — 미지정 시 schema default(false) 가 적용된다.
    freeRoam: body.freeRoam ?? false,
    // vendorVisionRadius — null/미지정 시 schema default(null) → 게임 측 fallback (6).
    vendorVisionRadius: body.vendorVisionRadius ?? null,
  });

  return apiSuccess(villager, 201);
}
