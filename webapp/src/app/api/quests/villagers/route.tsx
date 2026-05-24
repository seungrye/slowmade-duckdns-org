import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
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

  const existing = await Villager.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 villager id 입니다: ${body.id}`, 409);

  const villager = await Villager.create({
    id: body.id,
    name: body.name,
    color: body.color,
    dialogs: body.dialogs ?? [],
    speed: body.speed ?? 1.0,
  });

  return apiSuccess(villager, 201);
}
