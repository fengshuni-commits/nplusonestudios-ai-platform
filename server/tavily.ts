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
 * Generate a fallback search URL - uses a general web search
 */
function getFallbackUrl(caseName: string, projectType?: string): string {
  const encoded = encodeURIComponent(caseName);
  // Use gooood for Chinese projects, archdaily for others
  if (projectType && ['office', 'exhibition', 'commercial', 'lab', 'factory'].includes(projectType.toLowerCase())) {
    return `https://www.gooood.cn/?s=${encoded}`;
  }
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
 * Low-quality domains to exclude from all searches.
 * These tend to produce irrelevant aggregator pages, ads, or social noise.
 */
const EXCLUDE_DOMAINS = [
  "pinterest.com",
  "pinterest.cn",
  "zhihu.com",
  "baidu.com",
  "baike.baidu.com",
  "weibo.com",
  "douban.com",
  "taobao.com",
  "jd.com",
  "amazon.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "reddit.com",
  "quora.com",
  "wikipedia.org",
];

/**
 * Perform a single Tavily search (open web, no domain restriction)
 */
async function tavilySearch(
  query: string,
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
      exclude_domains: EXCLUDE_DOMAINS,
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

  let allResults: TavilySearchResult[] = [];

  try {
    // Get current year for recency filtering
    const currentYear = new Date().getFullYear();

    // Strategy 1: Chinese query with recent year hint
    try {
      const chineseQuery = `${caseName} 设计 ${currentYear - 1}`;
      const chineseResults = await tavilySearch(chineseQuery, 5);
      allResults.push(...chineseResults);
    } catch {
      // Chinese search failure is non-critical
    }

    // Strategy 2: English query with recent years hint
    const englishQuery = `${caseName} design ${currentYear - 2} ${currentYear - 1} ${currentYear}`;
    const englishResults = await tavilySearch(englishQuery, 5);
    allResults.push(...englishResults);

    // Strategy 3: Fallback without year if no results yet
    if (allResults.length === 0) {
      try {
        const fallbackResults = await tavilySearch(`${caseName} design`, 5);
        allResults.push(...fallbackResults);
      } catch { /* ignore */ }
    }

    if (allResults.length === 0) {
      console.warn(`[Tavily] No results for "${caseName}", using fallback`);
      return getFallbackUrl(caseName, projectType);
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
      return getFallbackUrl(caseName, projectType);
    }

    return best.result.url;
  } catch (err) {
    console.error(`[Tavily] Search error for "${caseName}":`, err);
    return getFallbackUrl(caseName);
  }
}

/**
 * Search for images of a specific case study
 * Returns up to 2 image URLs
 */
export async function searchCaseImages(
  caseName: string,
  projectType?: string
): Promise<string[]> {
  if (!TAVILY_API_KEY) return [];

  try {
    const query = `${caseName} design space`;
    const response = await fetch(`${TAVILY_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: 3,
        search_depth: "basic",
        include_images: true,
        exclude_domains: EXCLUDE_DOMAINS,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as TavilySearchResponse & { images?: string[] };
    const images = (data.images || []).filter((url: string) => {
      // Filter out low-quality or irrelevant images
      const u = url.toLowerCase();
      return (
        (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) &&
        !u.includes('logo') &&
        !u.includes('avatar') &&
        !u.includes('icon') &&
        !u.includes('thumbnail') &&
        url.length < 500
      );
    });
    console.log(`[Tavily] Images for "${caseName}": ${images.length} found`);
    return images.slice(0, 2);
  } catch (err) {
    console.error(`[Tavily] Image search error for "${caseName}":`, err);
    return [];
  }
}

/**
 * Search for images of multiple case studies in parallel
 * Returns a map of caseName -> imageUrls[]
 */
export async function searchCaseStudyImages(
  caseNames: string[],
  projectType?: string
): Promise<Record<string, string[]>> {
  const BATCH_SIZE = 3;
  const results: Record<string, string[]> = {};

  for (let i = 0; i < caseNames.length; i += BATCH_SIZE) {
    const batch = caseNames.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const images = await searchCaseImages(name, projectType);
        return { name, images };
      })
    );
    for (const { name, images } of batchResults) {
      results[name] = images;
    }
    if (i + BATCH_SIZE < caseNames.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
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
