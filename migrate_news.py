import xml.etree.ElementTree as ET
import re, html, os
from datetime import datetime

ns = {
    'atom': 'http://www.w3.org/2005/Atom',
    'blogger': 'http://schemas.google.com/blogger/2018'
}

SRC = "takeout/Takeout/Blogger/Blogs/EarthInsider News #U2013 Latest News &amp_ Trending Updates/feed.atom"
OUT_DIR = "earthinsider-news/src/_posts"
os.makedirs(OUT_DIR, exist_ok=True)

# priority-ordered category mapping: (category_slug, category_label, [matching label substrings])
CATEGORY_RULES = [
    ("india", "India", ["India", "IN-National", "IN-Economy"]),
    ("united-states", "United States", ["United-States", "US-National", "US-Politics", "US-Federal-Updates", "US-Economy", "US-Law-And-Justice", "US-Defense", "US-Society", "US-Elections"]),
    ("united-kingdom", "United Kingdom", ["United-Kingdom", "UK-National", "UK-Politics", "UK-Defense"]),
    ("defense", "Defense", ["Defense", "Strategic-Weapons", "Naval-Affairs"]),
    ("technology", "Technology", ["Technology", "Big-Tech", "AI-And-Future", "Cybersecurity", "Emerging-Tech", "Consumer-Tech", "Space-Tech"]),
    ("business-markets", "Business & Markets", ["Business", "Markets-And-Finance", "Corporate-News", "Global-Economy", "Trade-And-Commerce", "Banking"]),
    ("science-health", "Science & Health", ["Science-And-Health", "Public-Health", "Health-Policy", "Space-And-Astronomy", "Scientific-Breakthroughs", "Climate-Change", "Environment"]),
    ("energy-commodities", "Energy & Commodities", ["Energy-And-Commodities"]),
    ("world", "World", ["World"]),
    ("trending", "Trending", ["Trending", "Top-Stories", "Breaking-News", "HighSearch", "What-To-Know"]),
]

def pick_category(labels):
    for slug, label, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw in labels:
                return slug, label
    return "trending", "Trending"

def slugify(text):
    text = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    return text[:80]

def extract_image(content_html):
    m = re.search(r'<img[^>]+src="([^"]+)"', content_html)
    src = m.group(1) if m else ""
    m2 = re.search(r'<img[^>]+alt="([^"]*)"', content_html)
    alt = m2.group(1) if m2 else ""
    return src, alt

def derive_excerpt(content_html, fallback_len=160):
    text = re.sub(r'<[^>]+>', ' ', content_html)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:fallback_len].rsplit(' ', 1)[0] + "..." if len(text) > fallback_len else text

def yaml_escape(s):
    if s is None:
        return '""'
    s = s.replace('\\', '\\\\').replace('"', '\\"')
    return f'"{s}"'

print("Parsing feed...")
tree = ET.parse(SRC)
root = tree.getroot()
entries = root.findall('atom:entry', ns)
print("total entries found:", len(entries))

written = 0
skipped = 0
category_counts = {}

for e in entries:
    btype = e.find('blogger:type', ns)
    status = e.find('blogger:status', ns)
    if btype is None or btype.text != 'POST' or status is None or status.text != 'LIVE':
        skipped += 1
        continue

    title_el = e.find('atom:title', ns)
    filename_el = e.find('blogger:filename', ns)
    published_el = e.find('atom:published', ns)
    metadesc_el = e.find('blogger:metaDescription', ns)
    content_el = e.find('atom:content', ns)

    if title_el is None or filename_el is None or published_el is None or content_el is None:
        skipped += 1
        continue

    title = title_el.text or "Untitled"
    filename = filename_el.text  # e.g. /2026/07/slug.html
    published = published_el.text  # ISO datetime
    date_only = published[:10]  # YYYY-MM-DD
    content_html = content_el.text or ""  # already unescaped by ElementTree
    metadesc = metadesc_el.text if metadesc_el is not None and metadesc_el.text else derive_excerpt(content_html)

    labels = [c.get('term') for c in e.findall('atom:category', ns) if c.get('term')]
    cat_slug, cat_label = pick_category(labels)
    category_counts[cat_slug] = category_counts.get(cat_slug, 0) + 1

    image_src, image_alt = extract_image(content_html)
    if not image_alt:
        image_alt = title

    id_el = e.find('atom:id', ns)
    post_id = (id_el.text.rsplit('-', 1)[-1] if id_el is not None and id_el.text else str(hash(filename)))
    slug = slugify(title)
    out_filename = f"{date_only}-{slug}-{post_id}.md"
    out_path = os.path.join(OUT_DIR, out_filename)

    fm = []
    fm.append("---")
    fm.append("layout: post.njk")
    fm.append(f"title: {yaml_escape(title)}")
    fm.append(f"excerpt: {yaml_escape(metadesc)}")
    fm.append(f"date: {date_only}")
    fm.append(f"categorySlug: {cat_slug}")
    fm.append(f"categoryLabel: {yaml_escape(cat_label)}")
    fm.append(f"image: {yaml_escape(image_src)}")
    fm.append(f"imageAlt: {yaml_escape(image_alt)}")
    fm.append(f"permalink: {yaml_escape(filename)}")
    fm.append("---")

    body = "\n".join(fm) + "\n" + content_html + "\n"

    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(body)
        written += 1
    except Exception as ex:
        print("ERROR writing", out_path, ex)
        skipped += 1

print("written:", written, "skipped:", skipped)
print("category distribution:", category_counts)
