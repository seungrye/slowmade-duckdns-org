import { connectToDB } from "@/lib/db";
import WebAdventureScene from "@/models/web-adventure-scene";
import type { Scene } from "@/types/web-adventure";
import ScenesClient from "./scenes-client";

// The scene CMS list is edited often, so the latest is SSR'd on every request (removing the initial CSR spinner).
export const dynamic = "force-dynamic";

export default async function ScenesPage() {
  await connectToDB();
  const docs = await WebAdventureScene.find({ isDeleted: { $ne: true } }).sort({ id: 1 }).lean();
  // The lean result (carrying ObjectIds and Dates) is flattened by JSON serialisation so it can be passed as a client prop.
  const initialScenes = JSON.parse(JSON.stringify(docs)) as Scene[];
  return <ScenesClient initialScenes={initialScenes} />;
}
