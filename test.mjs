// 清洗逻辑自测：node test.mjs
// 用例全部来自本机 Manggo history.sqlite3 里真实 OCR 出来的坏样本 + 典型字幕形态
import { cleanText } from './main.js';

const BASE = {
  stripCodeSymbols: true,
  dropShortLines: 1,
  joinBrokenLines: true,
  minJoinLength: 20,
  keepParagraphs: true,
  dropTimestamps: true,
  keepMusicNotes: true,
  extraNoise: '',
};

const cfg = (over) => ({ ...BASE, ...over });

const cases = [
  // ---- 1. 界面边框 / 光标被认成碎片 ----
  {
    name: '孤立括号和竖线',
    input: '{ Dashboard } | Usage | Keys',
    expect: 'Dashboard Usage Keys',
  },
  {
    name: 'OCR 把图标认成日/目/O',
    input: '日 Dashboard\n目 Usage\nO Keys',
    expect: 'Dashboard\nUsage\nKeys',
  },
  {
    name: '行内夹图标单字',
    input: 'Settings 口 Language 目 Region',
    expect: 'Settings Language Region',
  },
  {
    name: '空括号对',
    input: 'Press ( ) to continue [ ]',
    expect: 'Press to continue',
  },
  {
    name: '纯符号行',
    input: 'Hello world\n---===---\n{}\n[]\nSecond line',
    expect: 'Hello world\nSecond line',
  },
  {
    name: '单字符碎片行',
    input: 'The quick brown fox\nl\n|\nJ\njumps over',
    expect: 'The quick brown fox\njumps over',
  },
  {
    name: '重复字符行',
    input: 'Loading\n=====\naaaaa\nDone',
    expect: 'Loading\nDone',
  },
  {
    name: '纯数字行',
    input: 'Chapter One\n12\n3.5\nChapter Two',
    expect: 'Chapter One\nChapter Two',
  },

  // ---- 2. 拆断的行 ----
  {
    name: '上一行没说完 + 小写开头 → 拼句',
    input: 'This is a long sentence that got\nbroken by the OCR engine',
    expect: 'This is a long sentence that got broken by the OCR engine',
  },
  {
    name: '句号后不拼',
    input: 'First sentence.\nSecond sentence.',
    expect: 'First sentence.\nSecond sentence.',
  },
  {
    name: '连字符断词接上',
    input: 'inter-\nnational cooperation',
    expect: 'international cooperation',
  },
  {
    name: '大写开头不拼（新句）',
    input: 'And then\nSuddenly it stopped',
    expect: 'And then\nSuddenly it stopped',
  },

  // ---- 3. 真实坏样本（本机 history 里的） ----
  {
    name: '真实样本：-quicktext',
    input: '-quicktext',
    expect: 'quicktext',
  },
  {
    name: '真实样本：Ilight24/',
    input: 'Ilight24/',
    expect: 'Ilight24',
  },
  {
    name: '真实样本：Pylogmon,',
    input: 'Pylogmon,',
    expect: 'Pylogmon,',
  },
  {
    name: '真实样本：langu 4 with',
    input: 'JavaScript (JS) is a lightweight interpreted programming langu 4 with ',
    expect: 'JavaScript (JS) is a lightweight interpreted programming langu 4 with',
  },
  {
    name: '真实样本：中文被认成「儿」',
    input: '儿十到儿百毫秒',
    expect: '儿十到儿百毫秒',
  },
  {
    name: '真实样本：smartLineBreakRemoval = false',
    input: 'smartLineBreakRemoval = false',
    expect: 'smartLineBreakRemoval false',
  },

  // ---- 4. 不该被误删的正常文本 ----
  {
    name: '正常英文字幕原样保留',
    input: 'I never thought you would come back.\nNot after everything.',
    expect: 'I never thought you would come back.\nNot after everything.',
  },
  {
    name: '引号和句末标点保留',
    input: 'She said, "Wait!" and left.',
    expect: 'She said, "Wait!" and left.',
  },
  {
    name: '缩写和撇号保留',
    input: "It's don't can't — all fine",
    expect: "It's don't can't — all fine",
  },
  {
    name: '数字和时间保留',
    input: 'It happened in 1999 at 10:30.',
    expect: 'It happened in 1999 at 10:30.',
  },
  {
    name: '中文字幕保留',
    input: '我从来没想过你会回来。',
    expect: '我从来没想过你会回来。',
  },

  // ---- 5. 开关行为 ----
  {
    name: '关掉代码符号删除后保留方括号等',
    input: 'array[0] = value',
    over: { stripCodeSymbols: false },
    expect: 'array[0] = value',
  },
  {
    name: '下划线当分隔符（不受开关影响）',
    input: 'call my_function now',
    over: { stripCodeSymbols: false },
    expect: 'call my function now',
  },
  {
    name: '阈值 2 会丢 hi / ok',
    input: 'Hello\nhi\nok\nworld',
    over: { dropShortLines: 2 },
    expect: 'Hello\nworld',
  },
  {
    name: '关掉拼句后保留原换行',
    input: 'This is a long sentence that got\nbroken by the OCR engine',
    over: { joinBrokenLines: false },
    expect: 'This is a long sentence that got\nbroken by the OCR engine',
  },
  {
    name: '额外删除字符',
    input: 'Price ※ 100 → total',
    over: { extraNoise: '※,→' },
    expect: 'Price 100 total',
  },
  {
    name: '全角转半角',
    input: 'Ｈｅｌｌｏ　ｗｏｒｌｄ',
    expect: 'Hello world',
  },
  {
    name: '压掉多余空行',
    input: 'One\n\n\n\n\nTwo',
    expect: 'One\n\nTwo',
  },

  // ---- 6. 字幕里更细的碎片形态 ----
  {
    name: '光标块和方块残留',
    input: '▌ Loading ▌\n■ Done ■',
    expect: 'Loading\nDone',
  },
  {
    name: '项目符号列表行',
    input: '•••\n>> Next scene\n«quote»',
    expect: 'Next scene\nquote',
  },
  {
    name: '时间轴行整行丢弃',
    input: '00:01:23,456 --> 00:01:24,000\nHello there',
    expect: 'Hello there',
  },
  {
    name: 'HTML 标签整对删除',
    input: '<i>Hello</i> <b>world</b>',
    expect: 'Hello world',
  },
  {
    name: '全角括号转半角后清理',
    input: '（ ）Hello（ world ）',
    expect: 'Hello(world)',
  },
  {
    name: '英文里混进中文句号',
    input: 'This is fine。Next one。',
    expect: 'This is fine。Next one。',
  },
  {
    name: '方括号字幕标记保留',
    input: '[Music]\n[Applause]\nHello',
    expect: 'Music\nApplause\nHello',
  },
  {
    name: '音乐符号保留',
    input: '♪ la la la ♪',
    expect: '♪ la la la ♪',
  },
  {
    name: '行尾上标数字残留',
    input: 'The answer is here 1\nAnd here 2',
    expect: 'The answer is here 1\nAnd here 2',
  },
  {
    name: '密集碎片包围正文',
    input: '| | | { } [ ] the only real words { } [ ] | | |',
    expect: 'the only real words',
  },
  {
    name: 'URL 保留',
    input: 'See https://example.com/a_b?c=1 for details',
    over: { stripCodeSymbols: false },
    expect: 'See https://example.com/a_b?c=1 for details',
  },
  {
    name: '数学公式符号保留（关代码符号）',
    input: 'x = (a + b) * 2',
    over: { stripCodeSymbols: false },
    expect: 'x = (a + b) * 2',
  },
  {
    name: '中文引号书名号保留',
    input: '「他说」\n《三体》',
    expect: '「他说」\n《三体》',
  },
  {
    name: '空输入返回空串',
    input: '   \n\n  ',
    expect: '',
  },
  {
    name: '纯噪声输入返回空串',
    input: '{}[]|_~\n---===\nlll',
    expect: '',
  },
];

let pass = 0;
const fails = [];

for (const c of cases) {
  const got = cleanText(c.input, cfg(c.over || {}));
  if (got === c.expect) {
    pass++;
  } else {
    fails.push({ name: c.name, input: c.input, expect: c.expect, got });
  }
}

console.log('通过 ' + pass + ' / ' + cases.length);

if (fails.length) {
  console.log('\n失败用例：');
  for (const f of fails) {
    console.log('\n【' + f.name + '】');
    console.log('  输入: ' + JSON.stringify(f.input));
    console.log('  期望: ' + JSON.stringify(f.expect));
    console.log('  实际: ' + JSON.stringify(f.got));
  }
  process.exit(1);
}

// 幂等性：清洗两次结果不变
console.log('\n幂等性检查：');
let idem = true;
for (const c of cases) {
  const once = cleanText(c.input, cfg(c.over || {}));
  const twice = cleanText(once, cfg(c.over || {}));
  if (once !== twice) {
    idem = false;
    console.log('  不稳定: ' + c.name + ' → ' + JSON.stringify(once) + ' vs ' + JSON.stringify(twice));
  }
}
console.log(idem ? '  全部稳定' : '  存在不稳定用例');
if (!idem) process.exit(1);
