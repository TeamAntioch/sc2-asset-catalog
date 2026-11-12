// A fetch that answers as SC2GameData and the gallery's file list would, for five doodads the
// shipped descriptions describe: what the Finder extracts on its first start, with no network.
import { GALLERY_TREE_URL } from "@team-antioch/sc2-asset-catalog/catalog/extract-catalog.js";
import { SC2_GAME_DATA_URL } from "@team-antioch/sc2-asset-catalog/catalog/extract-doodads.js";

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

export const FAKE_DOODADS = ["AlarmLight", "DOM_Crate", "Decal", "PortZionStorage", "SpaceDockArch"] as const;

const TABLE: Record<string, string> = {
  [`${SC2_GAME_DATA_URL}/mods/liberty.sc2mod/base.sc2data/GameData/ActorData.xml`]: catalog(FAKE_DOODADS.map((id) => `    <CActorDoodad id="${id}"/>`).join("\n")),
  [`${SC2_GAME_DATA_URL}/mods/liberty.sc2mod/base.sc2data/GameData/ModelData.xml`]: catalog(FAKE_DOODADS.map((id) => `    <CModel id="${id}"/>`).join("\n")),
  [`${SC2_GAME_DATA_URL}/mods/liberty.sc2mod/enus.sc2data/LocalizedData/ObjectStrings.txt`]: "Actor/Name/DOM_Crate=Dominion Crate\nActor/Name/AlarmLight=Alarm Light\n",
  [GALLERY_TREE_URL]: JSON.stringify({ tree: [{ path: "public/doodads/Dominion_Crate.jpg" }] }),
};

/** The fake fetch, and every URL it was asked for. */
export function fakeGameData(): { readonly fetch: typeof globalThis.fetch; readonly asked: string[] } {
  const asked: string[] = [];
  const fetch = (async (url: string | URL) => {
    asked.push(String(url));
    const body = TABLE[String(url)];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}
