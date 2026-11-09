// 性能基准：node bench.mjs
// 验证纯本地清洗的耗时量级，确认满足「毫秒级、不联网」的要求。
import { cleanText } from './main.js';

const cfg = {
  stripCodeSymbols: true,
  dropShortLines: 1,
  joinBrokenLines: true,
  minJoinLength: 20,
  keepParagraphs: true,
  dropTimestamps: true,
  keepMusicNotes: true,
  extraNoise: '',
};

// 典型截图字幕：40 行，夹杂碎片
const noisy = [
  '{ Dashboard } | Usage | Keys',
  '---===---',
  'This is a long sentence that got',
  'broken by the OCR engine',
  'l',
  '|',
  '日 Settings',
  '00:01:23,456 --> 00:01:24,000',
  'I never thought you would come back.',
  'Not after everything.',
  '{}',
  '[]',
  'aaaa',
  '（ ）Hello（ world ）',
  'call my_function now',
  '<i>Hello</i>',
  '•••',
  '>> Next scene',
  '♪ la la la ♪',
  'The quick brown fox',
  '12',
  '3.5',
  'Second line',
  'She said, "Wait!" and left.',
  "It's don't can't",
  'It happened in 1999 at 10:30.',
  '「他说」',
  '《三体》',
  'See https://example.com/a_b?c=1 for details',
  'x = (a + b) * 2',
  '▌ Loading ▌',
  '■ Done ■',
  'inter-',
  'national cooperation',
  '  ',
  '| | | { } [ ] the only real words { } [ ] | | |',
  'Chapter One',
  'Chapter Two',
  'End of the scene.',
].join('\n');

// 长文本：把上面的样本复制 20 遍（≈800 行），模拟整页文档截图
const long = Array.from({ length: 20 }, () => noisy).join('\n');

function bench(label, text, rounds) {
  // 预热
  for (let i = 0; i < 20; i++) cleanText(text, cfg);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) cleanText(text, cfg);
  const t1 = process.hrtime.bigint();
  const totalMs = Number(t1 - t0) / 1e6;
  const perRun = totalMs / rounds;
  console.log(
    '  ' + label.padEnd(28) +
    ' 单次 ' + perRun.toFixed(3) + ' ms' +
    '  （' + rounds + ' 轮共 ' + totalMs.toFixed(1) + ' ms）'
  );
  return perRun;
}

console.log('清洗性能基准（纯本地正则，无网络）\n');
console.log('样本：');
console.log('  典型字幕  ' + noisy.length + ' 字符 / ' + noisy.split('\n').length + ' 行');
console.log('  整页文档  ' + long.length + ' 字符 / ' + long.split('\n').length + ' 行');
console.log('\n耗时：');

const a = bench('典型字幕（40 行）', noisy, 2000);
const b = bench('整页文档（800 行）', long, 200);

console.log('\n结论：');
console.log('  典型截图 ' + a.toFixed(2) + ' ms —— 相对 OCR 本身（几十到几百毫秒）可忽略');
console.log('  整页文档 ' + b.toFixed(2) + ' ms —— 仍在毫秒级');

// 输出正确性抽查
console.log('\n清洗结果抽查：');
console.log(JSON.stringify(cleanText(noisy, cfg), null, 1).split('\n').slice(0, 24).join('\n'));
