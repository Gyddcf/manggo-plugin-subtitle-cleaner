/**
 * 字幕碎片清洗 —— Manggo 原生插件（纯本地，零网络）
 *
 * 解决的问题：截图 OCR 出来的英文字幕里常混进界面边框、图标、光标被认成的碎片
 * 字符（{ } [ ] | _ ~ ^ 等）、被拆断的行、单字符噪声行，导致 Manggo 的源语言检测
 * 被带偏（英文被当成德语/法语），译文里还留着这些符号。
 *
 * 本插件只做本地确定性清洗，不调用任何模型或翻译接口：
 *   - 全部是同步正则，单次耗时在毫秒级；
 *   - 输出「干净的原文」，译文请让 Manggo 的内置翻译服务并排显示。
 *
 * 入口：
 *   translate(text, from, to, options)     翻译服务（返回清洗后的文本）
 *   cleanSelection(selectedText, options)  划词动作：清洗选中文字并原地替换
 */

/* ============================ 配置 ============================ */

function cfgOf(options) {
  const c = (options && options.config) || {};
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const str = (v, d) => (typeof v === 'string' ? v : d);
  return {
    stripCodeSymbols: bool(c.stripCodeSymbols, true),
    dropShortLines: num(c.dropShortLines, 1),
    joinBrokenLines: bool(c.joinBrokenLines, true),
    minJoinLength: num(c.minJoinLength, 20),
    keepParagraphs: bool(c.keepParagraphs, true),
    dropTimestamps: bool(c.dropTimestamps, true),
    keepMusicNotes: bool(c.keepMusicNotes, true),
    extraNoise: str(c.extraNoise, ''),
  };
}

/* ============================ 字符判定 ============================ */

// 单独成行时一定是噪声的字符（图标/光标/边框被 OCR 认出来的结果）
const ICON_GLYPHS = new Set(
  '日目口囗○●□■◇◆△▲▽▼☆★▪▫·|_~{}^`\\.,:;\'"!?-='.split('')
);

// 夹在正文中间也删的图标类单字
const CJK_ICON_RE = /(^|\s)[日目口囗○●□■](?=\s|$)/g;

// 行首图标类单字：OCR 把界面图标认成这些字符。只在「单字 + 空格 + 后文」时删。
// 不含 I：英文里 I 单独作代词太常见（"I am"），删了会毁句。
const LEADING_GLYPH_RE = /^(?:[日目口囗○●□■◇◆△▲▽▼]|[O0l|])\s+/;

// 绝不出现在正常英文字幕正文里的符号：直接删，不插空格
const HARD_NOISE_RE = /[|~{}^`\\]/g;

// 下划线：当词分隔符（my_function → my function），而不是直接删成 myfunction
const UNDERSCORE_RE = /_+/g;

// 代码/界面类符号：默认也删（stripCodeSymbols），但可关掉
const CODE_NOISE_RE = /[\[\]<>=+*#@$%]/g;

// HTML/XML 标签整对删除（<i>Hello</i> → Hello）
const HTML_TAG_RE = /<\/?[A-Za-z][^<>]{0,40}>/g;

// URL 保护：先抽出来，清洗完再放回，避免被符号规则打碎
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'）)】]+/gi;
const URL_SLOT = '\u0001';

// 行尾可保留的字符集（句末标点、引号、右括号、连字符、中文标点、音乐符号、URL 槽位）
const TRAIL_KEEP_RE =
  /[^\w\u4e00-\u9fa5"'.,!?;:)\]\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u3001\u300d\u300f\u300b\u3009\u3011\uff09\u266a\u266b\u266c\u2669\uE000\uE001-]+$/;

// 行首可保留的字符集（引号、左括号、中文引号书名号、音乐符号、URL 槽位）
const LEAD_KEEP_RE =
  /^[^\w\u4e00-\u9fa5"'\u300c\u300e\u300a\u3008\u3010\u266a\u266b\u266c\u2669\uE000\uE001]+/;

// 字幕时间轴行（00:01:23,456 --> 00:01:24,000）
const TIMESTAMP_RE =
  /^\s*\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?\s*-{1,2}>?\s*\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?\s*$/;

// 全角 ASCII → 半角
function halfWidth(s) {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/* ============================ 清洗 ============================ */

function cleanLine(line, cfg) {
  let l = String(line);

  // 制表符 / 不换行空格 / 全角空格统一成普通空格
  l = l.replace(/[\t\u00A0\u3000]/g, ' ');

  // HTML/XML 标签先整对删掉，别让尖括号规则把内容啃掉
  l = l.replace(HTML_TAG_RE, ' ');

  // 括号内侧空白：Hello( world ) → Hello(world)
  l = l.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

  // 行首图标类单字（日 Dashboard → Dashboard，O Keys → Keys）
  l = l.replace(LEADING_GLYPH_RE, '');

  // 硬噪声字符：删成空串（wor{}d → word，而不是 wor d）
  l = l.replace(HARD_NOISE_RE, '');
  // 下划线当分隔符：my_function → my function
  l = l.replace(UNDERSCORE_RE, ' ');
  if (cfg.stripCodeSymbols) l = l.replace(CODE_NOISE_RE, '');

  // 空括号
  l = l.replace(/[(\[<]\s*[)\]>]/g, '');
  // 括号里只有符号或图标字符：整对删掉
  l = l.replace(/[(\[{]\s*[^A-Za-z0-9\u4e00-\u9fa5]{0,3}\s*[)\]}]/g, '');
  // 夹在正文里的图标单字
  l = l.replace(CJK_ICON_RE, '$1');
  // 重复标点折叠（,,, → , ；!!!! → !）
  l = l.replace(/([.,;:!?])\1+/g, '$1');
  // 折叠连续空白
  l = l.replace(/\s{2,}/g, ' ');
  l = l.trim();

  // 行首游离符号
  l = l.replace(LEAD_KEEP_RE, '');
  // 行尾游离符号
  l = l.replace(TRAIL_KEEP_RE, '');

  return l.trim();
}

function isNoiseLine(t, cfg) {
  if (!t) return true;

  const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const alnum = (t.match(/[A-Za-z0-9]/g) || []).length;

  // 纯符号行
  if (alnum === 0 && cjk === 0) return true;
  // 纯数字行（页码、尺寸标注、时间轴残留）
  if (latin === 0 && cjk === 0) return true;
  // 字母数不超过阈值（默认 1）：单字母碎片
  if (cjk === 0 && latin <= cfg.dropShortLines) return true;
  // 同一个字符重复 3 次以上（====、aaa、....）
  if (/^(.)\1{2,}$/.test(t)) return true;
  // 单字符且属于图标类
  if (t.length === 1 && ICON_GLYPHS.has(t)) return true;
  // 只有音乐符号
  if (/^[\u266a\u266b\u266c\u2669\s]+$/.test(t)) return true;

  return false;
}

function joinBroken(lines, cfg) {
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push('');
      continue;
    }
    const prevIdx = out.length - 1;
    const prev = prevIdx >= 0 ? out[prevIdx] : '';
    if (prev && prev.trim()) {
      const p = prev.replace(/\s+$/, '');
      const endsHard = /[.!?;:]$/.test(p);
      const endsHyphen = /-$/.test(p);
      const startsLower = /^[a-z]/.test(t);
      // 连字符断词：inter- + national → international
      if (endsHyphen && startsLower) {
        out[prevIdx] = p.slice(0, -1) + t;
        continue;
      }
      // 上一行明显没说完（够长、无句末标点、下一行小写开头）才拼回一句。
      // 短行不拼，避免把两行独立字幕粘成一段。
      const minLen = Number(cfg.minJoinLength) || 20;
      if (!endsHard && startsLower && p.length >= minLen) {
        out[prevIdx] = p + ' ' + t;
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

export function cleanText(raw, cfg) {
  const c = cfg || cfgOf(null);
  let s = String(raw == null ? '' : raw);

  // 换行统一
  s = s.replace(/\r\n?/g, '\n');
  // 零宽字符、软连字符、行分隔符
  s = s.replace(/[\u200B-\u200F\u2028\u2029\uFEFF\u00AD]/g, '');
  // 控制字符
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // 全角转半角
  s = halfWidth(s);

  // URL 先抽出来占位，避免被符号规则打碎，清洗完再放回
  const urls = [];
  s = s.replace(URL_RE, (m) => {
    urls.push(m);
    return '\uE000' + (urls.length - 1) + '\uE001';
  });

  // 用户自定义要删的串（逗号或换行分隔）
  if (c.extraNoise) {
    for (const piece of String(c.extraNoise).split(/[,，\n]/)) {
      const v = piece.trim();
      if (v) s = s.split(v).join('');
    }
  }

  const lines = [];
  for (const rawLine of s.split('\n')) {
    // 原本就是空行：保留（后面统一压空行）
    if (!rawLine.trim()) {
      lines.push('');
      continue;
    }
    // 字幕时间轴行：整行丢
    if (c.dropTimestamps && TIMESTAMP_RE.test(rawLine)) continue;

    const t = cleanLine(rawLine, c);
    // 清洗后为空，或判定为碎片行：整行丢掉，不留空位
    if (!t || isNoiseLine(t, c)) continue;
    lines.push(t);
  }

  let out = c.joinBrokenLines ? joinBroken(lines, c) : lines;
  out = out.join('\n');
  out = c.keepParagraphs
    ? out.replace(/\n{3,}/g, '\n\n')
    : out.replace(/\n{2,}/g, '\n');

  // 还原 URL
  out = out.replace(/\uE000(\d+)\uE001/g, (m, i) => {
    const u = urls[Number(i)];
    return u == null ? m : u;
  });

  return out.trim();
}

/* ============================ 服务入口 ============================ */

/**
 * 翻译服务入口。这里**不做翻译**，只返回清洗后的原文：
 * 追求速度，译文交给 Manggo 的内置翻译服务并排显示。
 */
export function translate(text, from, to, options) {
  return cleanText(text, cfgOf(options));
}

export function hasText(selectedText) {
  return typeof selectedText === 'string' && selectedText.trim().length > 0;
}

/** 划词动作：清洗选中文字，原地替换（无替换能力时退回剪贴板）。 */
export function cleanSelection(selectedText, options) {
  const cleaned = cleanText(selectedText, cfgOf(options));
  const manggo = options && options.manggo;
  if (manggo && typeof manggo.replaceSelectedText === 'function') {
    manggo.replaceSelectedText(cleaned);
  } else if (manggo && typeof manggo.copyToClipboard === 'function') {
    manggo.copyToClipboard(cleaned);
  }
  return cleaned;
}

export default {
  translate,
  hasText,
  cleanSelection,
};
