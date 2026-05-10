import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Zone from "@/models/zone";

export async function GET() {
  await connectToDB();
  const zones = await Zone.find({}).sort({ name: 1 }).lean();
  return apiSuccess(zones);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  if (typeof body.name !== "string" || !body.name.trim()) {
    return apiError("name 은 필수입니다.", 400);
  }
  if (typeof body.generator !== "string" || !body.generator.trim()) {
    return apiError("generator 는 필수입니다.", 400);
  }

  const existing = await Zone.findOne({ name: body.name });
  if (existing) return apiError(`이미 존재하는 zone 입니다: ${body.name}`, 409);

  const zone = await Zone.create({
    name: body.name,
    generator: body.generator,
    description: typeof body.description === "string" ? body.description : "",
  });
  return apiSuccess(zone, 201);
}
