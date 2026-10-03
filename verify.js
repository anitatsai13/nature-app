/* 通用驗證：node verify.js <index.html 路徑>
   同時支援兩種資料結構：
     BOOKS    = [{k,name,us:[…]}]                   （單科：冊 → 單元 → 重點）
     SUBJECTS = [{k,name,vols:[{name,us:[…]}]}]     （自然科：科目 → 冊 → 單元 → 重點） */
const fs = require('fs');
const FILE = process.argv[2];
if (!FILE) { console.log('用法：node verify.js <index.html 路徑>'); process.exit(2); }
const t = fs.readFileSync(FILE, 'utf8');
let bad = 0;
const ok = m => console.log('  ✓ ' + m);
const ng = m => { console.log('  ✗ ' + m); bad++; };
console.log('── ' + FILE.split('/').slice(-2).join('/') + ' ──');

/* 1. script 語法閘 */
const s = t.indexOf('<script>') + 8, e = t.lastIndexOf('</script>');
const code = t.slice(s, e);
try { new Function(code); ok('script 語法檢查通過（' + code.length + ' 字元）'); }
catch (err) { ng('script 語法錯誤：' + err.message); process.exit(1); }

/* 2. 亂碼
   西里爾字母一律是亂碼；希臘字母則要放行理化常用的符號（Δ 變化量、π、μ、Ω、θ、α、β、γ、λ、ρ…），
   只攔截其餘的希臘字母（那通常才是打錯或貼錯造成的）。 */
const SCI_GREEK = 'ΔπμΩθαβγλρΣφωεσν';
const cyr = t.match(/[Ѐ-ӿ]/g);
cyr ? ng('西里爾字母（亂碼）：' + [...new Set(cyr)].join('')) : ok('無西里爾亂碼');
const gk = (t.match(/[Ͱ-Ͽ]/g) || []).filter(c => SCI_GREEK.indexOf(c) < 0);
gk.length ? ng('非理化常用的希臘字母：' + [...new Set(gk)].join('')) : ok('希臘字母僅出現理化常用符號');
const simp = t.match(/[们这个说时华动过来线济应为压题图纪义质变还产种够离]/g);
simp ? ng('簡體字：' + [...new Set(simp)].join('')) : ok('無簡體字');

/* 3. 取出資料並正規化成 groups（＝每個分頁一組） */
const VAR = code.indexOf('const SUBJECTS=[') >= 0 ? 'SUBJECTS' : 'BOOKS';
const bs = code.indexOf('const ' + VAR + '=[');
const be = code.indexOf('\n];', bs);
if (bs < 0 || be < bs) { ng('定位 ' + VAR + ' 失敗'); process.exit(1); }
const cs = code.indexOf('/* ===== 各單元學習內容 ===== */');
const decl = (cs >= 0 && cs < bs) ? code.slice(cs, bs) : '';
let RAW;
try { RAW = eval('(function(){' + decl + code.slice(bs, be + 3) + 'return ' + VAR + ';})()'); }
catch (err) { ng(VAR + ' 解析失敗：' + err.message); process.exit(1); }
const groups = RAW.map(g => ({
  k: g.k, name: g.name,
  vols: g.vols || [{ name: g.name, us: g.us }],
  us: g.vols ? g.vols.reduce((a, v) => a.concat(v.us), []) : g.us
}));
ok('資料結構：' + VAR + '（' + groups.length + ' 個分頁）');

/* 4. 容器與必要元素 */
groups.forEach(g => { if (!t.includes('id="learn-' + g.k + '"')) ng('缺分頁容器 #learn-' + g.k); });
['sq', 'sgo', 'sx', 'sres', 'unitChips', 'startBtn', 'qlist', 'quizBox']
  .forEach(id => { if (!t.includes('id="' + id + '"')) ng('缺元素 #' + id); });
ok('分頁容器（' + groups.map(g => g.k).join('、') + '）與搜尋／測驗元素齊全');

/* 5. 逐組檢查 */
let nu = 0, np = 0, nun = 0, ndone = 0, ntab = 0;
function checkTables(html, where) {
  let n = 0;
  (html.match(/<table[\s\S]*?<\/table>/g) || []).forEach((tb, ti) => {
    n++;
    const carry = {}; let expect = null, r = 0;
    (tb.match(/<tr[\s\S]*?<\/tr>/g) || []).forEach(row => {
      r++;
      let cnt = 0;
      Object.keys(carry).forEach(k => { if (carry[k] > 0) { cnt++; carry[k]--; } });
      (row.match(/<t[hd][^>]*>/g) || []).forEach((c, ci) => {
        const cspan = +((c.match(/colspan="(\d+)"/) || [])[1] || 1);
        const rspan = +((c.match(/rowspan="(\d+)"/) || [])[1] || 1);
        cnt += cspan;
        if (rspan > 1) for (let k = 0; k < cspan; k++) carry['r' + r + '_' + ci + '_' + k] = rspan - 1;
      });
      if (expect === null) expect = cnt;
      else if (cnt !== expect) ng(where + ' 第 ' + ti + ' 個表格第 ' + r + ' 列欄數 ' + cnt + '，應為 ' + expect);
    });
  });
  return n;
}
groups.forEach(g => {
  const unums = [], pages = [];
  g.us.forEach(u => {
    nu++;
    if (typeof u.n === 'number') unums.push(u.n);
    if (u.ov !== undefined && typeof u.ov !== 'number') ng(g.name + '／' + u.t + '：ov 非數字');
    u.ps.forEach(p => {
      np++;
      if (p.un) nun++;
      if (p.c) { ndone++; ntab += checkTables(p.c, g.name + '／' + u.t + ' 重點' + p.n); }
      if (typeof p.p !== 'number') ng(g.name + '／' + u.t + ' 重點' + p.n + '：頁碼非數字');
      if (p.hot !== undefined && !(p.hot >= 1 && p.hot <= 5)) ng(g.name + '／' + u.t + ' 重點' + p.n + '：重要度超出 1~5');
      if (!('c' in p)) ng(g.name + '／' + u.t + ' 重點' + p.n + '：缺 c 欄位');
      pages.push({ u: u.t, n: p.n, p: p.p });
    });
    const ns = u.ps.map(p => p.n);
    if (JSON.stringify(ns) !== JSON.stringify(ns.map((_, i) => i + 1)))
      ng(g.name + '／' + u.t + '：重點編號不連續 → ' + ns.join(','));
    if (u.ov !== undefined && u.ov > u.ps[0].p) ng(g.name + '／' + u.t + '：綜覽圖頁碼晚於重點1');
  });
  let prev = 0; const bads = [];
  pages.forEach(x => { if (x.p < prev) bads.push(x.u + ' 重點' + x.n + '（p.' + x.p + '）'); prev = x.p; });
  if (bads.length) ng(g.name + '：頁碼未遞增 → ' + bads.join('、'));
  const want = Array.from({ length: unums.length }, (_, i) => i + unums[0]);
  if (JSON.stringify(unums) !== JSON.stringify(want)) ng(g.name + '：單元編號異常 → ' + unums.join(','));
  const q = { all: g.us.reduce((n, u) => n + u.ps.length, 0), done: g.us.reduce((n, u) => n + u.ps.filter(p => p.c).length, 0) };
  ok(g.name + '：' + g.vols.length + ' 冊、' + g.us.length + ' 單元（編號 ' + unums[0] + '～' + unums[unums.length - 1] +
     '）、' + q.all + ' 重點，已收錄 ' + q.done + '，頁碼 p.' + pages[0].p + ' → p.' + prev);
});
ok('合計：單元 ' + nu + '、重點 ' + np + '，已收錄內容 ' + ndone + '，待確認 ' + nun + ' 筆');
ok('學習內容共 ' + ntab + ' 個表格，欄數皆一致（已計入 colspan／rowspan）');

/* 6. 題庫 */
let total = 0; const bySec = {};
(code.match(/const Q_[A-Z0-9_]+=\[/g) || []).forEach(d => {
  const name = d.slice(6, -2);
  const i = code.indexOf(d);
  const j = code.indexOf('\n];', i);
  let arr;
  try { arr = eval(code.slice(i + d.length - 1, j + 2)); }
  catch (err) { ng(name + ' 解析失敗：' + err.message); return; }
  arr.forEach((q, k) => {
    const at = name + ' 第 ' + (k + 1) + ' 題';
    if (!q.q) ng(at + ' 缺題幹');
    if (!Array.isArray(q.opts) || q.opts.length !== 4) ng(at + ' 選項不是 4 個');
    if (!(q.ans >= 0 && q.ans <= 3)) ng(at + ' ans 超出 0~3：' + q.ans);
    if (!q.sec) ng(at + ' 缺分類 sec');
    if (q.diff && !['易', '中', '難'].includes(q.diff)) ng(at + ' 難度異常：' + q.diff);
    if (!q.exp) ng(at + ' 缺詳解');
    const blob = [q.q, (q.opts || []).join(' '), q.exp || ''].join(' ');
    (blob.match(/<[^>]+>/g) || []).forEach(g => {
      if (!/^<(br|b|[/]b|i class="hl"|[/]i)>$/.test(g))
        ng(at + ' 含不支援的標籤 ' + g + '（rep() 只放行 <br> <b> <i class="hl">）');
    });
    (blob.match(/⟬[^⟭]*⟭/g) || []).forEach(m => {
      if (m.split('|').length !== 2) ng(at + ' 分數標記格式錯誤（應為 ⟬分子|分母⟭）：' + m);
    });
    const op = (blob.match(/⟬/g) || []).length, cl = (blob.match(/⟭/g) || []).length;
    if (op !== cl) ng(at + ' 分數標記沒有成對：⟬ ' + op + ' 個、⟭ ' + cl + ' 個');
    bySec[q.sec] = (bySec[q.sec] || 0) + 1;
  });
  total += arr.length;
});
ok('題庫共 ' + total + ' 題，格式與答案索引皆正確');
if (total) console.log('    分類：' + Object.entries(bySec).map(([k, v]) => k + ' ' + v).join('、'));

console.log('  檔案 ' + (t.length / 1024).toFixed(1) + ' KB　' + (bad ? '❌ ' + bad + ' 項未通過' : '✅ 全部通過') + '\n');
process.exit(bad ? 1 : 0);
