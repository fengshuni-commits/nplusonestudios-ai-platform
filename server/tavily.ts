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
 * Base design media domains always included
 */
const BASE_DOMAINS = [
  "archdaily.com",
  "archdaily.cn",
  "gooood.cn",
  "dezeen.com",
  "archello.com",
  "designboom.com",
];

/**
 * Domain sets by project type
 */
const DOMAIN_MAP: Record<string, string[]> = {
  office: [...BASE_DOMAINS, "officelovin.com", "interiordesign.net", "workplaceinsight.net"],
  exhibition: [...BASE_DOMAINS, "exhibitormagazine.com", "exhibitionworld.co.uk", "frame-web.com"],
  commercial: [...BASE_DOMAINS, "retaildesignblog.net", "vmsd.com"],
  residential: [...BASE_DOMAINS, "dwell.com", "architecturaldigest.com"],
  cultural: [...BASE_DOMAINS, "architecturalrecord.com", "museumsandheritage.com"],
  lab: [...BASE_DOMAINS, "architecturalrecord.com", "interiordesign.net"],
  factory: [...BASE_DOMAINS, "architecturalrecord.com", "interiordesign.net"],
  other: [...BASE_DOMAINS, "architecturalrecord.com", "interiordesign.net"],
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
 * Generate a fallback search URL
 */
function getFallbackUrl(caseName: string, projectType?: string): string {
  const encoded = encodeURIComponent(caseName);
  // Use gooood for Chinese-named projects (contains CJK characters)
  if (/[\u4e00-\u9fff]/.test(caseName)) {
    return `https://www.gooood.cn/?s=${encoded}`;
  }
  if (projectType && ['office', 'exhibition', 'commercial', 'lab', 'factory'].includes(projectType.toLowerCase())) {
    return `https://www.gooood.cn/?s=${encoded}`;
  }
  return `https://www.archdaily.com/search/projects?q=${encoded}`;
}

/**
 * Extract meaningful keywords from a case name for URL matching
 */
function extractKeywords(caseName: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "of", "in", "at", "by", "for", "with", "and", "or",
    "office", "building", "center", "centre", "space", "design", "project",
    "architecture", "studio", "tower", "complex", "park", "campus", "global",
    "设计", "建筑", "办公", "空间", "中心", "大楼", "园区", "总部",
  ]);
  return caseName
    .toLowerCase()
    .split(/[\s\-\/\(\)]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Check if a URL is likely to be a correct match for the case name.
 */
function isUrlLikelyCorrect(result: TavilySearchResult, caseName: string): boolean {
  const keywords = extractKeywords(caseName);
  if (keywords.length === 0) return true;

  const urlLower = result.url.toLowerCase();
  const titleLower = result.title.toLowerCase();

  // For archdaily: URL slug should contain at least one keyword
  if (urlLower.includes("archdaily.com") || urlLower.includes("archdaily.cn")) {
    const hasKeywordInUrl = keywords.some(kw => urlLower.includes(kw));
    const hasKeywordInTitle = keywords.filter(kw => titleLower.includes(kw)).length >= Math.min(2, keywords.length);
    return hasKeywordInUrl || hasKeywordInTitle;
  }

  // For gooood: title match is sufficient
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
    urlLower.includes("/topics/") ||
    urlLower.includes("keyword=")
  ) {
    score -= 0.8;
  }

  // Boost project-specific pages (archdaily style numeric ID in URL)
  if (/\/\d{6,}\//.test(result.url)) score += 0.3;

  // Boost trusted design media
  if (urlLower.includes("gooood.cn")) score += 0.3;
  if (urlLower.includes("archdaily.com") || urlLower.includes("archdaily.cn")) score += 0.2;
  if (urlLower.includes("dezeen.com") || urlLower.includes("designboom.com")) score += 0.15;

  // Penalize non-design media (news sites, social, travel, etc.)
  const nonDesignDomains = [
    "tripadvisor", "sina.cn", "sina.com", "bilibili.com", "sohu.com",
    "163.com", "qq.com", "xueqiu.com", "pjtime.com", "kimley-horn.com",
    "truebeck.com", "usgbc.org", "constructingexcellence.org",
    "laconservancy.org", "phillyyimby.com",
  ];
  if (nonDesignDomains.some(d => urlLower.includes(d))) {
    score -= 1.0;
  }

  // Penalize results that don't match the case name well
  if (!isUrlLikelyCorrect(result, caseName)) {
    score -= 0.6;
  }

  return score;
}

/**
 * Low-quality domains to exclude from all searches.
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
  "tripadvisor.com",
  "tripadvisor.cn",
  "sina.cn",
  "sohu.com",
  "163.com",
  "qq.com",
];

/**
 * Perform a single Tavily search (open web, no domain restriction)
 */
async function tavilySearch(
  query: string,
  maxResults = 5,
  includeDomains?: string[]
): Promise<TavilySearchResult[]> {
  const body: Record<string, unknown> = {
    query,
    max_results: maxResults,
    search_depth: "basic",
    exclude_domains: EXCLUDE_DOMAINS,
  };
  if (includeDomains && includeDomains.length > 0) {
    body.include_domains = includeDomains;
  }

  const response = await fetch(`${TAVILY_BASE_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify(body),
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
 * 1. Try domain-restricted search on trusted design media first
 * 2. Try open web search as fallback
 * 3. Score and validate results
 * 4. Fall back to search page if no good match found
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
  const trustedDomains = getSearchDomains(projectType);

  try {
    // Strategy 1: Search within trusted design media domains
    try {
      const domainQuery = `${caseName}`;
      const domainResults = await tavilySearch(domainQuery, 5, trustedDomains);
      allResults.push(...domainResults);
    } catch {
      // Domain-restricted search failure is non-critical
    }

    // Strategy 2: Open web search with case name only (no year noise)
    if (allResults.length < 3) {
      try {
        const openQuery = /[\u4e00-\u9fff]/.test(caseName)
          ? `${caseName} 设计`
          : `${caseName} design`;
        const openResults = await tavilySearch(openQuery, 5);
        allResults.push(...openResults);
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

    // Higher threshold: if best score is too low, use fallback search page
    if (best.score < 0.8) {
      console.warn(`[Tavily] Low confidence for "${caseName}" (score=${best.score.toFixed(2)}), using search page fallback`);
      return getFallbackUrl(caseName, projectType);
    }

    return best.result.url;
  } catch (err) {
    console.error(`[Tavily] Search error for "${caseName}":`, err);
    return getFallbackUrl(caseName);
  }
}

/** A single image with its source page URL */
export interface CaseImage {
  imageUrl: string;
  sourcePageUrl: string;
}

/**
 * Search for images of a specific case study.
 * Uses per-result images (result.images) so each image is bound to its
 * actual source page URL, enabling correct click-through links.
 * Returns up to 2 CaseImage objects.
 */
export async function searchCaseImages(
  caseName: string,
  projectType?: string
): Promise<CaseImage[]> {
  if (!TAVILY_API_KEY) return [];

  const trustedDomains = getSearchDomains(projectType);

  try {
    const query = /[\u4e00-\u9fff]/.test(caseName)
      ? `${caseName} 设计`
      : `${caseName} design`;

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
        include_images: true,
        include_image_descriptions: false,
        include_domains: trustedDomains,
        exclude_domains: EXCLUDE_DOMAINS,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return [];

    type ResultWithImages = TavilySearchResult & {
      images?: Array<{ url: string; description?: string } | string>;
    };
    const data = (await response.json()) as {
      results?: ResultWithImages[];
      images?: Array<{ url: string; description?: string } | string>;
    };

    const collected: CaseImage[] = [];

    const isGoodImage = (url: string): boolean => {
      const u = url.toLowerCase();
      return (
        (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) &&
        !u.includes('logo') &&
        !u.includes('avatar') &&
        !u.includes('icon') &&
        !u.includes('thumbnail') &&
        !u.includes('banner') &&
        url.length < 500
      );
    };

    // Strategy 1: Use per-result images — each image is bound to result.url (true source page)
    if (data.results && data.results.length > 0) {
      for (const result of data.results) {
        if (!result.images || result.images.length === 0) continue;
        for (const imgItem of result.images) {
          const imgUrl = typeof imgItem === 'string' ? imgItem : imgItem.url;
          if (imgUrl && isGoodImage(imgUrl)) {
            collected.push({ imageUrl: imgUrl, sourcePageUrl: result.url });
            if (collected.length >= 2) break;
          }
        }
        if (collected.length >= 2) break;
      }
    }

    // Strategy 2: Fall back to top-level images, paired with best matching result URL
    if (collected.length === 0 && data.images && data.images.length > 0) {
      const bestResultUrl = data.results?.[0]?.url ?? '';
      for (const imgItem of data.images) {
        const imgUrl = typeof imgItem === 'string' ? imgItem : (imgItem as { url: string }).url;
        if (imgUrl && isGoodImage(imgUrl) && bestResultUrl) {
          collected.push({ imageUrl: imgUrl, sourcePageUrl: bestResultUrl });
          if (collected.length >= 2) break;
        }
      }
    }

    console.log(`[Tavily] Images for "${caseName}": ${collected.length} found`);
    return collected;
  } catch (err) {
    console.error(`[Tavily] Image search error for "${caseName}":`, err);
    return [];
  }
}

/**
 * Search for images of multiple case studies in parallel
 * Returns a map of caseName -> CaseImage[] (each image has imageUrl + sourcePageUrl)
 */
export async function searchCaseStudyImages(
  caseNames: string[],
  projectType?: string
): Promise<Record<string, CaseImage[]>> {
  const BATCH_SIZE = 3;
  const results: Record<string, CaseImage[]> = {};

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
