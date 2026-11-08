# 有道翻译 Web 逆向：4 个核心接口

> 本文是 `youdao-translate-api` 的逆向记录，包含抓包证据、密钥来源和全部踩坑过程。

目标站点：`https://fanyi.youdao.com/#/TextTranslate`
所有结论均通过对该站真实交互的抓包 + 前端 bundle（`app.2e09e6ee.js` / `chunk-vendors.87c4cbe1.js` / `853.0ce0e76d.js`）静态分析得出，并用 Node 独立复现验证通过。

---

## 0. 公共：签名算法（4 个接口都用它）

有道所有 Web 接口都用同一套「参数签名」，来自 bundle 里的 `genSign` / `genParamV3`：

```
1. 删掉值为 "" / null / undefined 的字段
2. 取所有 key 字典序升序排序，末尾追加 "key"
3. 拼成 k1=v1&k2=v2&...&key=<SECRET>
4. sign = MD5(该字符串) 的小写 hex
5. pointParam = 这些 key（含最后的 key）用 "," 连接
```

```js
function genSign(params, secret) {
  const p = { ...params };
  for (const k of Object.keys(p)) if (p[k] === '' || p[k] == null) delete p[k];
  const keys = Object.keys(p).sort().filter(k => p[k] !== undefined);
  keys.push('key');
  p.key = secret;
  const str = keys.map(k => `${k}=${p[k]}`).join('&');
  return [md5(str), keys.join(',')];
}
```

标准身份字段（各接口通用，`genParamV3` 默认值）：

```js
{ appVersion:'12.0.0', client:'web', mid:1, vendor:'web', screen:1,
  model:1, imei:1, network:'wifi', mysticTime:Date.now(),
  yduuid:'<32位hex>', abtest:0 }
```

`mysticTime` 是毫秒时间戳。`yduuid` 是浏览器 localStorage 里的随机 32 位 hex（也可固定用 `abcdefg`）。

发现的硬编码密钥（全部在前端明文里）：

| 用途 | keyid | secret |
|---|---|---|
| 语言检测 | `ai-translate-direction` | `I5WacgKEZaloWBiDnE1fThnzxYWN30PH` |
| 取翻译 token | `translate-webmain-key-getter` | `kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1` |
| 词典音标 jsonapi_s | — | `t2he2k4m2g6QKRigK0KAmSpXKgAezywG` |
| 读音 TTS | `voiceFanyiWeb` | `qCG2vdP92hOXDcKa` |

---

## ① 选择语言

### ①-a 支持的语种表（静态下拉框数据）

```
GET https://dict-trans.youdao.com/translate/config?product=webfanyi&client=webmain&yduuid=1
```

无需签名、无鉴权。响应：

```json
{"data":{
  "LLMLite":["en","zh-CHS","ja","fr","de","es","ar","ru","zh-CHT","km","nl","ms","my","pt","th","it","id","vi","ko","kk","ca","ro","ne","sv","eo","hu","hi"],
  "LLMPro":["en","zh-CHS","ko","ja","de","km","ms","th","it","vi","et","pl","bs","da","fi","kk","ca","ro","ne","sv","eo","uk","hu","hi"],
  "LLMLiteExclude":[], "LLMProExclude":["de2zh-CHS","fr2zh-CHS","zh-CHS2fr"]
},"code":0,"msg":"OK"}
```

语种代码用「`语言-文字`」形式，如 `zh-CHS` 简体中文、`zh-CHT` 繁体中文、`en` 英语、`ko` 韩语。免费（非 VIP）语向为：`zh-CHS2en`、`en2zh-CHS`、`ko2zh-CHS`、`zh-CHS2ko`、`ja2zh-CHS`、`zh-CHS2ja`。

### ①-b 自动检测语言（点「自动检测语言」时）

```
POST https://luna-ai.youdao.com/translate_llm/v3/translateDirection
Content-Type: multipart/form-data
```

字段（全部参与签名）：

```
product=webfanyi  appVersion=12.0.0  client=web  mid=1  vendor=web  screen=1
model=1  imei=1  network=wifi  keyfrom=fanyi.web  keyid=ai-translate-direction
mysticTime=<ms>  yduuid=<32hex>  abtest=0
token=<localStorage.ydtoken，可缺省>  input=<原文>
sign=<md5>  pointParam=<排序后的key列表>
```

响应：

```json
{"data":{"translateDirection":"en2zh-CHS"},"code":0,"msg":"OK"}
```

实测：`"Hello world"→en2zh-CHS`，`"今天天气不错"→zh-CHS2en`，`"こんにちは世界"→ja2zh-CHS`。
把 `-` 前后 split 就是源语言和目标语言。

---

## ② 输入文本 → 翻译

翻译是**两步**：先换临时 token + secretKey，再调 SSE 流式翻译。

### ②-a 取 token / secretKey

```
POST https://dict-trans.youdao.com/translate/key?<query>
```

参数走 URL query（**注意必须 POST，GET 会 500**）：

```
product=webfanyi  appVersion=12.0.0  client=webmain  mid=1  vendor=web
screen=1  model=1  imei=1  network=wifi  keyfrom=webfanyi.webmain
keyid=translate-webmain-key-getter  mysticTime=<ms>  yduuid=<32hex>
abtest=0  targetKeyid=translate-webfanyi-webmain
token=<localStorage['text-ydtoken']，第二次起带上>
sign=<md5, secret=kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1>
pointParam=<排序后的key列表>
```

响应：

```json
{"data":{"token":"4ea61902420142f98f4a9f863f5f6b2e",
         "secretKey":"BdCYRtHAJxO7yNm9RHwU2JiFISIk62Ts"},"code":0,"msg":"OK"}
```

`secretKey` 会轮换，所以每次翻译前都要换一次；`token` 可缓存复用。

### ②-b 流式翻译（SSE）

```
POST https://dict-trans.youdao.com/webtranslate/sse
Content-Type: multipart/form-data
Accept: text/event-stream
```

字段：

```
product=webfanyi  appVersion=1  client=webmain  keyfrom=webfanyi.webmain
keyid=translate-webfanyi-webmain  modelName=llmLite  useTerm=false
i=<encodeURIComponent(原文)>   ← 注意：先编码再参与签名
from=en  to=zh-CHS
signSecretKey=<②-a 的 secretKey>
keyId=translate-webfanyi-webmain
token=<②-a 的 token>
source=webmain
mid=1  vendor=web  screen=1  model=1  imei=1  network=wifi
mysticTime=<ms>  yduuid=<32hex>  abtest=0
sign=<md5(用 secretKey 签)>  pointParam=<...>
```

响应 `text/event-stream`，逐段增量：

```
id:<uuid>
event:begin
data:{"requestId":"<uuid>","type":"en2zh-CHS"}
retry:3000

id:<uuid>
event:message
data:{"transIncre":"你"}
retry:3000

id:<uuid>
event:message
data:{"transIncre":"好世界"}
retry:3000

id:<uuid>
event:end
data:{"requestId":"<uuid>","modelCode":"M04","type":"en2zh-CHS"}
retry:3000
```

**把所有 `transIncre` 拼接起来就是完整译文。** 实测 `"Hello world"` → `"你好世界"`，`"The quick brown fox jumps over the lazy dog."` → `"敏捷的棕色狐狸跳过了懒惰的狗。"`。

> 可选：`POST https://dict-trans.youdao.com/translate/enhance`（`srcArticle` / `tgtArticle` / `from` / `to`）做译后 AI 润色，非必需。

---

## ③ 译文 + 音标

音标不在翻译接口里，而是来自**词典接口** `jsonapi_s`（页面右侧「词典」面板，按单词查）。

```
POST https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4
Content-Type: application/x-www-form-urlencoded
```

请求体：

```
needTranslate=false
dicts={"count":"1","dicts":["ec"]}     ← ec = 英汉词典
q=hello
t=<Date.now()><(q+'webfanyi.webmain').length % 10>
client=webmain
keyfrom=webfanyi.webmain
sign=<见下>
```

`jsonapi_s` 用的是**另一套**签名（不是 genSign）：

```js
const keyfromM = 'webfanyi.webmain';
const clientT  = 'webmain';
const t = `${Date.now()}${(`${q}${keyfromM}`.length % 10)}`;
const r = md5(`${q}${keyfromM}`);
const sign = md5(`${clientT}${q}${t}${'t2he2k4m2g6QKRigK0KAmSpXKgAezywG'}${r}`);
```

响应体积较大（几十 KB），关键字段：

```json
{
  "ec": {
    "word": {
      "return-phrase": "hello",
      "ukphone": "həˈləʊ",       // 英音音标
      "usphone": "həˈloʊ",       // 美音音标
      "ukspeech": "hello&type=1",
      "usspeech": "hello&type=2",
      "trs": [ { "pos": "int.", "tran": "喂，你好…" }, ... ],
      "wfs": [ { "wf": { "name": "复数", "value": "hellos" } } ]
    }
  },
  "simple": { "word": [ { "ukphone":"…", "usphone":"…", "return-phrase":"hello" } ] },

  "web_trans": ["您好","哈啰","喂"],
  "exam_type": ["初中","高中","CET4","CET6","考研"],
  "blng_sents_part": {...},   // 双语例句
  "phrs": {...},              // 词组
  "syno": {...},              // 同义词
  "etym": {...}               // 词源
}
```

**取音标**：`j.ec.word.ukphone` / `j.ec.word.usphone`，降级用 `j.simple.word[0].ukphone`。
实测：`hello` → `həˈləʊ` / `həˈloʊ`；`world` → `world / wɜːld` / `wɜːrld`。

> 注意：音标只对**单词**有意义。整句的译文来自 ②，`jsonapi_s` 对整句通常只返回空壳或不相关结果。

---

## ④ 读音（音频格式）

```
GET https://dict.youdao.com/pronounce/base?<query>
```

参数（全部 URL query，GET）：

```
product=webfanyi  appVersion=1  client=web  mid=1  vendor=web  screen=1
model=1  imei=1  network=wifi
keyfrom=webfanyi            ← 注意：这里不是 webfanyi.webmain
keyid=voiceFanyiWeb
mysticTime=<ms>  yduuid=abcdefg
le=en                       ← 语言：en / zh
phonetic=                   ← 留空
rate=4                      ← 语速档位
word=<encodeURIComponent(要读的词或句子)>
type=1                      ← 1=英音, 2=美音
id=
sign=<md5, secret=qCG2vdP92hOXDcKa>
pointParam=appVersion,client,imei,keyfrom,keyid,le,mid,model,mysticTime,network,product,rate,screen,type,vendor,word,yduuid,key
```

响应：

```
HTTP 200
Content-Type: audio/mpeg
（MP3，ID3 头，无重定向，直接可播放）
```

实测：英音 `11565` 字节 / 美音 `10605` 字节 / 中文 `12960` 字节，均为 `audio/mpeg`。

### 备用（更简单、无签名）

若不想算签名，经典词典接口直接可用：

```
GET https://dict.youdao.com/dictvoice?audio=hello&type=2
→ 200 audio/mpeg（type=1 英音, type=2 美音）
```

---

## 附：完整可运行代码

见 `rev/youdao.mjs`（Node 18+，零依赖，内置 `fetch` / `FormData`）。导出：

```js
getLangConfig()                 // ① 语种表
detectLanguage(text)            // ① 自动检测 → "en2zh-CHS"
getToken()                      // ② 取 { token, secretKey }
translate(text, from, to)       // ② SSE 翻译 → { text, raw }
dict(q)                         // ③ 词典原始 JSON
phonetic(dictJson)              // ③ → { word, usphone, ukphone }
voiceUrl(word, le, type, rate)  // ④ 读音 URL（audio/mpeg）
```

最小调用示例：

```js
import { detectLanguage, translate, dict, phonetic, voiceUrl } from './rev/youdao.mjs';

const dir = await detectLanguage('Hello world');        // "en2zh-CHS"
const { text } = await translate('Hello world', 'en', 'zh-CHS');
const ph = phonetic(await dict('hello'));               // { usphone:'həˈloʊ', ukphone:'həˈləʊ' }
const mp3 = await fetch(voiceUrl('hello', 'en', 1));    // 200 audio/mpeg
```

---

## 附：踩坑清单

| 坑 | 说明 |
|---|---|
| `translate/key` 必须 POST | 用 GET 会返回 `{"code":500,"msg":"Internal server error"}` |
| `i` 参数先编码再签名 | `app.js` 里是 `e.i = encodeURIComponent(e.i)` 之后才交给签名函数 |
| `sign` 的 key 顺序 | 必须是**字典序**，且末尾追加 `key=<secret>`；`pointParam` 必须与之一致 |
| 空值字段要删 | `""` 参与签名会导致 `invalid sign` |
| `secretKey` 会轮换 | 不能长期缓存，每次翻译前重新取 |
| 读音接口的 `keyfrom` | 是 `webfanyi`，不是 `webfanyi.webmain`（和翻译接口不同） |
| 读音接口的 `yduuid` | 页面固定用 `abcdefg` |
| 音标只对单词 | 整句没有音标，只有译文 |
