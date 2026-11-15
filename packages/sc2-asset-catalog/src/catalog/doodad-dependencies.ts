// The map dependency that brings each SC2GameData package's doodads into a map. The base mods
// come with the default `Void (Mod)`; campaign and story packages need their campaign (an
// InfestedHomeSmall shows as an unknown doodad until the map depends on the Void campaign and
// story).
const VOID_CAMPAIGN = "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign";
const VOID_STORY = "bnet:Void Story (Campaign)/0.0/999,file:Campaigns/VoidStory.SC2Campaign";
const NOVA_ASSETS = "bnet:Nova Covert Ops (Art Mod)/0.0/999,file:Mods/NovaStoryAssets.SC2Mod";

const DEPENDENCY_FOR_PACKAGE: Record<string, string> = {
  "campaigns/liberty.sc2campaign": VOID_CAMPAIGN,
  "campaigns/swarm.sc2campaign": VOID_CAMPAIGN,
  "campaigns/void.sc2campaign": VOID_CAMPAIGN,
  "campaigns/libertystory.sc2campaign": VOID_STORY,
  "campaigns/swarmstory.sc2campaign": VOID_STORY,
  "campaigns/voidstory.sc2campaign": VOID_STORY,
  "mods/novastoryassets.sc2mod": NOVA_ASSETS,
};

/** The name of the dependency every map has by default; what the base mods need, and so what an id with no `dependency` needs. */
export const DEFAULT_DEPENDENCY_NAME = "Void (Mod)";

/** The dependencies the catalog knows by name, each once: what a map can say it has. */
export const knownDependencies = (): string[] => [...new Set(Object.values(DEPENDENCY_FOR_PACKAGE))];

const BASE_MODS = new Set(["core", "liberty", "swarm", "void"].map((mod) => `mods/${mod}.sc2mod`));

/**
 * The map dependency a package's doodads need: undefined for the base mods, which come with the
 * default `Void (Mod)`. For a package with no known dependency (the Void prologue), a note naming
 * it in brackets, `(unknown dependency for <package>)`, for the mapper to add by hand.
 */
export function packageDependency(pkg: string): string | undefined {
  if (BASE_MODS.has(pkg)) return undefined;
  return DEPENDENCY_FOR_PACKAGE[pkg] ?? `(unknown dependency for ${pkg})`;
}

/** Whether a map's dependencies `have` bring in `dependency`. Void Story depends on the Void campaign, so it brings the campaign's doodads too. */
export function providesDependency(have: readonly string[], dependency: string): boolean {
  return have.includes(dependency) || (dependency === VOID_CAMPAIGN && have.includes(VOID_STORY));
}

/**
 * The dependencies missing from `have` that the given doodad types need, each with the doodads
 * that need it; `packageOf` gives a doodad's SC2GameData package (an extracted catalog entry's).
 * Doodads from packages with no known dependency (the Void prologue) are listed under their
 * package so the mapper can add it by hand.
 */
export function missingDoodadDependencies(types: Iterable<string>, have: readonly string[], packageOf: (type: string) => string | undefined): Map<string, string[]> {
  const missing = new Map<string, string[]>();
  for (const type of new Set(types)) {
    const pkg = packageOf(type);
    if (!pkg) continue;
    const dependency = packageDependency(pkg);
    if (dependency === undefined || providesDependency(have, dependency)) continue;
    missing.set(dependency, [...(missing.get(dependency) ?? []), type]);
  }
  return missing;
}

/** A dependency's name, as `bnet:Void (Campaign)/0.0/999,file:…` gives it; a note for an unknown one as it is. */
export const dependencyName = (dependency: string): string => /^bnet:([^/]+)\//.exec(dependency)?.[1] ?? dependency;
