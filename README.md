# 有道翻译 API（非官方）

有道翻译 Web 端（`fanyi.youdao.com`）接口的非官方 Node.js 封装。纯 JavaScript，零运行时依赖，Node 18+ 直接用。

提供四类能力：

| 能力 | 说明 |
|---|---|
| **语言检测** | 自动判断文本语种，返回 `en2zh-CHS` 这样的语向 |
| **翻译** | SSE 流式翻译，支持增量输出 |
| **音标** | 英音 / 美音，来自有道词典 |
| **发音** | 返回 `audio/mpeg` 音频流，可存为 MP3 |

> 逆向自公开网页的前端 bundle，接口随时可能变化。仅供学习研究，请遵守有道服务条款，不要用于商业用途或高频抓取。

## 安装

```bash
npm install youdao-translate-api
```

或直接克隆使用：

```bash
git clone https://github.com/56dz/YouDaoTranslate-api.git
cd YouDaoTranslate-api
npm test
```

## 快速开始

```js
import { translate, detectLanguage, dict, phonetic, voiceUrl } from 'youdao-translate-api';

// ① 自动检测语言
const lang = await detectLanguage('Hello world');
// → { from: 'en', to: 'zh-CHS', direction: 'en2zh-CHS' }

// ② 翻译
const { text } = await translate('The quick brown fox jumps over the lazy dog.');
// → 敏捷的棕色狐狸跳过了懒惰的狗。

// ③ 音标
const ph = phonetic(await dict('hello'));
// → { word: 'hello', ukphone: 'həˈləʊ', usphone: 'həˈloʊ' }

// ④ 发音（MP3 音频流）
const res = await fetch(voiceUrl('hello', { type: 2 })); // type: 1 英音, 2 美音
// → 200, Content-Type: audio/mpeg
```

## API

### ① 选择语言

#### `getLangConfig(opts?)`

拉取支持的语种表。无需签名。

```js
const cfg = await getLangConfig();
cfg.LLMLite; // ['en', 'zh-CHS', 'ja', ...] 通用模型支持的语种
cfg.LLMPro;  // 高级模型支持的语种
cfg.LLMLiteExclude; // 需要排除的语向
```

#### `detectLanguage(text, opts?)`

自动检测文本语种。

```js
await detectLanguage('Hello world');   // { from: 'en', to: 'zh-CHS', direction: 'en2zh-CHS' }
await detectLanguage('今天天气不错');    // { from: 'zh-CHS', to: 'en', direction: 'zh-CHS2en' }
await detectLanguage('こんにちは世界');  // { from: 'ja', to: 'zh-CHS', direction: 'ja2zh-CHS' }
```

#### `parseDirection(direction)`

把语向字符串拆开（目标语言可能含 `2`，所以按第一个 `2` 切）。

```js
parseDirection('en2zh-CHS'); // { from: 'en', to: 'zh-CHS', direction: 'en2zh-CHS' }
```

常用语种代码见 `LANGUAGES` 常量；免费语向见 `FREE_PAIRS`。

### ② 输入文本 → 翻译

#### `translate(text, opts?)`

一次性返回完整译文。

```js
const r = await translate('今天天气不错', { from: 'zh-CHS', to: 'en' });
r.text; // 'The weather is nice today.'
r.from; // 'zh-CHS'
r.to;   // 'en'
r.type; // 'zh-CHS2en'
```

`opts`：

| 字段 | 默认 | 说明 |
|---|---|---|
| `from` | `'auto'` | 源语言，`'auto'` 时自动检测 |
| `to` | `'zh-CHS'` | 目标语言；`from='auto'` 且未指定时跟随检测结果 |
| `modelName` | `'llmLite'` | 翻译模型 |
| `useTerm` | `false` | 是否使用术语库 |
| `token` / `secretKey` | — | 复用已有凭证，省一次请求 |
| `yduuid` | 随机 | 设备标识 |

#### `translateStream(text, opts?)`

流式翻译，逐段产出增量文本（AsyncGenerator）。

```js
for await (const chunk of translateStream('Good morning')) {
  process.stdout.write(chunk);
}
// 早上好
```

#### `getToken(opts?)`

手动取临时凭证 `{ token, secretKey }`。`secretKey` 会轮换，不建议长期缓存；`token` 可以复用。

#### `parseSse(raw)` / `enhance(payload)`

`parseSse` 把一整段 SSE 文本解析成 `{ text, type, modelCode, requestId }`；`enhance` 是页面上的译后 AI 润色，可选。

### ③ 译文 + 音标

#### `dict(q, opts?)`

查有道词典，返回原始 JSON（释义、音标、例句、词组、同义词、词源等）。

```js
const json = await dict('hello');
json.ec.word.ukphone; // 'həˈləʊ'
json.ec.word.usphone; // 'həˈloʊ'
```

#### `phonetic(json)`

从词典 JSON 里抽出音标。

```js
phonetic(await dict('world')); // { word: 'world', ukphone: 'wɜːld', usphone: 'wɜːrld' }
```

> **注意**：音标只对**单词**有意义。整句翻译走 `translate()`，整句没有音标。

### ④ 读音（音频）

#### `voiceUrl(word, opts?)` → `string`

构造发音 URL，直接 GET 就返回 MP3。

```js
voiceUrl('hello', { type: 1 }); // 英音
voiceUrl('hello', { type: 2 }); // 美音
voiceUrl('你好', { le: 'zh' });  // 中文
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `le` | `'en'` | 语言代码，如 `en` / `zh` |
| `type` | `1` | `1` 英音 / `2` 美音 |
| `rate` | `4` | 语速档位 |
| `yduuid` | `'abcdefg'` | 设备标识（页面固定值） |

#### `voice(word, opts?)` → `Promise<Buffer>`

直接把音频下载成 Buffer。

```js
const buf = await voice('hello', { type: 2 });
await writeFile('hello.mp3', buf);
```

#### `voiceUrlSimple(word, opts?)`

**无需签名**的简化发音接口，适合不想算签名的场景：

```js
voiceUrlSimple('hello', { type: 2 }); // https://dict.youdao.com/dictvoice?audio=hello&type=2
```

## CLI

```bash
node cli.js "Hello world"                    # 翻译
node cli.js -f zh-CHS -t en "今天天气不错"     # 指定语向
node cli.js -p hello                         # 音标
node cli.js -v hello --type 2 -o hello.mp3   # 下载美音
node cli.js --langs                          # 列出语种
```

## 命令行 / 脚本示例

见 [`examples/basic.mjs`](examples/basic.mjs)。跑测试：

```bash
npm test
```

会真实请求线上接口，覆盖四类能力共 15 项检查。

## 签名机制

有道 Web 接口全部走同一套参数签名：

```
1. 删除值为 "" / null / undefined 的字段
2. 所有 key 按字典序升序排序，末尾追加 "key"
3. 拼成 k1=v1&k2=v2&...&key=<SECRET>
4. sign = MD5(该字符串) 的小写 hex
5. pointParam = 相同 key 列表（含 key）用 "," 连接
```

密钥硬编码在前端 bundle 里（页面上公开可见）：

| 用途 | keyid | secret |
|---|---|---|
| 语言检测 | `ai-translate-direction` | `I5WacgKEZaloWBiDnE1fThnzxYWN30PH` |
| 取翻译 token | `translate-webmain-key-getter` | `kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1` |
| 词典 / 音标 | — | `t2he2k4m2g6QKRigK0KAmSpXKgAezywG` |
| 发音 TTS | `voiceFanyiWeb` | `qCG2vdP92hOXDcKa` |

`sign.js` 导出了 `genSign` / `genParamV3`，可以直接自己拼请求。

### 三个容易踩的坑

1. **取 token 的 `translate/key` 必须 POST** — 用 GET 会返回 `{"code":500,"msg":"Internal server error"}`
2. **翻译的 `i` 参数要先 `encodeURIComponent` 再参与签名** — 顺序反了就是 `403 签名验证失败`
3. **发音接口的 `keyfrom` 是 `webfanyi`**，不是翻译接口用的 `webfanyi.webmain`；且 `appVersion` 必须是 `1`

## 接口一览

| 能力 | 方法 | 地址 |
|---|---|---|
| 语种表 | GET | `dict-trans.youdao.com/translate/config` |
| 语言检测 | POST | `luna-ai.youdao.com/translate_llm/v3/translateDirection` |
| 取 token | POST | `dict-trans.youdao.com/translate/key` |
| 翻译 | POST | `dict-trans.youdao.com/webtranslate/sse` |
| 润色 | POST | `dict-trans.youdao.com/translate/enhance` |
| 词典 / 音标 | POST | `dict.youdao.com/jsonapi_s` |
| 发音 | GET | `dict.youdao.com/pronounce/base` |
| 发音（免签） | GET | `dict.youdao.com/dictvoice` |

## 逆向过程

抓包证据、密钥来源、签名算法的定位过程和完整踩坑记录见 [docs/reverse-engineering.md](docs/reverse-engineering.md)。

## 许可

[GPL-3.0](LICENSE)
