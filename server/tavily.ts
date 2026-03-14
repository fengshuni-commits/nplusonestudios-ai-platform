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
    "officelovin.com",
    "interiordesign.net",
    "workplaceinsight.net",
  ],
  // 展厅 / 展览 - exhibition
  exhibition: [
    ...BASE_DOMAINS,
    "designboom.com",
    "exhibitormagazine.com",
    "exhibitionworld.co.uk",
  ],
  // 商业空间 - commercial
  commercial: [
    ...BASE_DOMAINS,
    "retaildesignblog.net",
    "designboom.com",
    "vmsd.com",
  ],
  // 住宅 - residential
  residential: [
    ...BASE_DOMAINS,
    "designboom.com",
    "dwell.com",
    "architecturaldigest.com",
  ],
  // 文化空间 - cultural
  cultural: [
    ...BASE_DOMAINS,
    "designboom.com",
    "architecturalrecord.com",
    "museumsandheritage.com",
  ],
  // 研发实验室 - lab
  lab: [
    ...BASE_DOMAINS,
    "designboom.com",
    "architecturalrecord.com",
    "interiordesign.net",
  ],
  // 工厂厂房 - factory
  factory: [
    ...BASE_DOMAINS,
    "designboom.com",
    "architecturalrecord.com",
    "interiordesign.net",
  ],
  // 其他 - other (fallback)
  other: [
    ...BASE_DOMAINS,
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
  const key = projectType.toLowerCase();
  if (DOMAIN_MAP[key]) return DOMAIN_MAP[key];
  for (const [mapKey, domains] of Object.entries(DOMAIN_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return domains;
  }
  return DOMAIN_MAP.other;
}

/**
 * Generate a fallback search URL when Tavily returns no results
 */
function getFallbackUrl(caseName: string): string {
  const encoded = encodeURIComponent(caseName);
  return `https://www.archdaily.com/search/projects?q=${encoded}`;
}

/**
 * Score a search result for relevance to the case name
 * Higher score = more relevant
 */
function scoreResult(result: TavilySearchResult, caseName: string): number {
  let score = result.score || 0;
  const nameLower = caseName.toLowerCase();
  const titleLower = result.title.toLowerCase();
  const urlLower = result.url.toLowerCase();
  const contentLower = result.content.toLowerCase();

  // Boost if title contains key words from case name
  const keywords = nameLower.split(/[\s\-\/]+/).filter(w => w.length > 2);
  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 0.3;
    if (urlLower.includes(kw)) score += 0.2;
    if (contentLower.includes(kw)) score += 0.1;
  }

  // Penalize generic listing/search pages
  if (urlLower.includes("/search") || urlLower.includes("?q=") || urlLower.includes("/tag/") || urlLower.includes("/category/")) {
    score -= 0.5;
  }

  // Boost project-specific pages (contain year or project-like path)
  if (/\/\d{6,}\//.test(result.url)) score += 0.2; // archdaily style ID in URL

  return score;
}

/**
 * Perform a single Tavily search with given query and domains
 */
async function tavilySearch(
  query: string,
  domains: string[],
  maxResults = 5
): Promise<TavilySearchResult[]> {
  const response = await fetch(`${TAVILY_BASE_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_domains: domains,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TavilySearchResponse;
  return data.results || [];
}

/**
 * Search for a benchmark case study and return real URLs.
 * Strategy:
 * 1. Try English query first (better for international architecture sites)
 * 2. If no good results, try Chinese query (for gooood.cn etc.)
 * 3. Score results by relevance, pick best
 * 4. Fall back to ArchDaily search URL if nothing found
 */
export async function searchCaseStudy(
  caseName: string,
  projectType?: string
): Promise<string> {
  if (!TAVILY_API_KEY) {
    console.warn("[Tavily] TAVILY_API_KEY not set, using fallback");
    return getFallbackUrl(caseName);
  }

  const domains = getSearchDomains(projectType);
  let allResults: TavilySearchResult[] = [];

  try {
    // Strategy 1: English query - better for archdaily, dezeen, designboom
    const englishQuery = `${caseName} architecture design project`;
    const englishResults = await tavilySearch(englishQuery, domains, 5);
    allResults.push(...englishResults);

    // Strategy 2: If few results, also try Chinese query for gooood.cn
    if (allResults.length < 3) {
      try {
        const chineseQuery = `${caseName} 建筑设计`;
        const chineseResults = await tavilySearch(chineseQuery, ["gooood.cn", "archdaily.cn"], 3);
        allResults.push(...chineseResults);
      } catch {
        // Chinese search failure is non-critical
      }
    }

    if (allResults.length === 0) {
      console.warn(`[Tavily] No results for "${caseName}", using fallback`);
      return getFallbackUrl(caseName);
    }

    // Score and sort results
    const scored = allResults
      .map(r => ({ result: r, score: scoreResult(r, caseName) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    // If best score is very low, use fallback
    if (best.score < 0.1) {
      return getFallbackUrl(caseName);
    }

    return best.result.url;
  } catch (err) {
    console.error(`[Tavily] Search error for "${caseName}":`, err);
    return getFallbackUrl(caseName);
  }
}

/**
 * Search for multiple case studies in parallel
 * Returns a map of caseName -> URL (always has a value, fallback if not found)
 */
export async function searchCaseStudies(
  caseNames: string[],
  projectType?: string
): Promise<Record<string, string>> {
  // Limit concurrency to avoid rate limiting
  const BATCH_SIZE = 3;
  const results: Record<string, string> = {};

  for (let i = 0; i < caseNames.length; i += BATCH_SIZE) {
    const batch = caseNames.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const url = await searchCaseStudy(name, projectType);
        return { name, url };
      })
    );
    for (const { name, url } of batchResults) {
      results[name] = url;
    }
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < caseNames.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
