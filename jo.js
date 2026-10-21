/* 점오하게 공용 스크립트: 랜덤 닉네임 · 플레이 기록 · 오늘의 랭킹 (Supabase)
   모든 게임이 ../jo.js 로 불러 씁니다. 이 파일이 없거나 인터넷이 안 돼도 게임은 그대로 돌아가요. */
(function(){
  const SUPA_URL = 'https://ycmqkihjjsltjnzyqdkr.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljbXFraWhqanNsdGpuenlxZGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDc0ODgsImV4cCI6MjEwODEyMzQ4OH0.KO3gb7BSa-kd6TwCAn9OWd2vEKqDzhDCVOeQT_WhM9E';
  const H = {apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json'};

  // ---------- nickname pieces
  const ADJ = ['배고픈','졸린','야근하는','칼퇴하는','월요병 걸린','커피 마신','용감한','소심한','수줍은','신난',
    '꾸벅꾸벅','뚱땅뚱땅','점심 먹은','지각한','바쁜','느긋한','씩씩한','엉뚱한','배부른','출근한',
    '퇴근하는','깜짝 놀란','콧노래 부르는','낮잠 자는','행복한','투덜대는','반짝이는','수상한','날쌘','느릿느릿',
    '웃음 많은','눈물 많은','꼼꼼한','덜렁대는','춤추는','노래하는','심심한','부지런한','겁 많은','당당한'];
  const NOUN = [
    ...['계란','주먹밥','만두','새우튀김','어묵','치킨','버거','피자','라면','도시락','김밥','떡볶이','단무지','계란말이','소시지'].map(n => [n, '🍱']),
    ...['도깨비','해태','불가사리','구미호','이무기','삼족오'].map(n => [n, '🐉']),
    ...['달걀귀신','물귀신','몽달귀신','저승사자','어둑시니','두억시니','그슨대','장산범'].map(n => [n, '👻'])
  ];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function makeNick(){ const [n, e] = pick(NOUN); return {nick: `${pick(ADJ)} ${n}`, icon: e}; }
  const iconOf = nick => { const last = String(nick || '').split(' ').pop(); const hit = NOUN.find(([n]) => n === last); return hit ? hit[1] : '🙂'; };

  const ls = {
    get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  };
  function player(){
    let p = ls.get('jo:player');
    if (!p || !p.pid || !p.nick){
      const r = makeNick();
      p = {pid: 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36), nick: r.nick};
      ls.set('jo:player', p);
    }
    return p;
  }
  function reroll(){ const p = player(); p.nick = makeNick().nick; ls.set('jo:player', p); fire(); return p; }
  const subs = [];
  function fire(){ subs.forEach(f => { try { f(player()); } catch(e){} }); }

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  // ---------- record a play (fire-and-forget)
  function log(game, event, data){
    const p = player(), d = data || {};
    const row = {pid: p.pid, nick: p.nick, game, day: d.day || today(), event,
                 stage: d.stage ?? null, score: d.score ?? null, ms: d.ms != null ? Math.round(d.ms) : null, hints: d.hints ?? null};
    try {
      return fetch(SUPA_URL + '/rest/v1/plays', {method:'POST', headers:{...H, Prefer:'return=minimal'}, body: JSON.stringify(row), keepalive: true})
        .then(r => r.ok).catch(() => false);
    } catch(e){ return Promise.resolve(false); }
  }

  // ---------- ranking rules per game
  const fmtKo = ms => { const s = Math.floor(ms/1000), m = Math.floor(s/60); return m ? `${m}분 ${s%60}초` : `${s%60}초`; };
  const RULE = {
    tower:  {name:'오늘의 탑',     icon:'🏗️', kind:'score', show: r => `${r.score}층`},
    lunch:  {name:'도시락 합치기', icon:'🍱', kind:'score', show: r => `${(r.score||0).toLocaleString()}점`},
    run:    {name:'야근 런',       icon:'🏃', kind:'score', show: r => `${(r.score||0).toLocaleString()}m`},
    escape: {name:'오늘의 방탈출', icon:'🚪', kind:'stage', show: r => `${r.stage}단계${r.ms ? ' · ' + fmtKo(r.ms) : ''}`},
    night:  {name:'밤의 학교',     icon:'🔦', kind:'stage', show: r => `${r.stage}단계${r.ms ? ' · ' + fmtKo(r.ms) : ''}`},
    hall:   {name:'유령의 복도',   icon:'👻', kind:'stage', show: r => r.stage >= 5 && r.ms ? `🏆 탈출 · ${fmtKo(r.ms)}` : r.stage ? `${r.stage}단계 통과` : '1단계 도전'}
  };
  const GAMES = ['tower','lunch','escape','hall','run','night'];
  function better(game, a, b){ // is a better than b?
    if (!b) return true;
    if (RULE[game].kind === 'score') return (a.score||0) > (b.score||0);
    if ((a.stage||0) !== (b.stage||0)) return (a.stage||0) > (b.stage||0);
    return (a.ms ?? 9e15) < (b.ms ?? 9e15);
  }
  async function board(game, day){
    const q = `select=pid,nick,score,ms,stage,event,created_at&game=eq.${game}&day=eq.${day || today()}&event=in.(end,clear)&order=created_at.asc&limit=5000`;
    const r = await fetch(SUPA_URL + '/rest/v1/plays?' + q, {headers: H});
    if (!r.ok) throw new Error('board ' + r.status);
    const rows = await r.json(), best = {}, nick = {};
    for (const x of rows){ nick[x.pid] = x.nick; if (better(game, x, best[x.pid])) best[x.pid] = x; }
    const list = Object.values(best).map(x => ({...x, nick: nick[x.pid]}));
    list.sort((a, b) => better(game, a, b) ? -1 : better(game, b, a) ? 1 : 0);
    return list;
  }

  // ---------- small UI pieces
  const css = `
  .card{max-height:calc(100dvh - 24px);overflow-y:auto}
  .panel #joRank{width:100%;max-width:320px}
  .panel{overflow-y:auto}
  .joMini{border:1px solid rgba(127,127,127,.35);border-radius:14px;padding:10px 12px;text-align:left;font-size:13px;line-height:1.5}
  .joMini h4{margin:0 0 6px;font-size:13px;font-weight:800;display:flex;justify-content:space-between;gap:8px}
  .joMini h4 a{font-weight:700;opacity:.75;color:inherit;text-decoration:none;white-space:nowrap}
  .joMini ol{margin:0;padding:0;list-style:none;display:grid;gap:2px}
  .joMini li{display:grid;grid-template-columns:26px 1fr auto;gap:6px;align-items:center}
  .joMini li b{font-variant-numeric:tabular-nums;white-space:nowrap}
  .joMini li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .joMini li.me{font-weight:800;background:rgba(242,169,59,.18);border-radius:8px;margin:0 -6px;padding:0 6px}
  .joMini .joMe{margin-top:6px;opacity:.85}
  .joNick{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;border:1px solid rgba(127,127,127,.35);border-radius:999px;padding:4px 6px 4px 11px;white-space:nowrap;max-width:100%}
  .joNick span{overflow:hidden;text-overflow:ellipsis}
  .joNick button{border:0;border-radius:999px;padding:3px 9px;font:inherit;font-size:12px;cursor:pointer;background:rgba(127,127,127,.18);color:inherit}`;
  function addCss(){ if (document.getElementById('joCss')) return; const s = document.createElement('style'); s.id = 'joCss'; s.textContent = css; document.head.appendChild(s); }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const medal = i => ['🥇','🥈','🥉'][i] || `${i+1}`;
  const base = (() => { try { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/jo\.js.*$/, '') : '../'; } catch(e){ return '../'; } })();

  function nickChip(el){
    if (!el) return; addCss();
    const draw = () => { const p = player(); el.innerHTML = `<span class="joNick" title="랭킹에 쓰이는 이름"><span>${iconOf(p.nick)} ${esc(p.nick)}</span><button type="button" aria-label="이름 다시 뽑기">🎲 다시 뽑기</button></span>`;
      el.querySelector('button').onclick = e => { e.preventDefault(); e.stopPropagation(); reroll(); }; };
    subs.push(draw); draw();
  }
  // after a game: post the record, then show today's top 5 and my place
  async function mini(game, el, data, event){
    if (!el) return; addCss();
    const p = player();
    el.innerHTML = `<div class="joMini"><h4><span>🏆 오늘의 랭킹</span><a href="${base}rank/#${game}" target="_top">전체 보기 ›</a></h4><div>기록 올리는 중…</div><div class="joMe">${iconOf(p.nick)} ${esc(p.nick)}(으)로 기록돼요</div></div>`;
    if (data) await log(game, event || 'end', data);
    try {
      const list = await board(game, data && data.day), me = list.findIndex(x => x.pid === p.pid);
      const top = list.slice(0, 5).map((x, i) => `<li class="${x.pid === p.pid ? 'me' : ''}"><b>${medal(i)}</b><span>${iconOf(x.nick)} ${esc(x.nick)}</span><b>${RULE[game].show(x)}</b></li>`).join('');
      el.querySelector('.joMini').innerHTML = `<h4><span>🏆 오늘의 랭킹 · ${list.length}명 참여</span><a href="${base}rank/#${game}" target="_top">전체 보기 ›</a></h4>
        <ol>${top || '<li><b></b><span>아직 기록이 없어요</span><b></b></li>'}</ol>
        <div class="joMe">${me >= 0 ? `나는 <b>${me+1}위</b> · ${iconOf(p.nick)} ${esc(p.nick)}` : `${iconOf(p.nick)} ${esc(p.nick)}`}</div>`;
    } catch(e){
      el.querySelector('.joMini').innerHTML = `<h4><span>🏆 오늘의 랭킹</span></h4><div>지금은 랭킹을 불러올 수 없어요 (인터넷 연결 확인)</div>`;
    }
  }

  window.JO = {player, reroll, log, board, mini, nickChip, onNick: f => subs.push(f), RULE, GAMES, iconOf, today, fmtKo,
               _cfg: {url: SUPA_URL, key: SUPA_KEY}};
})();
