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
 */
const DOMAIN_MAP: Record<string, string[]> = {
  office: [...BASE_DOMAINS, "officelovin.com", "interiordesign.net", "workplaceinsight.net"],
  exhibition: [...BASE_DOMAINS, "designboom.com", "exhibitormagazine.com", "exhibitionworld.co.uk"],
  commercial: [...BASE_DOMAINS, "retaildesignblog.net", "designboom.com", "vmsd.com"],
  residential: [...BASE_DOMAINS, "designboom.com", "dwell.com", "architecturaldigest.com"],
  cultural: [...BASE_DOMAINS, "designboom.com", "architecturalrecord.com", "museumsandheritage.com"],
  lab: [...BASE_DOMAINS, "designboom.com", "architecturalrecord.com", "interiordesign.net"],
  factory: [...BASE_DOMAINS, "designboom.com", "architecturalrecord.com", "interiordesign.net"],
  other: [...BASE_DOMAINS, "designboom.com", "architecturalrecord.com", "interiordesign.net"],
};

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
 * Generate a fallback search URL - uses archdaily search page
 * This is a valid, real URL that the LLM should keep as-is
 */
function getFallbackUrl(caseName: string): string {
  const encoded = encodeURIComponent(caseName);
  return `https://www.archdaily.com/search/projects?q=${encoded}`;
}

/**
 * Extract meaningful keywords from a case name for URL matching
 * Filters out common words that don't help identify a specific project
 */
function extractKeywords(caseName: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "of", "in", "at", "by", "for", "with", "and", "or",
    "office", "building", "center", "centre", "space", "design", "project",
    "architecture", "studio", "tower", "complex", "park", "campus",
    "设计", "建筑", "办公", "空间", "中心", "大楼", "园区",
  ]);
  return caseName
    .toLowerCase()
    .split(/[\s\-\/\(\)]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Check if a URL is likely to be a correct match for the case name.
 * For archdaily, the URL slug usually contains the project name keywords.
 * For gooood, the URL may be numeric but the title should match.
 */
function isUrlLikelyCorrect(result: TavilySearchResult, caseName: string): boolean {
  const keywords = extractKeywords(caseName);
  if (keywords.length === 0) return true; // can't validate, assume ok

  const urlLower = result.url.toLowerCase();
  const titleLower = result.title.toLowerCase();

  // For archdaily: URL slug should contain at least one keyword
  if (urlLower.includes("archdaily.com") || urlLower.includes("archdaily.cn")) {
    // archdaily URL format: /123456/project-name-slug
    // Check if the slug part contains a keyword
    const hasKeywordInUrl = keywords.some(kw => urlLower.includes(kw));
    const hasKeywordInTitle = keywords.filter(kw => titleLower.includes(kw)).length >= Math.min(2, keywords.length);
    return hasKeywordInUrl || hasKeywordInTitle;
  }

  // For gooood: title match is sufficient (URLs are often numeric)
  if (urlLower.includes("gooood.cn")) {
    const matchCount = keywords.filter(kw => titleLower.includes(kw)).length;
    return matchCount >= Math.min(1, keywords.length);
  }

  // For other domains: at least one keyword in title or URL
  return keywords.some(kw => titleLower.includes(kw) || urlLower.includes(kw));
}

/**
 * Score a search result for relevance to the case name
 */
function scoreResult(result: TavilySearchResult, caseName: string): number {
  let score = result.score || 0;
  const nameLower = caseName.toLowerCase();
  const titleLower = result.title.toLowerCase();
  const urlLower = result.url.toLowerCase();
  const contentLower = result.content.toLowerCase();

  const keywords = nameLower.split(/[\s\-\/]+/).filter(w => w.length > 2);
  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 0.3;
    if (urlLower.includes(kw)) score += 0.2;
    if (contentLower.includes(kw)) score += 0.1;
  }

  // Penalize generic listing/search/tag pages
  if (
    urlLower.includes("/search") ||
    urlLower.includes("?q=") ||
    urlLower.includes("/tag/") ||
    urlLower.includes("/category/") ||
    urlLower.includes("/type/") ||
    urlLower.includes("/topics/")
  ) {
    score -= 0.8;
  }

  // Boost project-specific pages (archdaily style numeric ID in URL)
  if (/\/\d{6,}\//.test(result.url)) score += 0.3;

  // Boost gooood results (usually very accurate for Chinese projects)
  if (urlLower.includes("gooood.cn")) score += 0.2;

  // Penalize results that don't match the case name well
  if (!isUrlLikelyCorrect(result, caseName)) {
    score -= 0.6;
  }

  return score;
}

/**
 * Perform a single Tavily search
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
 * Search for a benchmark case study and return a verified URL.
 *
 * Strategy:
 * 1. Try Chinese query first (gooood.cn is very accurate for Chinese projects)
 * 2. Try English query for international sites (archdaily, dezeen)
 * 3. Score and validate results - penalize archdaily links that don't match case name
 * 4. Fall back to archdaily search page (a real, valid URL) if no good match found
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
    // Strategy 1: Chinese query - gooood.cn is very accurate for Chinese architecture projects
    try {
      const chineseQuery = `${caseName} 建筑设计`;
      const chineseResults = await tavilySearch(chineseQuery, ["gooood.cn", "archdaily.cn"], 5);
      allResults.push(...chineseResults);
    } catch {
      // Chinese search failure is non-critical
    }

    // Strategy 2: English query - better for international sites
    const englishQuery = `${caseName} architecture design`;
    const englishResults = await tavilySearch(englishQuery, domains, 5);
    allResults.push(...englishResults);

    if (allResults.length === 0) {
      console.warn(`[Tavily] No results for "${caseName}", using fallback`);
      return getFallbackUrl(caseName);
    }

    // Score, validate, and sort results
    const scored = allResults
      .map(r => ({ result: r, score: scoreResult(r, caseName) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];

    // Log for debugging
    console.log(`[Tavily] Best match for "${caseName}": score=${best.score.toFixed(2)} url=${best.result.url}`);

    // If best score is too low, the result is unreliable - use fallback search page
    // The fallback is a real archdaily search URL, not a fabricated project URL
    if (best.score < 0.3) {
      console.warn(`[Tavily] Low confidence for "${caseName}" (score=${best.score.toFixed(2)}), using search page fallback`);
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
 * Returns a map of caseName -> URL
 */
export async function searchCaseStudies(
  caseNames: string[],
  projectType?: string
): Promise<Record<string, string>> {
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
    if (i + BATCH_SIZE < caseNames.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
