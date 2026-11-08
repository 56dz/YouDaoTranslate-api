/**
 * 有道翻译 Web 接口的 TypeScript 声明。
 */

export interface LangConfig {
  LLMLite: string[];
  LLMPro: string[];
  LLMLiteExclude: string[];
  LLMProExclude: string[];
}

export interface Direction {
  from: string;
  to: string;
  direction: string;
}

export interface Credentials {
  token: string;
  secretKey: string;
}

export interface TranslateResult {
  text: string;
  from: string;
  to: string;
  type: string;
}

export interface SseResult {
  text: string;
  type?: string;
  modelCode?: string;
  requestId?: string;
}

export interface Phonetic {
  word: string;
  ukphone?: string;
  usphone?: string;
}

export interface TranslateOptions {
  /** 源语言，默认 'auto'（自动检测） */
  from?: string;
  /** 目标语言，默认 'zh-CHS' */
  to?: string;
  /** 翻译模型，默认 'llmLite' */
  modelName?: string;
  /** 是否使用术语库，默认 false */
  useTerm?: boolean;
  /** 复用已有 token */
  token?: string;
  /** 复用已有 secretKey */
  secretKey?: string;
  /** 设备标识 */
  yduuid?: string;
}

export interface VoiceOptions {
  /** 语言，如 'en' / 'zh'，默认 'en' */
  le?: string;
  /** 1 = 英音，2 = 美音，默认 1 */
  type?: 1 | 2;
  /** 语速档位，默认 4 */
  rate?: number | string;
  /** 设备标识，默认 'abcdefg' */
  yduuid?: string;
}

export const LANGUAGES: Record<string, string>;
export const FREE_PAIRS: string[];
export const VOICE_TYPE: { UK: 1; US: 2 };
export const SECRETS: {
  direction: string;
  keyGetter: string;
  jsonApi: string;
  voice: string;
};
export const ENDPOINTS: Record<string, string>;
export const IDENTITY: Record<string, unknown>;

export class YoudaoError extends Error {
  status?: number;
  body?: string;
  endpoint?: string;
}

export function md5(s: string): string;
export function genSign(params: Record<string, unknown>, secret: string): [string, string];
export function genParamV3(
  extra: Record<string, unknown>,
  secret: string,
  keyid: string,
  product: string,
  keyfrom: string,
  yduuid: string | null,
  client?: string,
  appVersion?: string,
): Record<string, unknown>;
export function toQuery(params: Record<string, unknown>): string;
export function toFormData(params: Record<string, unknown>): FormData;

export function getLangConfig(opts?: { yduuid?: string }): Promise<LangConfig>;
export function parseDirection(direction: string): Direction;
export function detectLanguage(text: string, opts?: { yduuid?: string }): Promise<Direction>;

export function getToken(opts?: { token?: string; yduuid?: string }): Promise<Credentials>;
export function parseSse(raw: string): SseResult;
export function translateStream(
  text: string,
  opts?: TranslateOptions,
): AsyncGenerator<string, void, unknown>;
export function translate(text: string, opts?: TranslateOptions): Promise<TranslateResult>;
export function enhance(payload: {
  srcArticle: string;
  tgtArticle: string;
  from: string;
  to: string;
}): Promise<unknown>;

export function signJsonApi(q: string): {
  sign: string;
  t: string;
  client: string;
  keyfrom: string;
};
export function dict(q: string, opts?: { dicts?: string[] }): Promise<Record<string, any>>;
export function phonetic(json: Record<string, any>): Phonetic | null;

export function voiceUrl(word: string, opts?: VoiceOptions): string;
export function voice(word: string, opts?: VoiceOptions): Promise<Buffer>;
export function voiceUrlSimple(word: string, opts?: { type?: 1 | 2; le?: string }): string;

export default {
  getLangConfig,
  parseDirection,
  detectLanguage,
  getToken,
  parseSse,
  translateStream,
  translate,
  enhance,
  signJsonApi,
  dict,
  phonetic,
  voiceUrl,
  voice,
  voiceUrlSimple,
};
