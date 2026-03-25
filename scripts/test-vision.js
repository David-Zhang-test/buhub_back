const https = require('https');
const fs = require('fs');
const path = require('path');

const OPENROUTER_KEY = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('OPENROUTER_API_KEY='))
  ?.replace('OPENROUTER_API_KEY=', '').replace(/\r/g, '');

const content = fs.readFileSync(path.join(__dirname, '../src/lib/minimax.ts'), 'utf8');
const promptMatch = content.match(/text: `([\s\S]*?)`/);
const PROMPT = promptMatch[1];
const modelMatch = content.match(/VISION_MODEL = "(.+?)"/);
const MODEL = modelMatch[1];

console.log('Model:', MODEL);
console.log('Prompt length:', PROMPT.length, 'chars\n');

function timeToMin(t) { const m = t.match(/(\d+):(\d+)/); return m ? Number(m[1])*60+Number(m[2]) : -1; }

const images = [
  { path: path.resolve(__dirname, '../../buhub_back/public/uploads/a13df9fc-110c-420e-a915-198fbb01e228/1774283473621-29b8d1adip9.jpg'), mime: 'image/jpeg', label: '图1-网格半点刻度' },
  { path: path.resolve(__dirname, '../../5c545ae9faf9c46e71b8692f50376f12.jpg'), mime: 'image/jpeg', label: '图2-手机APP截图' },
  { path: path.resolve(__dirname, '../../ff52ea4d633dafbe2b088503e41e06a9.jpg'), mime: 'image/jpeg', label: '图3-BUniPort密集' },
  { path: path.resolve(__dirname, '../../4.png'), mime: 'image/png', label: '图4-PNG清晰版' },
];

async function testImage(img) {
  const start = Date.now();
  const base64 = fs.readFileSync(img.path).toString('base64');

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: MODEL,
      messages: [{role: 'user', content: [
        {type: 'image_url', image_url: {url: `data:${img.mime};base64,${base64}`}},
        {type: 'text', text: PROMPT}
      ]}],
      max_tokens: 2048, temperature: 0
    });

    const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Length': Buffer.byteLength(body)},
      timeout: 120000
    }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`=== ${img.label} (${elapsed}s) ===`);
        try {
          const d = JSON.parse(data);
          if (d.error) { console.log('ERROR:', d.error.message?.slice(0, 150)); resolve(); return; }
          const c = d.choices[0].message.content;
          
          // Extract JSON
          let arr;
          const objM = c.match(/"courses"\s*:\s*(\[[\s\S]*?\])/);
          if (objM) try { arr = JSON.parse(objM[1]); } catch {}
          if (!arr) { const m = c.match(/\[[\s\S]*\]/); if (m) try { arr = JSON.parse(m[0]); } catch {} }
          if (!arr) { console.log('NO JSON:', c.slice(0, 200)); resolve(); return; }

          // Location merge
          const m1 = new Map();
          for (const x of arr) {
            const k = x.name+'|'+x.dayOfWeek+'|'+x.startTime+'|'+x.endTime;
            if (m1.has(k)) {
              const e = m1.get(k);
              if (x.location && !e.location.includes(x.location)) e.location = e.location ? e.location+', '+x.location : x.location;
            } else m1.set(k, {...x});
          }

          // Consecutive merge
          const groups = new Map();
          for (const x of m1.values()) {
            const k = x.name+'|'+x.dayOfWeek;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(x);
          }
          const result = [];
          for (const [,g] of groups) {
            g.sort((a,b) => a.startTime.localeCompare(b.startTime));
            let cur = {...g[0]};
            for (let i = 1; i < g.length; i++) {
              const n = g[i];
              if (Math.abs(timeToMin(n.startTime) - timeToMin(cur.endTime)) <= 5) {
                cur.endTime = n.endTime;
                const ls = new Set((cur.location||'').split(', ').filter(Boolean));
                (n.location||'').split(', ').filter(Boolean).forEach(l => ls.add(l));
                cur.location = Array.from(ls).join(', ');
              } else { result.push(cur); cur = {...n}; }
            }
            result.push(cur);
          }

          result.sort((a,b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
          const days = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
          result.forEach(x => {
            const dur = ((timeToMin(x.endTime) - timeToMin(x.startTime)) / 60).toFixed(1);
            console.log(`  ${days[x.dayOfWeek].padEnd(4)} ${x.startTime}-${x.endTime} (${dur}h) ${x.name.padEnd(12)} ${(x.location || '-').slice(0, 40)}`);
          });
          console.log(`  Total: ${result.length} courses (raw: ${arr.length})`);
        } catch(e) { console.log('ERROR:', e.message?.slice(0, 100)); }
        console.log();
        resolve();
      });
    });
    req.on('error', e => { console.log('NET ERROR:', e.message); resolve(); });
    req.write(body); req.end();
  });
}

(async () => {
  for (const img of images) await testImage(img);
})();
