const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'public', 'data.json');
const PUBLISHED_DATA_URL = 'https://horiken7.github.io/AI-news/data.json';
const USER_AGENT = 'AI-news updater/2.0 (+https://github.com/horiken7/AI-news)';
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
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

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchPublishedData() {
  try {
    return await fetchJson(`${PUBLISHED_DATA_URL}?_=${Date.now()}`);
  } catch (error) {
    console.warn(`Published X trend cache unavailable: ${error.message}`);
    return null;
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

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '関連記事';
  }
}

function extractMetaDescription(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:description|description|twitter:description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i);
    if (content?.[1]) return stripHtml(content[1]).slice(0, 450);
  }
  return '';
}

async function fetchArticleDescription(url) {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  }, 10000);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return '';
  return extractMetaDescription(await response.text());
}

function buildSearchQueries(topic) {
  const simplified = topic
    .replace(/[-_]/g, ' ')
    .replace(/\b(trade|trending|trend)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set([topic, simplified].filter(Boolean))];
}

async function searchRelatedNews(topic) {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  for (const query of buildSearchQueries(topic)) {
    const params = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: '20',
      numericFilters: `created_at_i>${since}`,
    });
    const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`);

    for (const hit of data.hits || []) {
      if (!hit.title || !/^https?:\/\//i.test(hit.url || '')) continue;

      let description = stripHtml(hit.story_text || '');
      if (!description) {
        try {
          description = await fetchArticleDescription(hit.url);
        } catch (error) {
          console.warn(`Article description unavailable for ${hit.url}: ${error.message}`);
        }
      }
      if (!description) continue;

      return {
        title: hit.title,
        description,
        url: hit.url,
        publishedAt: hit.created_at,
        source: extractDomain(hit.url),
      };
    }
  }

  throw new Error(`No recent related article found for trend: ${topic}`);
}

async function translate(text) {
  if (JAPANESE_TEXT.test(text)) return text;

  const sourceText = String(text).slice(0, 450);
  const googleParams = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'ja',
    dt: 't',
    q: sourceText,
  });

  try {
    const data = await fetchJson(`https://translate.googleapis.com/translate_a/single?${googleParams}`);
    const translated = data?.[0]?.map(part => part?.[0] || '').join('').trim();
    if (JAPANESE_TEXT.test(translated || '')) return translated;
  } catch (error) {
    console.warn(`Google translation failed; using fallback: ${error.message}`);
  }

  const fallbackParams = new URLSearchParams({
    q: sourceText,
    langpair: 'en|ja',
  });
  const data = await fetchJson(`https://api.mymemory.translated.net/get?${fallbackParams}`);
  const translated = decodeHtml(data.responseData?.translatedText || '').trim();
  if (!JAPANESE_TEXT.test(translated)) throw new Error('Japanese translation is unavailable');
  return translated;
}

async function enrichTrend(item, previousItems) {
  const article = await searchRelatedNews(item.topic);
  const cached = previousItems.find(previous =>
    previous.topic === item.topic &&
    previous.articleUrl === article.url &&
    previous.translationVersion === 3 &&
    JAPANESE_TEXT.test(previous.articleTitleJa || '') &&
    JAPANESE_TEXT.test(previous.summaryJa || '')
  );

  return {
    ...item,
    articleTitle: article.title,
    articleTitleJa: cached?.articleTitleJa
      ? normalizeBrandTerms(cached.articleTitleJa, article.title)
      : normalizeBrandTerms(await translate(article.title), article.title),
    articleUrl: article.url,
    articleSource: article.source,
    articlePublishedAt: article.publishedAt,
    summaryJa: cached?.summaryJa
      ? normalizeBrandTerms(cached.summaryJa, `${article.title} ${article.description}`)
      : normalizeBrandTerms(await translate(article.description), `${article.title} ${article.description}`),
    translationVersion: 3,
  };
}

function buildTrendOnlyItem(item) {
  const observedAt = item.observedAt || new Date().toISOString();

  return {
    ...item,
    articleTitle: item.topic,
    articleTitleJa: `公開トレンド: ${item.topic}`,
    articleUrl: item.sourceUrl || item.url,
    articleSource: item.trendSource || 'Trends24',
    articlePublishedAt: observedAt,
    summaryJa: `${item.locationLabel || '対象地域'}のTrends24公開トレンドで確認されたAI関連トピックです。関連するHacker News記事は見つかりませんでした。`,
    translationVersion: 3,
    articleFallback: true,
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const items = data.xTrends?.items;
  if (!Array.isArray(items)) throw new Error('X trend data is missing');
  const publishedData = await fetchPublishedData();
  const previousItems = (publishedData?.xTrends?.items || []).filter(item =>
    item.topic &&
    item.articleUrl &&
    JAPANESE_TEXT.test(item.articleTitleJa || '') &&
    JAPANESE_TEXT.test(item.summaryJa || '')
  );

  const enrichedItems = [];
  for (const item of items) {
    try {
      enrichedItems.push(await enrichTrend(item, previousItems));
    } catch (error) {
      const cached = previousItems.find(previous => previous.topic === item.topic);
      if (cached) {
        console.warn(`Related article unavailable for ${item.topic}; keeping its previous summary`);
        enrichedItems.push({
          ...cached,
          ...item,
          articleTitleJa: normalizeBrandTerms(cached.articleTitleJa, cached.articleTitle || cached.topic),
          summaryJa: normalizeBrandTerms(cached.summaryJa, `${cached.articleTitle || ''} ${cached.topic || ''}`),
          retainedArticleAt: new Date().toISOString(),
        });
      } else {
        console.warn(`Using trend-only fallback for ${item.topic}: ${error.message}`);
        enrichedItems.push(buildTrendOnlyItem(item));
      }
    }
  }

  data.xTrends = {
    ...data.xTrends,
    items: enrichedItems,
    articleFetchedAt: new Date().toISOString(),
    trendSource: 'Trends24',
    source: 'Trends24 / Hacker News Algolia',
    partial: enrichedItems.length < 5,
  };

  const temporaryPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, DATA_PATH);
  console.log(`Added Japanese article summaries to ${enrichedItems.length} X trends`);
}

main().catch(error => {
  console.error(`X trend enrichment failed; published data will be kept: ${error.stack || error.message}`);
  process.exit(1);
});
