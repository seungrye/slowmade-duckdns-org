import { connectToDB } from "@/lib/db";
import WebAdventureScene from "@/models/web-adventure-scene";
import type { Scene } from "@/types/web-adventure";
import ScenesClient from "./scenes-client";

// 씬 CMS 목록은 편집이 잦아 매 요청 최신을 SSR 한다(초기 CSR 스피너 제거).
export const dynamic = "force-dynamic";

export default async function ScenesPage() {
  await connectToDB();
  const docs = await WebAdventureScene.find({}).sort({ id: 1 }).lean();
  // lean 결과(ObjectId/Date 포함)를 client prop 으로 넘기기 위해 JSON 직렬화로 평문화.
  const initialScenes = JSON.parse(JSON.stringify(docs)) as Scene[];
  return <ScenesClient initialScenes={initialScenes} />;
}
