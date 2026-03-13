/**
 * Web scraper service for extracting real architecture case images
 * and Pexels API integration for design concept images.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { listCaseSources } from "./db";

// ─── Types ──────────────────────────────────────────────

export interface ScrapedCase {
  title: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  images: ScrapedImage[];
}

export interface ScrapedImage {
  url: string;
  alt: string;
  /** Image data as base64 for embedding in PPT */
  base64?: string;
}

export interface PexelsImage {
  url: string;
  photographerName: string;
  photographerUrl: string;
  alt: string;
  base64?: string;
}

// ─── Architecture Site Scraper ──────────────────────────

const SCRAPER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
};

/**
 * Scrape a specific project page from a known architecture site.
 * Uses the CSS selectors configured in the case_sources table.
 */
export async function scrapeProjectPage(url: string): Promise<ScrapedCase | null> {
  try {
    // Find matching case source config
    const sources = await listCaseSources(true);
    const matchingSource = sources.find(s => url.includes(new URL(s.baseUrl).hostname));

    const response = await axios.get(url, {
      headers: SCRAPER_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Extract title
    let title = "";
    if (matchingSource?.titleSelector) {
      title = $(matchingSource.titleSelector).first().text().trim();
    }
    if (!title) {
      title = $("h1").first().text().trim() || $("title").text().trim();
    }

    // Extract description
    let description = "";
    if (matchingSource?.descSelector) {
      const descParts: string[] = [];
      $(matchingSource.descSelector).each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20) descParts.push(text);
      });
      description = descParts.slice(0, 3).join("\n\n");
    }
    if (!description) {
      const paragraphs: string[] = [];
      $("article p, .entry-content p, .article-body p, main p").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) paragraphs.push(text);
      });
      description = paragraphs.slice(0, 3).join("\n\n");
    }

    // Extract images
    const images: ScrapedImage[] = [];
    const seenUrls = new Set<string>();

    // Strategy 1: Use configured selector
    if (matchingSource?.imageSelector) {
      $(matchingSource.imageSelector).each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          // Upgrade to large size if possible
          let largeUrl = src;
          if (matchingSource.preferredSize) {
            largeUrl = src.replace(/thumb_jpg|small_jpg|medium_jpg|newsletter/, matchingSource.preferredSize);
          }
          images.push({
            url: largeUrl,
            alt: $(el).attr("alt") || title,
          });
        }
      });
    }

    // Strategy 2: Generic image extraction as fallback
    if (images.length === 0) {
      $("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src");
        if (!src) return;
        // Filter out tiny images, icons, logos
        const width = parseInt($(el).attr("width") || "0");
        const height = parseInt($(el).attr("height") || "0");
        if (width > 0 && width < 200) return;
        if (height > 0 && height < 150) return;
        // Filter out common non-content patterns
        if (src.includes("logo") || src.includes("icon") || src.includes("avatar") || src.includes("sprite")) return;
        if (src.includes("data:image")) return;
        if (seenUrls.has(src)) return;
        seenUrls.add(src);
        images.push({
          url: src.startsWith("//") ? `https:${src}` : src,
          alt: $(el).attr("alt") || title,
        });
      });
    }

    // Also look for og:image as a high-quality fallback
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && !seenUrls.has(ogImage)) {
      images.unshift({ url: ogImage, alt: title });
    }

    if (!title && images.length === 0) return null;

    return {
      title,
      description: description || "暂无详细描述",
      sourceUrl: url,
      sourceName: matchingSource?.name || new URL(url).hostname,
      images: images.slice(0, 8), // Limit to 8 images per case
    };
  } catch (error: any) {
    console.error(`[Scraper] Failed to scrape ${url}:`, error.message);
    return null;
  }
}

/**
 * Download an image and return it as a base64 string for PPT embedding.
 */
export async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        ...SCRAPER_HEADERS,
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const buffer = Buffer.from(response.data);
    const contentType = response.headers["content-type"] || "image/jpeg";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error: any) {
    console.error(`[Scraper] Failed to download image ${url}:`, error.message);
    return null;
  }
}

// ─── Pexels API ─────────────────────────────────────────

const PEXELS_API_URL = "https://api.pexels.com/v1";

/**
 * Search Pexels for architecture/design concept images.
 * Uses the PEXELS_API_KEY from environment variables.
 */
export async function searchPexelsImages(
  query: string,
  count: number = 3,
  apiKey?: string
): Promise<PexelsImage[]> {
  const key = apiKey || process.env.PEXELS_API_KEY;
  if (!key) {
    console.warn("[Pexels] No API key configured, skipping Pexels search");
    return [];
  }

  try {
    const response = await axios.get(`${PEXELS_API_URL}/search`, {
      headers: {
        Authorization: key,
      },
      params: {
        query: `${query} architecture building`,
        per_page: count,
        orientation: "landscape",
      },
      timeout: 10000,
    });

    const photos = response.data?.photos || [];
    return photos.map((photo: any) => ({
      url: photo.src?.large2x || photo.src?.large || photo.src?.original,
      photographerName: photo.photographer || "Unknown",
      photographerUrl: photo.photographer_url || "",
      alt: photo.alt || query,
    }));
  } catch (error: any) {
    console.error("[Pexels] Search failed:", error.message);
    return [];
  }
}

/**
 * Search for images using the built-in search capability (fallback when no Pexels key).
 * This uses a simple image search approach.
 */
export async function searchArchitectureImages(
  query: string,
  count: number = 3
): Promise<PexelsImage[]> {
  // First try Pexels
  const pexelsResults = await searchPexelsImages(query, count);
  if (pexelsResults.length > 0) return pexelsResults;

  // Fallback: return empty - PPT will use text-only layout for design concept pages
  console.warn(`[ImageSearch] No images found for "${query}", using text-only layout`);
  return [];
}
