/**
 * ReportMarkdown
 *
 * A wrapper around <Streamdown> that customizes link and image rendering:
 * - Links whose href contains "?q=" are search-page fallbacks.
 *   They get a small "搜索页" badge so the reader knows it's a fallback.
 * - All other links open in a new tab as normal.
 * - Images wrapped in links ([![alt](img)](url) format) are rendered as
 *   clickable images that open the source page in a new tab.
 */

import { Streamdown } from "streamdown";
import { ExternalLink, Search } from "lucide-react";
import { useState, isValidElement, Children } from "react";

interface ReportMarkdownProps {
  children: string;
  className?: string;
}

/** Detect whether a URL is a search-page fallback */
function isSearchPage(href: string): boolean {
  try {
    const url = new URL(href);
    return url.searchParams.has("q");
  } catch {
    return href.includes("?q=") || href.includes("&q=");
  }
}

/** Detect whether children contain only an image (for [![img](url)](link) pattern) */
function hasOnlyImageChild(children: React.ReactNode): boolean {
  const arr = Children.toArray(children);
  if (arr.length !== 1) return false;
  const child = arr[0];
  // Check if it's a React element with type === 'img' or our CustomImage span wrapper
  if (!isValidElement(child)) return false;
  // Streamdown passes the img element through our CustomImage component,
  // which returns a <span> wrapping an <img>. We detect by checking if
  // the child element has a 'src' prop (raw img) or is a span with img inside.
  const props = child.props as Record<string, unknown>;
  return (
    (child.type === "img" && typeof props.src === "string") ||
    // CustomImage renders as <span class="block my-3 group/img">
    (child.type === "span" && typeof props.className === "string" && (props.className as string).includes("group/img"))
  );
}

/** Custom link renderer injected into Streamdown via `components` */
function CustomLink({
  href,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const url = href ?? "";
  const isSearch = isSearchPage(url);

  // If the link wraps an image ([![alt](img)](url) pattern), render as image link
  if (hasOnlyImageChild(children)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer"
        title="点击查看来源"
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 group"
      {...rest}
    >
      <span className="underline underline-offset-2 decoration-primary/60 group-hover:decoration-primary transition-colors">
        {children}
      </span>
      {isSearch ? (
        <span
          className="inline-flex items-center gap-0.5 px-1 py-0 text-[10px] font-medium leading-4 rounded
                     bg-amber-100 text-amber-700 border border-amber-300/60
                     dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40
                     align-middle shrink-0 ml-0.5"
          title="此链接指向搜索结果页，是系统自动生成的备用链接"
        >
          <Search className="h-2.5 w-2.5" />
          搜索页
        </span>
      ) : (
        <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary/60 transition-colors shrink-0 self-center" />
      )}
    </a>
  );
}

/** Custom image renderer for case study photos */
function CustomImage({
  src,
  alt,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [error, setError] = useState(false);
  if (!src || error) return null;
  return (
    <span className="block my-3 group/img">
      <img
        src={src}
        alt={alt || ""}
        onError={() => setError(true)}
        className="rounded-lg max-w-full max-h-64 object-cover border border-border/40 shadow-sm transition-all group-hover/img:shadow-md group-hover/img:brightness-95 cursor-pointer"
        loading="lazy"
        title={alt ? `${alt} — 点击查看来源` : "点击查看来源"}
        {...rest}
      />
      {alt && (
        <span className="block mt-1 text-xs text-muted-foreground/60 italic">{alt}</span>
      )}
    </span>
  );
}

const COMPONENTS = {
  a: CustomLink,
  img: CustomImage,
};

export function ReportMarkdown({ children, className }: ReportMarkdownProps) {
  return (
    <Streamdown components={COMPONENTS} className={className}>
      {children}
    </Streamdown>
  );
}
