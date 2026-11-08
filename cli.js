#!/usr/bin/env node
/**
 * 有道翻译命令行工具
 *
 *   youdao 你好世界                 # 自动检测 → 中文
 *   youdao -f en -t zh-CHS hello    # 指定语向
 *   youdao -p hello                 # 只查音标
 *   youdao -v hello                 # 只出读音 URL
 *   youdao -v hello -o hello.mp3    # 下载音频
 *   youdao --langs                  # 列出支持的语种
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  getLangConfig,
  LANGUAGES,
  translate,
  dict,
  phonetic,
  voiceUrl,
  voice,
  VOICE_TYPE,
} from './src/index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string', short: 'f', default: 'auto' },
    to: { type: 'string', short: 't', default: 'zh-CHS' },
    model: { type: 'string', short: 'm', default: 'llmLite' },
    phonetic: { type: 'boolean', short: 'p', default: false },
    voice: { type: 'boolean', short: 'v', default: false },
    output: { type: 'string', short: 'o' },
    type: { type: 'string', default: '1' },
    langs: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const text = positionals.join(' ');

function usage() {
  console.log(`
有道翻译 CLI

用法:
  youdao [选项] <文本>

选项:
  -f, --from <lang>     源语言，默认 auto（自动检测）
  -t, --to <lang>       目标语言，默认 zh-CHS
  -m, --model <name>    模型，默认 llmLite
  -p, --phonetic        同时输出音标（仅单词有效）
  -v, --voice           输出读音 URL
  -o, --output <file>   配合 -v 下载音频到文件
      --type <1|2>      读音类型：1 英音（默认），2 美音
      --langs           列出支持的语种
  -h, --help            显示帮助

示例:
  youdao "Hello world"
  youdao -f zh-CHS -t en "今天天气不错"
  youdao -p -v hello
  youdao -v hello --type 2 -o hello-us.mp3
`);
}

if (values.help || (!text && !values.langs)) {
  usage();
  process.exit(values.help ? 0 : 1);
}

if (values.langs) {
  const cfg = await getLangConfig();
  console.log('\n通用模型 (LLMLite):');
  for (const code of cfg.LLMLite) {
    console.log(`  ${code.padEnd(10)} ${LANGUAGES[code] || ''}`);
  }
  console.log('\n高级模型 (LLMPro):');
  for (const code of cfg.LLMPro) {
    console.log(`  ${code.padEnd(10)} ${LANGUAGES[code] || ''}`);
  }
  console.log();
  process.exit(0);
}

const voiceType = Number(values.type) === 2 ? VOICE_TYPE.US : VOICE_TYPE.UK;

if (values.voice) {
  const url = voiceUrl(text, { type: voiceType, le: values.from === 'auto' ? 'en' : values.from });
  console.log(url);

  if (values.output) {
    const buf = await voice(text, {
      type: voiceType,
      le: values.from === 'auto' ? 'en' : values.from,
    });
    await writeFile(values.output, buf);
    console.log(`已保存 ${buf.length} 字节 → ${values.output}`);
  }
  process.exit(0);
}

if (values.phonetic) {
  const ph = phonetic(await dict(text));
  if (!ph) {
    console.error(`没有查到音标（可能不是单个单词）`);
    process.exit(1);
  }
  console.log(`单词: ${ph.word}`);
  if (ph.ukphone) console.log(`英音: /${ph.ukphone}/`);
  if (ph.usphone) console.log(`美音: /${ph.usphone}/`);
  process.exit(0);
}

const result = await translate(text, {
  from: values.from,
  to: values.to,
  modelName: values.model,
});

console.log(result.text);
