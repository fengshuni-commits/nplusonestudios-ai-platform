/**
 * Tavily Search API helper
 * Used to find real URLs for benchmark case studies
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
 * Search for a benchmark case study and return real URLs
 * Targets architecture/design websites like ArchDaily, Gooood, etc.
 */
export async function searchCaseStudy(caseName: string): Promise<string | null> {
  if (!TAVILY_API_KEY) {
    console.warn("[Tavily] TAVILY_API_KEY not set, skipping search");
    return null;
  }

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
        include_domains: [
          "archdaily.com",
          "archdaily.cn",
          "gooood.cn",
          "dezeen.com",
          "archello.com",
          "archinect.com",
          "worldarchitecture.org",
          "archpaper.com",
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[Tavily] Search failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as TavilySearchResponse;
    if (data.results && data.results.length > 0) {
      // Return the highest-scored result URL
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
  caseNames: string[]
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    caseNames.map(async (name) => {
      const url = await searchCaseStudy(name);
      return { name, url };
    })
  );

  return Object.fromEntries(results.map(({ name, url }) => [name, url]));
}
