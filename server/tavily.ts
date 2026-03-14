/**
 * Tavily Search API helper
 * Used to find real URLs for benchmark case studies
 * Supports dynamic domain selection based on project type
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_BASE_URL = "https://api.tavily.com";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  results: TavilySearchResult[];
  query: string;
}

/**
 * Base architecture/design domains always included
 */
const BASE_DOMAINS = [
  "archdaily.com",
  "archdaily.cn",
  "gooood.cn",
  "dezeen.com",
  "archello.com",
];

/**
 * Domain sets by project type
 * projectType values match those in DesignPlanning.tsx
 */
const DOMAIN_MAP: Record<string, string[]> = {
  // 办公空间 - office
  office: [
    ...BASE_DOMAINS,
    "workplacedesign.com",
    "officelovin.com",
    "interiordesign.net",
    "officenewsroom.com",
  ],
  // 展厅 / 展览 - exhibition
  exhibition: [
    ...BASE_DOMAINS,
    "dezeen.com",
    "designboom.com",
    "exhibitormagazine.com",
    "exhibitionworld.co.uk",
    "exhibit-design.com",
  ],
  // 商业空间 - commercial
  commercial: [
    ...BASE_DOMAINS,
    "retaildesignblog.net",
    "dezeen.com",
    "designboom.com",
    "retaildesignworld.com",
    "vmsd.com",
  ],
  // 住宅 - residential
  residential: [
    ...BASE_DOMAINS,
    "dezeen.com",
    "designboom.com",
    "dwell.com",
    "architecturaldigest.com",
    "houzz.com",
  ],
  // 文化空间 - cultural
  cultural: [
    ...BASE_DOMAINS,
    "dezeen.com",
    "designboom.com",
    "architecturalrecord.com",
    "museumsandheritage.com",
    "culturalspaces.com",
  ],
  // 其他 - other (fallback)
  other: [
    ...BASE_DOMAINS,
    "dezeen.com",
    "designboom.com",
    "architecturalrecord.com",
    "interiordesign.net",
  ],
};

/**
 * Get search domains for a given project type
 */
export function getSearchDomains(projectType?: string): string[] {
  if (!projectType) return DOMAIN_MAP.other;
  // Normalize: try exact match first, then partial match
  const key = projectType.toLowerCase();
  if (DOMAIN_MAP[key]) return DOMAIN_MAP[key];
  // Partial match
  for (const [mapKey, domains] of Object.entries(DOMAIN_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return domains;
  }
  return DOMAIN_MAP.other;
}

/**
 * Search for a benchmark case study and return real URLs
 */
export async function searchCaseStudy(
  caseName: string,
  projectType?: string
): Promise<string | null> {
  if (!TAVILY_API_KEY) {
    console.warn("[Tavily] TAVILY_API_KEY not set, skipping search");
    return null;
  }

  const domains = getSearchDomains(projectType);

  try {
    const query = `${caseName} 建筑设计 案例`;
    const response = await fetch(`${TAVILY_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        search_depth: "basic",
        include_domains: domains,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[Tavily] Search failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as TavilySearchResponse;
    if (data.results && data.results.length > 0) {
      return data.results[0].url;
    }
    return null;
  } catch (err) {
    console.error("[Tavily] Search error:", err);
    return null;
  }
}

/**
 * Search for multiple case studies in parallel
 * Returns a map of caseName -> URL (null if not found)
 */
export async function searchCaseStudies(
  caseNames: string[],
  projectType?: string
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    caseNames.map(async (name) => {
      const url = await searchCaseStudy(name, projectType);
      return { name, url };
    })
  );

  return Object.fromEntries(results.map(({ name, url }) => [name, url]));
}
