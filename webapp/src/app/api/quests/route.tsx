import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";

export async function GET() {
  await connectToDB();
  const quests = await Quest.find({}, { phases: 0 }).sort({ updatedAt: -1 }).lean();
  return apiSuccess(quests);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  if (!body.id || !body.title) return apiError("id와 title은 필수입니다.", 400);

  const existing = await Quest.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 퀘스트 ID입니다: ${body.id}`, 409);

  const quest = await Quest.create({
    id: body.id,
    title: body.title,
    giverNpc: body.giverNpc ?? "",
    initialPhase: body.initialPhase ?? "dormant",
    spawnChance: body.spawnChance ?? 1.0,
    phases: body.phases ?? {},
    transitions: body.transitions ?? [],
    spawns: body.spawns ?? [],
    version: 1,
  });

  return apiSuccess(quest, 201);
}
