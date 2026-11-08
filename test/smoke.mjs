/**
 * 冒烟测试：直接跑真实的线上接口。
 * 用法：npm test
 */
import assert from 'node:assert/strict';
import {
  getLangConfig,
  detectLanguage,
  parseDirection,
  getToken,
  parseSse,
  translate,
  translateStream,
  dict,
  phonetic,
  voiceUrl,
  voice,
  voiceUrlSimple,
} from '../src/index.js';

const results = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
    console.log(`  ✓ ${name} (${Date.now() - started}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: err.message });
    console.log(`  ✗ ${name} — ${err.message}`);
  }
}

console.log('\n有道翻译接口冒烟测试\n');

await step('①a 语种表', async () => {
  const cfg = await getLangConfig();
  assert.ok(Array.isArray(cfg.LLMLite), 'LLMLite 应该是数组');
  assert.ok(cfg.LLMLite.length > 10, '语种数量应该大于 10');
  return `${cfg.LLMLite.length} 个语种`;
});

await step('①b 语言检测 en', async () => {
  const r = await detectLanguage('Hello world');
  assert.equal(r.from, 'en');
  assert.equal(r.to, 'zh-CHS');
  return r.direction;
});

await step('①b 语言检测 zh', async () => {
  const r = await detectLanguage('今天天气不错');
  assert.equal(r.from, 'zh-CHS');
  return r.direction;
});

await step('②a 取 token', async () => {
  const c = await getToken();
  assert.equal(typeof c.token, 'string');
  assert.equal(typeof c.secretKey, 'string');
  assert.ok(c.token.length > 10);
  return `token ${c.token.length} 字符 / secretKey ${c.secretKey.length} 字符`;
});

await step('②b 翻译 en→zh', async () => {
  const r = await translate('Hello world', { from: 'en', to: 'zh-CHS' });
  assert.ok(r.text.includes('你好'), `译文应该包含"你好"，实际是 ${r.text}`);
  return r.text;
});

await step('②b 翻译 zh→en', async () => {
  const r = await translate('今天天气不错', { from: 'zh-CHS', to: 'en' });
  assert.ok(/weather/i.test(r.text), `译文应该提到 weather，实际是 ${r.text}`);
  return r.text;
});

await step('②c 流式翻译', async () => {
  const chunks = [];
  for await (const c of translateStream('Good morning', { from: 'en', to: 'zh-CHS' })) {
    chunks.push(c);
  }
  assert.ok(chunks.length >= 1, '应该至少产出一个片段');
  return `${chunks.length} 个片段 → ${chunks.join('')}`;
});

await step('③ 音标 hello', async () => {
  const ph = phonetic(await dict('hello'));
  assert.ok(ph, '应该有音标结果');
  assert.equal(ph.word, 'hello');
  assert.ok(ph.ukphone && ph.usphone, '英音美音都应该有');
  return `${ph.ukphone} / ${ph.usphone}`;
});

await step('④ 读音 英音', async () => {
  const buf = await voice('hello', { type: 1 });
  assert.ok(buf.length > 1000, '音频应该大于 1000 字节');
  assert.equal(buf.subarray(0, 3).toString('latin1'), 'ID3', '应该是 MP3（ID3 头）');
  return `${buf.length} 字节`;
});

await step('④ 读音 美音', async () => {
  const buf = await voice('hello', { type: 2 });
  assert.ok(buf.length > 1000);
  return `${buf.length} 字节`;
});

await step('④ 读音 中文', async () => {
  const buf = await voice('你好', { le: 'zh', type: 1 });
  assert.ok(buf.length > 1000);
  return `${buf.length} 字节`;
});

await step('④ 免签名读音接口', async () => {
  const res = await fetch(voiceUrlSimple('hello', { type: 2 }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /audio/);
  const buf = Buffer.from(await res.arrayBuffer());
  return `200 ${buf.length} 字节`;
});

// ---------- 纯函数测试（不联网）----------
await step('纯函数 parseDirection', () => {
  const r = parseDirection('en2zh-CHS');
  assert.deepEqual([r.from, r.to], ['en', 'zh-CHS']);
  return 'en → zh-CHS';
});

await step('纯函数 parseSse', () => {
  const raw = [
    'id:a',
    'event:begin',
    'data:{"requestId":"a","type":"en2zh-CHS"}',
    '',
    'id:a',
    'event:message',
    'data:{"transIncre":"你好"}',
    '',
    'id:a',
    'event:message',
    'data:{"transIncre":"世界"}',
    '',
    'id:a',
    'event:end',
    'data:{"requestId":"a","modelCode":"M04","type":"en2zh-CHS"}',
    '',
  ].join('\n');
  const r = parseSse(raw);
  assert.equal(r.text, '你好世界');
  assert.equal(r.modelCode, 'M04');
  return r.text;
});

await step('纯函数 voiceUrl 结构', () => {
  const u = voiceUrl('hello', { type: 1 });
  assert.ok(u.startsWith('https://dict.youdao.com/pronounce/base?'));
  assert.ok(u.includes('keyfrom=webfanyi'));
  assert.ok(u.includes('appVersion=1'));
  assert.ok(u.includes('sign='));
  return 'URL 结构正确';
});

// ---------- 汇总 ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过\n`);

if (failed.length) {
  console.log('失败项:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
