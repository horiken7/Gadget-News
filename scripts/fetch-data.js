const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data.json');
const PUBLISHED_DATA_URL = 'https://horiken7.github.io/AI-news/data.json';
const USER_AGENT = 'AI-news updater/2.0 (+https://github.com/horiken7/AI-news)';
const QUERY_TERMS = ['AI', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'GPT', 'machine learning', 'Gemini', 'DeepSeek', 'Grok', 'Sora', 'Copilot'];
const AI_KEYWORDS = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|deepseek|gemini|grok|sora|copilot|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer|agentic|inference)\b/i;
const GDELT_QUERY = [
  '"artificial intelligence"', '"generative AI"', '"large language model"',
  '"AI agent"', '"AI safety"', '"AI regulation"', '"AI summit"', 'deepfake',
  'ChatGPT', 'Claude', 'Gemini', 'OpenAI', 'Anthropic', 'DeepMind',
].join(' OR ');
const RSS_FEEDS = [
  {
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    label: 'TechCrunch AI',
    lens: '一般',
  },
  {
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    label: 'The Verge AI',
    lens: '一般',
  },
  {
    url: 'https://venturebeat.com/category/ai/feed/',
    label: 'VentureBeat AI',
    lens: '技術',
  },
  {
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    label: 'Ars Technica',
    lens: '技術',
  },
];
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;
const BRAND_TERMS = [
  { source: /\bAnthropic\b/i, name: 'Anthropic', replacements: [/人類/g, /アンソロピック/g, /アンスロピック/g] },
  { source: /\bClaude\b/i, name: 'Claude', replacements: [/クロード/g] },
  { source: /\bOpenAI\b/i, name: 'OpenAI', replacements: [/オープンAI/g, /オープンエーアイ/g] },
  { source: /\bChatGPT\b/i, name: 'ChatGPT', replacements: [/チャットGPT/g, /チャットジーピーティー/g] },
  { source: /\bGemini\b/i, name: 'Gemini', replacements: [/ジェミニ/g] },
  { source: /\bGrok\b/i, name: 'Grok', replacements: [/グロック/g, /グロク/g] },
  { source: /\bDeepSeek\b/i, name: 'DeepSeek', replacements: [/ディープシーク/g] },
  { source: /\bSora\b/i, name: 'Sora', replacements: [/ソラ/g] },
  { source: /\bCopilot\b/i, name: 'Copilot', replacements: [/コパイロット/g] },
];
const TREND_LOCATIONS = [
  { url: 'https://trends24.in/japan/', label: '日本', priority: 0 },
  { url: 'https://trends24.in/united-states/', label: '米国', priority: 1 },
  { url: 'https://trends24.in/united-kingdom/', label: '英国', priority: 2 },
  { url: 'https://trends24.in/canada/', label: 'カナダ', priority: 3 },
  { url: 'https://trends24.in/australia/', label: '豪州', priority: 4 },
];
const AI_TREND_TERMS = [
  'ai', 'llm', 'openai', 'chatgpt', 'gpt', 'claude', 'anthropic', 'gemini',
  'deepseek', 'deepmind', 'copilot', 'midjourney', 'stable diffusion', 'sora', 'grok',
  'perplexity', 'hugging face', 'machine learning', 'artificial intelligence',
  'generative ai', '生成ai', '生成AI', '人工知能', 'チャットgpt', 'チャットGPT',
  'クロード', 'ジェミニ', 'ディープシーク', 'ディープマインド', 'コパイロット',
];
const TECH_SIGNALS = /\b(model|llm|benchmark|eval|inference|training|dataset|open source|open-source|agent|agents|coding|developer|api|security|vulnerability|jailbreak|red[- ]team|robotics|multimodal|vision|chip|gpu|datacenter|research|paper|arxiv|github|hugging face)\b/i;
const PUBLIC_SIGNALS = /\b(summit|government|policy|regulation|copyright|lawsuit|election|school|education|health|jobs|workers|deepfake|safety|security|privacy|ceo|minister|president|g7|white house|eu|china|japan)\b/i;
const TECH_DOMAINS = new Set([
  'arstechnica.com', 'theverge.com', 'wired.com', 'techcrunch.com', 'venturebeat.com',
  'theregister.com', 'spectrum.ieee.org', 'technologyreview.com', 'huggingface.co',
  'github.blog', 'developer.nvidia.com', 'semianalysis.com', 'stratechery.com',
  'simonwillison.net', 'news.ycombinator.com', 'arxiv.org',
]);
const PUBLIC_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com',
  'theguardian.com', 'axios.com', 'businessinsider.com', 'wsj.com', 'ft.com',
  'bloomberg.com', 'npr.org', 'cnn.com', 'theatlantic.com', 'forbes.com',
  'fortune.com', 'cnbc.com',
]);
const LOW_QUALITY_DOMAIN_PARTS = [
  'coupon', 'casino', 'betting', 'pressrelease', 'prnewswire', 'globenewswire',
];
const BUSINESS_ONLY_SIGNALS = /\b(funding|valuation|ipo|stock|shares|revenue|losses|earnings|startup|founder|acquisition|acquire|partnership|roi|financial docs)\b/i;
const HARD_BUSINESS_SIGNALS = /\b(ipo|stock|shares|revenue|losses|earnings|valuation|funding|financial docs|roi reckoning)\b/i;

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, timeoutMs = 10000) {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchNewsForWindow(hours) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const requests = QUERY_TERMS.map(term => {
    const params = new URLSearchParams({
      query: term,
      tags: 'story',
      hitsPerPage: '50',
      numericFilters: `created_at_i>${since}`,
    });
    return fetchJson(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
  });

  const responses = await Promise.all(requests);
  const uniqueHits = new Map();

  for (const response of responses) {
    for (const hit of response.hits || []) {
      if (!hit.objectID || !hit.title || hit.created_at_i < since) continue;
      if (!AI_KEYWORDS.test(`${hit.title} ${hit.story_text || ''}`)) continue;
      uniqueHits.set(hit.objectID, hit);
    }
  }

  return [...uniqueHits.values()]
    .sort((left, right) => {
      const pointDifference = (right.points || 0) - (left.points || 0);
      return pointDifference || (right.created_at_i || 0) - (left.created_at_i || 0);
    })
    .slice(0, 5)
    .map(hit => ({
      title: hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points || 0,
      comments: hit.num_comments || 0,
      author: hit.author || '',
      createdAt: hit.created_at,
      domain: extractDomain(hit.url),
      storyText: stripHtml(hit.story_text || '').slice(0, 400),
    }));
}

async function fetchNews() {
  for (const window of [
    { hours: 24, gdeltTimespan: '1d' },
    { hours: 72, gdeltTimespan: '3d' },
    { hours: 168, gdeltTimespan: '7d' },
  ]) {
    const [gdeltItems, hnItems] = await Promise.allSettled([
      fetchGdeltNews(window.gdeltTimespan),
      fetchNewsForWindow(window.hours),
    ]);
    const rssItems = await fetchRssNews(window.hours);
    const merged = mergeNewsCandidates([
      ...rssItems,
      ...(gdeltItems.status === 'fulfilled' ? gdeltItems.value : []),
      ...(hnItems.status === 'fulfilled' ? hnItems.value.map(item => ({ ...item, sourceType: 'hn' })) : []),
    ]);

    if (gdeltItems.status === 'rejected') {
      console.warn(`GDELT news fetch failed: ${gdeltItems.reason.message}`);
    }
    if (hnItems.status === 'rejected') {
      console.warn(`Hacker News fetch failed: ${hnItems.reason.message}`);
    }

    console.log(`Found ${merged.length} balanced AI stories in the last ${window.hours} hours`);
    if (merged.length >= 5) return merged.slice(0, 5);
  }
  throw new Error('Could not find five recent AI stories');
}

async function fetchRssNews(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const settled = await Promise.allSettled(RSS_FEEDS.map(async feed => {
    const response = await fetchWithTimeout(feed.url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    }, 15000);
    if (!response.ok) throw new Error(`${feed.url} returned ${response.status}`);
    return parseRssFeed(await response.text(), feed, cutoff);
  }));

  return settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`RSS feed failed: ${RSS_FEEDS[index].label}: ${result.reason.message}`);
    return [];
  });
}

function parseRssFeed(xml, feed, cutoff) {
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map(match => parseRssItem(match[0], feed))
    .filter(item => item.url && item.title && Date.parse(item.createdAt) >= cutoff)
    .filter(item => AI_KEYWORDS.test(`${item.title} ${item.storyText}`))
    .filter(item => !isLowQualityDomain(item.domain));
}

function parseRssItem(itemXml, feed) {
  const title = stripHtml(extractXmlValue(itemXml, 'title'));
  const url = cleanFeedUrl(extractXmlValue(itemXml, 'link') || extractXmlValue(itemXml, 'guid'));
  const createdAt = parseFeedDate(extractXmlValue(itemXml, 'pubDate') || extractXmlValue(itemXml, 'updated'));
  const description = stripHtml(extractXmlValue(itemXml, 'description') || extractXmlValue(itemXml, 'content:encoded'));
  const domain = extractDomain(url);

  return {
    title,
    url,
    points: scoreNewsCandidate({ title, storyText: description, domain, sourceType: 'rss', createdAt, newsLens: feed.lens }),
    comments: 0,
    author: '',
    createdAt,
    domain,
    storyText: description.slice(0, 450),
    sourceType: 'rss',
    sourceLabel: feed.label,
    newsLens: feed.lens,
  };
}

function extractXmlValue(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(xml).match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeHtml(match?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function cleanFeedUrl(url) {
  return decodeHtml(String(url || '').trim());
}

function parseFeedDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

async function fetchGdeltNews(timespan) {
  const params = new URLSearchParams({
    query: `(${GDELT_QUERY})`,
    mode: 'artlist',
    format: 'json',
    maxrecords: '60',
    timespan,
    sort: 'datedesc',
  });
  const data = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, 20000);
  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles
    .filter(article => article?.url && article.title)
    .map(article => {
      const domain = extractDomain(article.url);
      const title = stripHtml(article.title);
      const createdAt = parseGdeltDate(article.seendate || article.datetime);

      return {
        title,
        url: article.url,
        points: scoreNewsCandidate({ title, storyText: '', domain, sourceType: 'gdelt', createdAt }),
        comments: 0,
        author: '',
        createdAt,
        domain,
        storyText: '',
        sourceType: 'gdelt',
        sourceLabel: 'GDELT',
      };
    })
    .filter(item => AI_KEYWORDS.test(`${item.title} ${item.storyText}`))
    .filter(item => !isLowQualityDomain(item.domain));
}

function parseGdeltDate(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function isLowQualityDomain(domain) {
  return LOW_QUALITY_DOMAIN_PARTS.some(part => domain.includes(part));
}

function mergeNewsCandidates(candidates) {
  const unique = new Map();

  for (const candidate of candidates) {
    const key = normalizeNewsKey(candidate.url, candidate.title);
    const existing = unique.get(key);
    const scored = {
      ...candidate,
      points: scoreNewsCandidate(candidate),
      category: inferCategory(candidate.title),
      impact: inferImpact(candidate),
      newsLens: inferNewsLens(candidate),
    };

    if (!existing || scored.points > existing.points) unique.set(key, scored);
  }

  const values = [...unique.values()];
  const tech = values
    .filter(item => item.newsLens === '技術')
    .sort((left, right) => right.points - left.points);
  const publicInterest = values
    .filter(item => item.newsLens === '一般')
    .sort((left, right) => right.points - left.points);
  const rest = values
    .filter(item => item.newsLens !== '技術' && item.newsLens !== '一般')
    .sort((left, right) => right.points - left.points);
  const balanced = [];

  for (const item of [tech[0], publicInterest[0], tech[1], publicInterest[1], ...rest, ...tech.slice(2), ...publicInterest.slice(2)]) {
    if (!item || balanced.some(existing => existing.url === item.url)) continue;
    balanced.push(item);
    if (balanced.length >= 5) break;
  }

  return balanced.sort((left, right) => right.points - left.points);
}

function normalizeNewsKey(url, title) {
  const domain = extractDomain(url);
  const normalizedTitle = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${domain}:${normalizedTitle}`;
}

function scoreNewsCandidate(item) {
  const text = `${item.title || ''} ${item.storyText || ''}`;
  const domain = item.domain || extractDomain(item.url);
  const ageHours = Math.max(0, (Date.now() - Date.parse(item.createdAt || new Date())) / 3600000);
  let score = 25;

  if (TECH_SIGNALS.test(text)) score += 28;
  if (PUBLIC_SIGNALS.test(text)) score += 26;
  if (TECH_DOMAINS.has(domain)) score += 20;
  if (PUBLIC_DOMAINS.has(domain)) score += 20;
  if (item.sourceType === 'hn') score += Math.min(32, Number(item.points || 0) / 4);
  if (item.sourceType === 'gdelt') score += 12;
  if (item.sourceType === 'rss') score += 18;
  if (ageHours <= 24) score += 16;
  else if (ageHours <= 72) score += 8;
  if (/\b(video|podcast|live updates)\b/i.test(text)) score -= 8;
  if (HARD_BUSINESS_SIGNALS.test(text)) score -= 42;
  if (BUSINESS_ONLY_SIGNALS.test(text) && !TECH_SIGNALS.test(text) && !PUBLIC_SIGNALS.test(text)) score -= 22;
  if (BUSINESS_ONLY_SIGNALS.test(text)) score -= 18;
  if (isLowQualityDomain(domain)) score -= 35;

  return Math.round(score);
}

function inferNewsLens(item) {
  if (item.newsLens) return item.newsLens;
  const text = `${item.title || ''} ${item.storyText || ''}`;
  const hasTech = TECH_SIGNALS.test(text);
  const hasPublic = PUBLIC_SIGNALS.test(text);

  if (hasTech && !hasPublic) return '技術';
  if (hasPublic && !hasTech) return '一般';
  if (hasTech && hasPublic) return item.sourceType === 'hn' ? '技術' : '一般';
  return item.sourceType === 'hn' ? '技術' : '一般';
}

function inferImpact(item) {
  if (item.points >= 85) return '高';
  if (item.points >= 60) return '中';
  return '低';
}

function extractDomain(url) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : 'news.ycombinator.com';
  } catch {
    return 'news.ycombinator.com';
  }
}

function decodeHtml(text) {
  return String(text)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(text) {
  return decodeHtml(String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function normalizeBrandTerms(text, sourceText = '') {
  let normalized = String(text);

  for (const term of BRAND_TERMS) {
    if (!term.source.test(sourceText) && !term.source.test(normalized)) continue;
    for (const replacement of term.replacements) {
      normalized = normalized.replace(replacement, term.name);
    }
  }

  return normalized;
}

function extractMetaDescription(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:description|description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i);
    if (content?.[1]) return stripHtml(content[1]).slice(0, 400);
  }
  return '';
}

async function fetchArticleDescription(url) {
  if (!/^https?:\/\//i.test(url) || url.includes('news.ycombinator.com/item')) return '';

  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  }, 8000);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return '';
  return extractMetaDescription(await response.text());
}

async function translate(text) {
  const params = new URLSearchParams({
    q: String(text).slice(0, 450),
    langpair: 'en|ja',
  });
  const data = await fetchJson(`https://api.mymemory.translated.net/get?${params}`, 12000);
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
    throw new Error(data.responseDetails || 'Translation failed');
  }
  return decodeHtml(data.responseData.translatedText).trim();
}

function readLocalCache() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function readPublishedCache() {
  try {
    return await fetchJson(`${PUBLISHED_DATA_URL}?_=${Date.now()}`, 10000);
  } catch (error) {
    console.warn(`Published translation cache unavailable: ${error.message}`);
    return null;
  }
}

async function loadTranslationCache() {
  const cache = new Map();
  const sources = [readLocalCache(), await readPublishedCache()];

  for (const source of sources) {
    for (const item of source?.news?.items || []) {
      if (item.url && item.titleJa && item.summaryJa) cache.set(item.url, item);
    }
  }
  return cache;
}

function decodeTrendText(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

function isAiTrend(topic) {
  const normalized = topic.toLowerCase();
  if (/^ai-\d+$/i.test(normalized)) return false;

  return AI_TREND_TERMS.some(term => {
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(term)) return normalized.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalized);
  });
}

function parseTrendTopics(html, location) {
  const observedAt = new Date().toISOString();
  const matches = [...html.matchAll(
    /<a[^>]+href="https:\/\/twitter\.com\/search\?q=([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  )];
  const topics = new Map();

  matches.forEach((match, index) => {
    const topic = decodeTrendText(match[2]);
    if (!topic || !isAiTrend(topic)) return;

    const key = topic.toLocaleLowerCase('en-US');
    const rank = (index % 50) + 1;
    const existing = topics.get(key);
    if (existing) {
      existing.appearances += 1;
      existing.bestRank = Math.min(existing.bestRank, rank);
      return;
    }

    topics.set(key, {
      topic,
      locationLabel: location.label,
      locationPriority: location.priority,
      bestRank: rank,
      appearances: 1,
      trendSource: 'Trends24',
      sourceUrl: location.url,
      observedAt,
      url: `https://x.com/search?q=${encodeURIComponent(topic)}&src=typed_query&f=live`,
    });
  });

  return [...topics.values()];
}

async function fetchXTrendCandidates() {
  const settled = await Promise.allSettled(TREND_LOCATIONS.map(async location => {
    const response = await fetchWithTimeout(location.url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }, 12000);
    if (!response.ok) throw new Error(`${location.url} returned ${response.status}`);
    return parseTrendTopics(await response.text(), location);
  }));

  const merged = new Map();
  settled.forEach((result, locationIndex) => {
    if (result.status === 'rejected') {
      console.warn(`Trend location failed: ${TREND_LOCATIONS[locationIndex].label}: ${result.reason.message}`);
      return;
    }

    for (const item of result.value) {
      const key = item.topic.toLocaleLowerCase('en-US');
      const existing = merged.get(key);
      if (!existing || item.locationPriority < existing.locationPriority) {
        merged.set(key, item);
      } else {
        existing.appearances = Math.max(existing.appearances, item.appearances);
        existing.bestRank = Math.min(existing.bestRank, item.bestRank);
      }
    }
  });

  return [...merged.values()]
    .sort((left, right) =>
      left.locationPriority - right.locationPriority ||
      right.appearances - left.appearances ||
      left.bestRank - right.bestRank
    )
    .slice(0, 5)
    .map(({ locationPriority, ...item }) => item);
}

async function buildXTrends(previousData) {
  const currentItems = await fetchXTrendCandidates();
  if (currentItems.length < 5) {
    console.warn(`Only ${currentItems.length} current AI trends found; publishing the current partial set`);
  }

  return {
    items: currentItems,
    fetchedAt: new Date().toISOString(),
    source: 'Trends24',
    trendSource: 'Trends24',
    partial: currentItems.length < 5,
  };
}

function inferCategory(title) {
  const normalized = title.toLowerCase();
  if (/model|gpt|claude|gemini|llama|llm/.test(normalized)) return 'AIモデル';
  if (/code|developer|program/.test(normalized)) return '開発ツール';
  if (/robot|device|hardware|chip/.test(normalized)) return 'ハードウェア';
  if (/research|study|paper/.test(normalized)) return '研究';
  return 'AIニュース';
}

function buildKeyPoints(summaryJa) {
  const points = summaryJa
    .split(/[。！？]/)
    .map(part => part.trim())
    .filter(part => part.length >= 10)
    .slice(0, 3)
    .map(part => `${part}。`);
  return points.length > 0 ? points : [summaryJa];
}

async function localizeItem(item, cache) {
  const cached = cache.get(item.url);
  if (cached && JAPANESE_TEXT.test(cached.titleJa) && JAPANESE_TEXT.test(cached.summaryJa)) {
    console.log(`Reusing translation: ${item.title}`);
    const titleJa = normalizeBrandTerms(cached.titleJa, item.title);
    const summaryJa = normalizeBrandTerms(cached.summaryJa, `${item.title} ${item.storyText || ''}`);
    const keyPoints = cached.keyPoints?.length
      ? cached.keyPoints.map(point => normalizeBrandTerms(point, `${item.title} ${item.storyText || ''}`))
      : buildKeyPoints(summaryJa);

    return {
      ...item,
      titleJa,
      summaryJa,
      keyPoints,
      category: item.category || cached.category || inferCategory(item.title),
      impact: item.impact || cached.impact || '低',
    };
  }

  let titleJa;
  try {
    const translatedTitle = await translate(item.title);
    const normalizedTitle = normalizeBrandTerms(translatedTitle, item.title);
    titleJa = JAPANESE_TEXT.test(normalizedTitle)
      ? normalizedTitle
      : `AIニュース: ${translatedTitle}`;
  } catch (error) {
    console.warn(`Title translation failed for "${item.title}": ${error.message}`);
    titleJa = `AIニュース: ${item.title}`;
  }

  let description = item.storyText;
  if (!description) {
    try {
      description = await fetchArticleDescription(item.url);
    } catch (error) {
      console.warn(`Description fetch failed for ${item.url}: ${error.message}`);
    }
  }

  let summaryJa;
  if (description) {
    try {
      const translatedSummary = await translate(description);
      const normalizedSummary = normalizeBrandTerms(translatedSummary, `${item.title} ${description}`);
      summaryJa = JAPANESE_TEXT.test(normalizedSummary)
        ? normalizedSummary
        : `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
    } catch (error) {
      console.warn(`Summary translation failed for "${item.title}": ${error.message}`);
      summaryJa = `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
    }
  } else {
    summaryJa = `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
  }

  return {
    ...item,
    titleJa,
    summaryJa,
    keyPoints: buildKeyPoints(summaryJa),
    category: inferCategory(item.title),
    impact: item.impact || inferImpact(item),
  };
}

function validateItems(items) {
  if (items.length !== 5) throw new Error(`Expected five items, received ${items.length}`);
  for (const item of items) {
    if (!item.url || !item.titleJa || !item.summaryJa) {
      throw new Error(`Incomplete item: ${item.title || 'unknown'}`);
    }
    if (!JAPANESE_TEXT.test(item.titleJa) || !JAPANESE_TEXT.test(item.summaryJa)) {
      throw new Error(`Japanese content missing: ${item.title}`);
    }
  }
}

async function main() {
  const rawItems = await fetchNews();
  const publishedData = await readPublishedCache();
  const cache = await loadTranslationCache();
  const localizedItems = [];

  for (const item of rawItems) {
    const { storyText, ...localized } = await localizeItem(item, cache);
    localizedItems.push(localized);
  }

  validateItems(localizedItems);
  const xTrends = await buildXTrends(publishedData);
  const data = {
    news: {
      items: localizedItems,
      fetchedAt: new Date().toISOString(),
      mock: false,
    },
    xTrends,
  };

  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, OUTPUT_PATH);
  console.log(`Wrote ${localizedItems.length} current stories to ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(`Data update failed; the currently published data will be kept: ${error.stack || error.message}`);
  process.exit(1);
});
