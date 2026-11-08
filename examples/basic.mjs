import { translate, detectLanguage, dict, phonetic, voiceUrl, VOICE_TYPE } from '../src/index.js';

// ① 自动检测语言
const det = await detectLanguage('Hello world');
console.log('检测结果:', det); // { from: 'en', to: 'zh-CHS', direction: 'en2zh-CHS' }

// ② 翻译（源语言 auto 时自动检测）
const result = await translate('The quick brown fox jumps over the lazy dog.');
console.log('译文:', result.text); // 敏捷的棕色狐狸跳过了懒惰的狗。

// ② 流式翻译，边下边打
import { translateStream } from '../src/index.js';
process.stdout.write('流式: ');
for await (const chunk of translateStream('今天天气不错', { from: 'zh-CHS', to: 'en' })) {
  process.stdout.write(chunk);
}
process.stdout.write('\n');

// ③ 查音标（只对单词有效）
const ph = phonetic(await dict('hello'));
console.log('音标:', ph); // { word: 'hello', ukphone: 'həˈləʊ', usphone: 'həˈloʊ' }

// ④ 发音音频
const ukUrl = voiceUrl('hello', { type: VOICE_TYPE.UK });
const usUrl = voiceUrl('hello', { type: VOICE_TYPE.US });
console.log('英音:', ukUrl);
console.log('美音:', usUrl);

const audio = await fetch(usUrl);
const buf = Buffer.from(await audio.arrayBuffer());
console.log('音频:', audio.status, audio.headers.get('content-type'), buf.length, 'bytes');
