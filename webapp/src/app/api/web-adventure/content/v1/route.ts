// /api/web-adventure/content/v1 - the combined content endpoint for the Web MUD client.
//
// It returns every scene at once and serves it with a light CDN cache (max-age=60).
// The version prefix (v1) leaves room to move to v2 should the content format break compatibility.

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import WebAdventureScene from "@/models/web-adventure-scene";
import { DEFAULT_VOICE, resolveBody, voiceCoverage } from "@/lib/web-adventure/voice";
import { items, INVENTORY_CAP } from "@/content/web-adventure/items";

// Public read-only content - the app (a Capacitor WebView, cross-origin) consumes it too, so CORS is allowed.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type SceneDoc = Record<string, unknown> & {
  body: string[];
  treatment?: string[];
  variants?: Record<string, string[]>;
};

/**
 * @param req ?voice= picks the prose style. Without it, the default style.
 *   The random choice is **the client's job** - a server drawing randomly every time could not cache its response.
 *   The client picks using the voices (coverage) sent alongside and then requests again with that value. (#73)
 */
export async function GET(req: Request) {
  await connectToDB();
  const docs = (await WebAdventureScene.find({ isDeleted: { $ne: true } }).lean()) as SceneDoc[];

  const requested = req?.url ? new URL(req.url).searchParams.get("voice") : null;
  const voice = requested || DEFAULT_VOICE;

  // The treatment (the skeleton) and variants are not sent to the client - they must not be exposed, and it saves payload.
  const scenes = docs.map((doc) => {
    const { treatment: _t, variants: _v, ...rest } = doc;
    void _t; void _v;
    return { ...rest, body: resolveBody(doc, voice) };
  });

  // #103 - the item catalogue is sent down too. The app uses it to draw names, descriptions and effects in the bag
  //   modal and to decide usability (kind === "consumable"). A mirror is not embedded in the app because
  //   maintaining it twice lets the copies diverge - keeping the prose rules on both sides already split the notation once.
  //   Being static data, it does not affect the cache policy (the 60 seconds below).
  return NextResponse.json(
    {
      success: true,
      data: { scenes, voice, voices: voiceCoverage(docs), items, inventoryCap: INVENTORY_CAP },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        ...CORS_HEADERS,
      },
    },
  );
}

// The CORS preflight - for the app WebView's cross-origin fetch.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
