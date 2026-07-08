#!/usr/bin/env python3
"""
generate_markdown_mirrors.py

Generate clean markdown mirrors of every public page, one per route, so AI tools
(ChatGPT, Claude, Perplexity) can read the content without wrestling with the
SPA's HTML, scripts, and chrome.

HyperBeing's frontend is a React single-page app: there are no per-page
index.html files on disk to walk. Every page only exists once React has rendered
it in the browser. So this script:

  1. Reads the public route list from frontend/public/sitemap.xml (skipping any
     noindex paths), so it stays in sync as pages are added.
  2. Builds the app and serves the production build with `vite preview`.
  3. Renders each route in headless Chromium to get the real, post-React HTML.
  4. Strips chrome (nav, footer, scripts, styles, noscript, chat/GHL/HubSpot
     widgets, iframes, and elements whose class matches nav/footer/cta-split/ghl).
  5. Drops empty div/span wrappers.
  6. Converts to markdown with markdownify and cleans the output.
  7. Writes {public}/{route}/index.md with YAML frontmatter.
  8. Prints a summary.

Re-run it any time the site changes:

    python3 scripts/generate_markdown_mirrors.py

Flags:
    --no-build      Reuse an existing frontend/dist instead of rebuilding.
    --port PORT     Port for the local preview server (default 4173).
"""

import argparse
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup
from markdownify import markdownify as to_markdown
from playwright.sync_api import sync_playwright

# ── Paths ──────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND = REPO_ROOT / "frontend"
PUBLIC = FRONTEND / "public"
SITEMAP = PUBLIC / "sitemap.xml"

# Chromium is pre-installed in this environment; point Playwright straight at it
# so we don't depend on a version-matched download.
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# ── Config ─────────────────────────────────────────────────────────────────
# Paths that should never be mirrored even if they appear in the sitemap
# (404s and noindex "thanks"/confirmation pages).
NOINDEX_PATTERNS = [
    re.compile(r"/thanks/?$"),
    re.compile(r"/404/?$"),
]

# Site-wide <title> fallback. Because this is an SPA with a single static
# <title>, every rendered page reports the same document title. When that
# happens we prefer the page's <h1> so each mirror gets a meaningful title.
SITE_TITLE = "HyperBeing"

# Tags removed outright.
STRIP_TAGS = ["nav", "footer", "script", "style", "noscript", "iframe"]

# An element is dropped if any of its classes matches one of these. Covers the
# requested nav/footer/cta-split/ghl* plus common third-party chat/CRM widgets.
STRIP_CLASS = re.compile(
    r"(^|[\s_-])(nav|footer|cta-split)([\s_-]|$)|^ghl|ghl-|hubspot|hs-|"
    r"chat-widget|intercom|drift|crisp",
    re.IGNORECASE,
)


def read_routes():
    """Return [(route_path, canonical_url)] from the sitemap, minus noindex paths."""
    if not SITEMAP.exists():
        sys.exit(f"error: sitemap not found at {SITEMAP}")
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    tree = ET.parse(SITEMAP)
    routes = []
    for loc in tree.findall(".//sm:url/sm:loc", ns):
        url = (loc.text or "").strip()
        if not url:
            continue
        path = urlparse(url).path or "/"
        if any(p.search(path) for p in NOINDEX_PATTERNS):
            continue
        routes.append((path, url))
    return routes


def output_path_for(route_path):
    """/pricing -> public/pricing/index.md ; / -> public/index.md"""
    clean = route_path.strip("/")
    directory = PUBLIC if clean == "" else PUBLIC / clean
    return directory / "index.md"


# ── Preview server ─────────────────────────────────────────────────────────
def wait_for_server(base_url, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(base_url, timeout=2)
            return True
        except urllib.error.HTTPError:
            return True  # server answered (even a 4xx means it's up)
        except Exception:
            time.sleep(0.5)
    return False


def start_preview(port):
    proc = subprocess.Popen(
        ["npm", "run", "preview", "--", "--port", str(port), "--strictPort"],
        cwd=FRONTEND,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not wait_for_server(f"http://localhost:{port}/"):
        proc.terminate()
        sys.exit("error: preview server did not come up in time")
    return proc


# ── Cleaning pipeline ──────────────────────────────────────────────────────
def extract_meta(soup):
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    desc_tag = soup.find("meta", attrs={"name": "description"})
    description = desc_tag.get("content", "").strip() if desc_tag else ""
    h1 = soup.find("h1")
    h1_text = collapse_spaced_chars(h1.get_text(" ", strip=True)) if h1 else ""
    # SPA static title is identical across routes; prefer the page h1.
    if (not title or title == SITE_TITLE) and h1_text:
        title = f"{h1_text} — {SITE_TITLE}"
    return title or SITE_TITLE, description, h1_text


def strip_chrome(soup):
    for tag in soup(STRIP_TAGS):
        tag.decompose()
    for el in soup.find_all(class_=True):
        classes = el.get("class", [])
        if any(STRIP_CLASS.search(c) for c in classes):
            el.decompose()


def drop_empty_wrappers(soup):
    """Remove div/span wrappers with no text and no media, repeatedly until stable."""
    changed = True
    while changed:
        changed = False
        for el in soup.find_all(["div", "span"]):
            if el.get_text(strip=True):
                continue
            if el.find(["img", "svg", "video", "audio", "iframe", "picture"]):
                continue
            el.decompose()
            changed = True


def collapse_spaced_chars(text):
    """Rejoin runs of single characters separated by spaces, e.g. "h o w ?" -> "how?".

    Character-split animation components (like TextRotate) render each letter in
    its own element, so get_text/markdownify insert a space between every letter.
    This collapses any run of 3+ single-character tokens back into one word.
    """
    return re.sub(
        r"(?:(?<=\s)|^)((?:\S ){2,}\S)(?=\s|$)",
        lambda m: m.group(1).replace(" ", ""),
        text,
    )


def clean_markdown(text):
    # Rejoin animation-split single characters ("h o w ?" -> "how?").
    text = collapse_spaced_chars(text)
    # Strip standalone "01" / "02" step numbers on their own line.
    text = re.sub(r"(?m)^\s*\d{2}\s*$\n?", "", text)
    # Remove interpunct / bullet separator characters used inline.
    text = text.replace("·", " ").replace("•", " ")
    # Remove images with empty alt text (decorative, no value in a text mirror).
    text = re.sub(r"!\[\]\([^)]*\)", "", text)
    # Remove links with empty anchor text (e.g. media wrapped in a bare link).
    text = re.sub(r"\[\]\([^)]*\)", "", text)
    # Trim trailing whitespace per line.
    text = re.sub(r"[ \t]+$", "", text, flags=re.M)
    # Collapse 3+ blank lines down to a single blank line.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def html_to_markdown(html):
    soup = BeautifulSoup(html, "html.parser")
    title, description, _ = extract_meta(soup)
    body = soup.body or soup
    strip_chrome(body)
    drop_empty_wrappers(body)
    md = to_markdown(str(body), heading_style="ATX", bullets="-")
    return title, description, clean_markdown(md)


def frontmatter(title, description, url):
    def esc(v):
        return str(v).replace('"', '\\"')
    return (
        "---\n"
        f'title: "{esc(title)}"\n'
        f'description: "{esc(description)}"\n'
        f'url: "{esc(url)}"\n'
        f"last_updated: {date.today().isoformat()}\n"
        "---\n\n"
    )


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-build", action="store_true", help="Reuse existing frontend/dist.")
    ap.add_argument("--port", type=int, default=4173)
    args = ap.parse_args()

    routes = read_routes()
    if not routes:
        sys.exit("error: no routes found in sitemap")

    if not args.no_build:
        print("Building frontend (npm run build)…")
        r = subprocess.run(["npm", "run", "build"], cwd=FRONTEND)
        if r.returncode != 0:
            sys.exit("error: build failed")
    elif not (FRONTEND / "dist").exists():
        sys.exit("error: --no-build set but frontend/dist does not exist")

    base = f"http://localhost:{args.port}"
    print(f"Starting preview server on {base} …")
    preview = start_preview(args.port)

    generated, failed = [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
            page = browser.new_page()
            # Block external requests (fonts/analytics) so rendering can't hang
            # on hosts the sandbox proxy blocks.
            page.route(
                "**/*",
                lambda route: route.continue_()
                if "localhost" in route.request.url
                else route.abort(),
            )
            for route_path, url in routes:
                try:
                    page.goto(base + route_path, wait_until="load", timeout=30000)
                    page.wait_for_selector("#root h1, #root h2", timeout=15000)
                    page.wait_for_timeout(400)  # let late content settle
                    html = page.content()
                    title, description, md = html_to_markdown(html)
                    out = output_path_for(route_path)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_text(frontmatter(title, description, url) + md, encoding="utf-8")
                    generated.append((route_path, out.relative_to(REPO_ROOT), len(md.split())))
                    print(f"  ✓ {route_path:32s} -> {out.relative_to(REPO_ROOT)}")
                except Exception as e:
                    failed.append((route_path, str(e).splitlines()[0]))
                    print(f"  ✗ {route_path:32s} {str(e).splitlines()[0]}")
            browser.close()
    finally:
        preview.terminate()

    print("\n── Summary ──────────────────────────────────────────────")
    print(f"Pages generated: {len(generated)}")
    for route_path, out, words in generated:
        print(f"  {route_path:32s} {words:>5d} words  {out}")
    if failed:
        print(f"Failed: {len(failed)}")
        for route_path, err in failed:
            print(f"  {route_path:32s} {err}")


if __name__ == "__main__":
    main()
