import { genParamV3, genSign, toQuery, toFormData, IDENTITY, md5 } from './sign.js';

const TRANS = 'https://dict-trans.youdao.com';
const AI = 'https://luna-ai.youdao.com';
const DICT = 'https://dict.youdao.com';

/** 有道支持的语言代码 -> 中文名（页面下拉框文案） */
export const LANGUAGES = {
  'zh-CHS': '简体中文',
  'zh-CHT': '繁体中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  it: '意大利语',
  ru: '俄语',
  ar: '阿拉伯语',
  th: '泰语',
  vi: '越南语',
  id: '印尼语',
  ms: '马来语',
  nl: '荷兰语',
  tr: '土耳其语',
  hi: '印地语',
  km: '高棉语',
  my: '缅甸语',
  kk: '哈萨克语',
  ca: '加泰罗尼亚语',
  ro: '罗马尼亚语',
  ne: '尼泊尔语',
  sv: '瑞典语',
  eo: '世界语',
  hu: '匈牙利语',
};

/** 免费（无需 VIP）语向 */
export const FREE_PAIRS = [
  'zh-CHS2en',
  'en2zh-CHS',
  'ko2zh-CHS',
  'zh-CHS2ko',
  'ja2zh-CHS',
  'zh-CHS2ja',
];

/** 发音类型：1 = 英音，2 = 美音 */
export const VOICE_TYPE = { UK: 1, US: 2 };

/** 硬编码在前端 bundle 里的签名密钥（页面上公开可见的常量） */
export const SECRETS = {
  direction: 'I5WacgKEZaloWBiDnE1fThnzxYWN30PH',
  keyGetter: 'kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1',
  jsonApi: 't2he2k4m2g6QKRigK0KAmSpXKgAezywG',
  voice: 'qCG2vdP92hOXDcKa',
};

export const ENDPOINTS = {
  langConfig: `${TRANS}/translate/config`,
  direction: `${AI}/translate_llm/v3/translateDirection`,
  token: `${TRANS}/translate/key`,
  translate: `${TRANS}/webtranslate/sse`,
  enhance: `${TRANS}/translate/enhance`,
  dict: `${DICT}/jsonapi_s?doctype=json&jsonversion=4`,
  voice: `${DICT}/pronounce/base`,
  voiceSimple: `${DICT}/dictvoice`,
};

/** 带上下文信息的错误类型 */
export class YoudaoError extends Error {
  constructor(message, { status, body, endpoint } = {}) {
    super(message);
    this.name = 'YoudaoError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

async function request(url, init, endpoint) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new YoudaoError(`HTTP ${res.status} from ${endpoint}`, {
      status: res.status,
      body,
      endpoint,
    });
  }
  return res;
}

async function requestJson(url, init, endpoint) {
  const res = await request(url, init, endpoint);
  const json = await res.json();
  if (json && json.code !== undefined && json.code !== 0) {
    throw new YoudaoError(`API error ${json.code}: ${json.msg || ''}`, {
      status: res.status,
      body: JSON.stringify(json),
      endpoint,
    });
  }
  return json;
}

// =====================================================================
// ① 选择语言
// =====================================================================

/**
 * 拉取支持的语种表。无需签名。
 *
 * @param {{yduuid?: string}} [opts]
 * @returns {Promise<{LLMLite: string[], LLMPro: string[], LLMLiteExclude: string[], LLMProExclude: string[]}>}
 */
export async function getLangConfig({ yduuid = '1' } = {}) {
  const q = toQuery({ product: 'webfanyi', client: 'webmain', yduuid });
  const json = await requestJson(`${ENDPOINTS.langConfig}?${q}`, {}, 'langConfig');
  return json.data;
}

/**
 * 把 "en2zh-CHS" 拆成 { from, to }。目标语言本身可能含 "2"，所以按第一个 2 切。
 *
 * @param {string} direction
 * @returns {{from: string, to: string, direction: string}}
 */
export function parseDirection(direction) {
  const idx = direction.indexOf('2');
  if (idx < 0) return { from: direction, to: '', direction };
  return { from: direction.slice(0, idx), to: direction.slice(idx + 1), direction };
}

/**
 * 自动检测文本语言。返回 `{ from, to, direction }`。
 *
 * @param {string} text
 * @param {{yduuid?: string}} [opts]
 * @returns {Promise<{from: string, to: string, direction: string}>}
 */
export async function detectLanguage(text, { yduuid } = {}) {
  if (!text || !text.trim()) throw new TypeError('detectLanguage: text is required');

  const params = genParamV3(
    { input: text },
    SECRETS.direction,
    'ai-translate-direction',
    'webfanyi',
    'fanyi.web',
    yduuid || null,
  );

  const json = await requestJson(
    ENDPOINTS.direction,
    { method: 'POST', body: toFormData(params) },
    'direction',
  );

  return parseDirection(json.data.translateDirection);
}

// =====================================================================
// ② 输入文本 -> 翻译
// =====================================================================

/**
 * 取临时翻译凭证 `{ token, secretKey }`。
 *
 * 注意：必须 POST，GET 会返回 500。
 *
 * @param {{token?: string, yduuid?: string}} [opts]
 * @returns {Promise<{token: string, secretKey: string}>}
 */
export async function getToken({ token, yduuid } = {}) {
  const params = genParamV3(
    {
      keyid: 'translate-webmain-key-getter',
      targetKeyid: 'translate-webfanyi-webmain',
      ...(token ? { token } : {}),
    },
    SECRETS.keyGetter,
    'translate-webmain-key-getter',
    'webfanyi',
    'webfanyi.webmain',
    yduuid || null,
    'webmain',
  );

  const json = await requestJson(
    `${ENDPOINTS.token}?${toQuery(params)}`,
    { method: 'POST' },
    'token',
  );
  return json.data;
}

/**
 * 解析一整段 SSE 响应体，拼出完整译文。
 *
 * @param {string} raw
 * @returns {{text: string, type?: string, modelCode?: string, requestId?: string}}
 */
export function parseSse(raw) {
  let text = '';
  let type;
  let modelCode;
  let requestId;

  for (const block of String(raw).split(/\r?\n\r?\n/)) {
    const event = /^event:(.*)$/m.exec(block)?.[1]?.trim();
    const data = /^data:(.*)$/m.exec(block)?.[1]?.trim();
    if (!data) continue;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }

    if (event === 'begin') {
      type = payload.type;
      requestId = payload.requestId;
    } else if (event === 'message') {
      if (payload.transIncre) text += payload.transIncre;
    } else if (event === 'end') {
      type = payload.type ?? type;
      modelCode = payload.modelCode;
      requestId = payload.requestId ?? requestId;
    }
  }

  return { text, type, modelCode, requestId };
}

function buildTranslateParams({ text, from, to, modelName, useTerm, token, secretKey, yduuid }) {
  return genParamV3(
    {
      product: 'webfanyi',
      appVersion: '1',
      client: 'webmain',
      keyfrom: 'webfanyi.webmain',
      keyid: 'translate-webfanyi-webmain',
      modelName,
      useTerm: String(useTerm),
      // 关键：先 encodeURIComponent 再参与签名
      i: encodeURIComponent(text),
      from,
      to,
      signSecretKey: secretKey,
      keyId: 'translate-webfanyi-webmain',
      token,
      source: 'webmain',
    },
    secretKey,
    'translate-webfanyi-webmain',
    'webfanyi',
    'webfanyi.webmain',
    yduuid || null,
    'webmain',
    '1',
  );
}

/**
 * 流式翻译，逐段产出增量文本。
 *
 * @param {string} text
 * @param {{from?: string, to?: string, modelName?: string, useTerm?: boolean,
 *          token?: string, secretKey?: string, yduuid?: string}} [opts]
 * @returns {AsyncGenerator<string, void, unknown>}
 */
export async function* translateStream(text, opts = {}) {
  const {
    from = 'auto',
    to = 'zh-CHS',
    modelName = 'llmLite',
    useTerm = false,
    token: cachedToken,
    secretKey: cachedSecret,
    yduuid,
  } = opts;

  if (!text || !text.trim()) throw new TypeError('translate: text is required');

  let src = from;
  if (src === 'auto') src = (await detectLanguage(text, { yduuid })).from;

  const cred = cachedToken && cachedSecret
    ? { token: cachedToken, secretKey: cachedSecret }
    : await getToken({ token: cachedToken, yduuid });

  const params = buildTranslateParams({
    text,
    from: src,
    to,
    modelName,
    useTerm,
    token: cred.token,
    secretKey: cred.secretKey,
    yduuid,
  });

  const res = await request(
    ENDPOINTS.translate,
    {
      method: 'POST',
      body: toFormData(params),
      headers: { Accept: 'text/event-stream' },
    },
    'translate',
  );

  const reader = res.body?.getReader();
  if (!reader) {
    const parsed = parseSse(await res.text());
    if (parsed.text) yield parsed.text;
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^(\r?\n\r?\n)/, '');

      const event = /^event:(.*)$/m.exec(block)?.[1]?.trim();
      const data = /^data:(.*)$/m.exec(block)?.[1]?.trim();
      if (event !== 'message' || !data) continue;

      try {
        const payload = JSON.parse(data);
        if (payload.transIncre) yield payload.transIncre;
      } catch {
        /* 跳过不完整块 */
      }
    }
  }
}

/**
 * 翻译文本，一次性返回完整结果。
 *
 * @param {string} text
 * @param {{from?: string, to?: string, modelName?: string, useTerm?: boolean,
 *          token?: string, secretKey?: string, yduuid?: string}} [opts]
 * @returns {Promise<{text: string, from: string, to: string, type: string}>}
 */
export async function translate(text, opts = {}) {
  const { from = 'auto' } = opts;
  let src = from;
  let dst = opts.to || 'zh-CHS';
  let direction = `${from}2${dst}`;

  if (src === 'auto') {
    const det = await detectLanguage(text, { yduuid: opts.yduuid });
    src = det.from;
    if (!opts.to) dst = det.to;
    direction = `${src}2${dst}`;
  }

  let out = '';
  for await (const chunk of translateStream(text, { ...opts, from: src, to: dst })) {
    out += chunk;
  }

  return { text: out, from: src, to: dst, type: direction };
}

/**
 * 译后 AI 润色（可选，页面上的「润色」开关）。
 *
 * @param {{srcArticle: string, tgtArticle: string, from: string, to: string}} payload
 */
export async function enhance(payload) {
  const { token, secretKey } = await getToken();

  const params = genParamV3(
    {
      signSecretKey: secretKey,
      keyId: 'translate-webfanyi-webmain',
      product: 'webfanyi',
      keyfrom: 'webfanyi.webmain',
      client: 'webmain',
      token,
      source: 'webmain',
      ...payload,
    },
    secretKey,
    'translate-webfanyi-webmain',
    'webfanyi',
    'webfanyi.webmain',
    null,
    'webmain',
  );

  return requestJson(ENDPOINTS.enhance, { method: 'POST', body: toFormData(params) }, 'enhance');
}

// =====================================================================
// ③ 译文 + 音标
// =====================================================================

/**
 * jsonapi_s 专用的签名算法（和 genSign 不是一套）。
 *
 * @param {string} q
 * @returns {{sign: string, t: string, client: string, keyfrom: string}}
 */
export function signJsonApi(q) {
  const keyfromM = 'webfanyi.webmain';
  const clientT = 'webmain';
  const t = `${Date.now()}${`${q}${keyfromM}`.length % 10}`;
  const r = md5(`${q}${keyfromM}`);
  const sign = md5(`${clientT}${q}${t}${SECRETS.jsonApi}${r}`);
  return { sign, t, client: clientT, keyfrom: keyfromM };
}

/**
 * 查询词典：音标、释义、例句、词组等。
 * 注意：音标只对单词有意义，整句通常没有结果。
 *
 * @param {string} q
 * @param {{dicts?: string[]}} [opts]
 * @returns {Promise<object>} 有道原始 JSON
 */
export async function dict(q, { dicts = ['ec'] } = {}) {
  if (!q || !q.trim()) throw new TypeError('dict: q is required');

  const body = new URLSearchParams({
    needTranslate: 'false',
    dicts: JSON.stringify({ count: String(dicts.length), dicts }),
    q,
    ...signJsonApi(q),
  });

  return requestJson(ENDPOINTS.dict, { method: 'POST', body }, 'dict');
}

/**
 * 从词典 JSON 里提取音标。
 *
 * @param {object} json
 * @returns {{word: string, ukphone?: string, usphone?: string} | null}
 */
export function phonetic(json) {
  const word = json?.ec?.word ?? (Array.isArray(json?.simple?.word) ? json.simple.word[0] : null);
  if (!word) return null;

  return {
    word: word['return-phrase'] || word.word || '',
    ukphone: word.ukphone,
    usphone: word.usphone,
  };
}

// =====================================================================
// ④ 读音（音频）
// =====================================================================

/**
 * 构造发音 URL。该 URL 直接返回 `audio/mpeg`（MP3）。
 *
 * @param {string} word 单词或句子
 * @param {{le?: string, type?: 1|2, rate?: number|string, yduuid?: string}} [opts]
 * @returns {string}
 */
export function voiceUrl(word, opts = {}) {
  const { le = 'en', type = VOICE_TYPE.UK, rate = 4, yduuid = 'abcdefg' } = opts;

  const params = genParamV3(
    { le, rate, word, type, id: '', phonetic: '' },
    SECRETS.voice,
    'voiceFanyiWeb',
    'webfanyi',
    'webfanyi',
    yduuid,
    'web',
    '1', // appVersion 必须是 1，不是 12.0.0
  );

  return `${ENDPOINTS.voice}?${toQuery(params)}`;
}

/**
 * 下载发音音频。
 *
 * @param {string} word
 * @param {{le?: string, type?: 1|2, rate?: number|string, yduuid?: string}} [opts]
 * @returns {Promise<Buffer>}
 */
export async function voice(word, opts = {}) {
  const res = await request(voiceUrl(word, opts), {}, 'voice');
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 无需签名的简化发音接口，适合不想算签名的场景。
 *
 * @param {string} word
 * @param {{type?: 1|2, le?: string}} [opts]
 * @returns {string}
 */
export function voiceUrlSimple(word, { type = VOICE_TYPE.US, le = 'en' } = {}) {
  return `${ENDPOINTS.voiceSimple}?${toQuery({ audio: word, type, le })}`;
}

export { genSign, genParamV3, IDENTITY, md5, toQuery, toFormData };
