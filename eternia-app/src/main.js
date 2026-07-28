(function(){
  var $=function(id){return document.getElementById(id);};
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var log=$('log'), cont=$('cont'), newpill=$('newpill'), toastEl=$('toast'), impactOv=$('impactOv');

  function initState(){ return {
    stats:{str:4,dex:6,int:7,cha:6,con:5,wis:6}, // 린 (아이언가드 수사관)
    hp:4, hpMax:4, stigma:10, stigMax:100,
    inv:['수사관 배지','리볼버'], flags:{}, vars:{},
  };}
  var S=initState();
  var STAT_KO={str:'힘',dex:'민첩',int:'지능',cha:'카리스마',con:'건강',wis:'지혜'};
  var STAT_IC={str:'⚔️',dex:'🪶',int:'🔮',cha:'🎭',con:'❤️',wis:'📘'};
  var STAT_ORDER=['str','dex','int','cha','con','wis'];

  // ── 씬 그래프(에테르니아의 추락 · 린 · 검은 연기의 항만) ──
  var NODES={
    start:{type:'text', page:41, title:'검은 연기의 항만', scene:'harbor', toast:'새로운 기록을 얻었습니다.', paras:[
      "*[[검은 연기의 항만]]의 밤. 에테르 가솔린 냄새가 안개에 절어 있다.*",
      "부두의 각등이 껌뻑인다. 밀수선 한 척이 방금 짐을 내렸고, 갑판엔 인기척이 없다." ], next:'fig1'},
    fig1:{type:'figure', desc:'검은 연기의 항만, 밀수선', scene:'harbor', next:'approach'},
    approach:{type:'choice', prompt:'어디로 잠입할까?', options:[
      {label:"정문 초소로 곧장", tag:"[담대]", kind:'plain', set:{vars:{route:"정문 초소"}}, goto:'scene2'},
      {label:"뒷골목 하수로로", tag:"[은밀]", kind:'plain', set:{vars:{route:"뒷골목 하수로"}}, goto:'scene2'},
    ]},
    scene2:{type:'text', page:42, scene:'harbor', paras:[
      "*너는 {{route}}(으)로 스며든다.*",
      "봉인이 뜯긴 [[컨테이너]] 하나가 홀로 놓여 있다. 안을 확인한다 —" ], next:'crate'},
    crate:{type:'choice', inScene:true, prompt:'상자 안에는 —', options:[
      {label:"에테르 가솔린 드럼통", kind:'plain', set:{vars:{contraband:"에테르 가솔린"}, inv:"가솔린 증거", flag:{hasForbidden:false}}, goto:'scene3'},
      {label:"봉인된 [[금서]]", kind:'plain', set:{vars:{contraband:"금서"}, inv:"금서", flag:{hasForbidden:true}}, goto:'scene3'},
    ]},
    scene3:{type:'text', page:43, scene:'harbor', toast:'증거를 확보했습니다.', paras:[
      "*상자엔 {{contraband}}이(가) 가득했다.*",
      "그때, 그림자 속에서 낮은 목소리가 너를 부른다." ], next:'comp'},
    comp:{type:'choice', prompt:'목소리의 주인은 —', options:[
      {label:"부두 노인 [[가레스]]", kind:'plain', set:{vars:{informant:"가레스"}}, goto:'recap'},
      {label:"밀수꾼 [[녜사]]", kind:'plain', set:{vars:{informant:"녜사"}}, goto:'recap'},
    ]},
    recap:{type:'text', page:44, scene:'harbor', speaker:'린', dir:'(수첩을 덮으며)', paras:[
      "\"{{route}}로 들어와 {{contraband}} 상자를 열었지. {{informant}}, 네 정보가 옳았어.\"" ], next:'sentryFig'},
    sentryFig:{type:'figure', desc:'초병의 각등이 부두를 훑는다', scene:'danger', impact:true, next:'sentryText'},
    sentryText:{type:'text', page:45, scene:'danger', paras:[
      "*각등 불빛이 이쪽으로 미끄러진다. 발각까지 몇 초.*" ], next:'sentry'},
    sentry:{type:'choice', prompt:'불빛이 다가온다.', options:[
      {label:"드럼통 뒤로 굴러 피한다", kind:'prob', prob:{stat:'dex', diff:14},
        onSuccess:{set:{vars:{method:"드럼통 뒤로 굴러"}, flag:{caught:false}}, goto:'escape'},
        onFail:{set:{hp:-1, stigma:12, flag:{caught:true}}, goto:'caught'} },
      {label:"금서의 문장을 읊어 어둠을 부린다", tag:"[조건 · 금서 소지]", kind:'cond', require:'hasForbidden', reqDesc:'금서 필요',
        set:{vars:{method:"금서의 문장으로 어둠을 부려"}, stigma:20, flag:{caught:false, forbiddenUsed:true}}, goto:'escape'},
      {label:"리볼버를 겨눈다", tag:"[담대]", kind:'plain', set:{vars:{method:"리볼버를 겨눴지만"}, flag:{caught:true}}, goto:'caught'},
    ]},
    escape:{type:'text', page:46, scene:'escape', toast:'위기를 벗어났다.', paras:[
      "*{{method}} 초병의 각등을 벗어났다.*",
      "젖은 골목 끝, {{informant}}이(가) 먼저 빠져나가 손짓한다." ], next:'END_WIN'},
    caught:{type:'text', page:46, scene:'danger', toast:'발각되었다.', paras:[
      "*늦었다. 각등 불빛이 너를 정통으로 붙든다.*",
      "호루라기 소리. {{informant}}은(는) 이미 어둠 속으로 사라졌다." ], next:'END_LOSE'},
  };

  var SCENES={
    harbor:'linear-gradient(#3a5560 0%, #24414c 45%, #16282e 100%)',
    danger:'linear-gradient(#6a3a30 0%, #4a2622 50%, #2c1614 100%)',
    escape:'linear-gradient(#2f5548 0%, #1f3d34 55%, #142822 100%)',
  };
  var MOTIF={
    harbor:'radial-gradient(40% 55% at 28% 72%, #14404a99, transparent 70%), radial-gradient(30% 40% at 74% 60%, #b5872f55, transparent 70%), linear-gradient(180deg,#8aa9b022 0%, transparent 42%, #0e2026cc 100%)',
    danger:'radial-gradient(36% 46% at 55% 55%, #d5544c66, transparent 70%), radial-gradient(60% 30% at 50% 30%, #e6b24a44, transparent 70%)',
    escape:'radial-gradient(46% 56% at 60% 72%, #14403099, transparent 70%)',
  };

  // ── 마크업 토크나이저 ──
  function tokenize(raw){
    var t=raw, runs=[], i=0, plain='';
    function flush(){ if(plain){ runs.push({text:plain,cls:''}); plain=''; } }
    while(i<t.length){
      var rest=t.slice(i), m;
      if((m=/^\{\{(\w+)\}\}/.exec(rest))){ flush(); runs.push({text:(S.vars[m[1]]!=null?String(S.vars[m[1]]):'…'),cls:'dyn'}); i+=m[0].length; continue; }
      if((m=/^\*\*([^*]+)\*\*/.exec(rest))){ flush(); runs.push({text:m[1],cls:'bold'}); i+=m[0].length; continue; }
      if((m=/^\[\[([^\]]+)\]\]/.exec(rest))){ flush(); runs.push({text:m[1],cls:'teal'}); i+=m[0].length; continue; }
      if((m=/^\*([^*]+)\*/.exec(rest))){ flush(); runs.push({text:m[1],cls:'dir'}); i+=m[0].length; continue; }
      if((m=/^"([^"]*)"/.exec(rest))){ flush(); runs.push({text:'"'+m[1]+'"',cls:'amber'}); i+=m[0].length; continue; }
      plain+=t[i]; i++;
    }
    flush(); return runs;
  }
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function runsToChars(runs){ var a=[]; runs.forEach(function(r){ for(var k=0;k<r.text.length;k++) a.push({ch:r.text[k],cls:r.cls}); }); return a; }
  function renderChars(chars,n){ var html='',cur=null,buf='';
    function seg(){ if(buf){ html+= cur? '<span class="'+cur+'">'+esc(buf)+'</span>':esc(buf); buf=''; } }
    for(var k=0;k<n;k++){ var c=chars[k]; if(c.cls!==cur){ seg(); cur=c.cls; } buf+=c.ch; } seg(); return html; }

  // ── 스크롤/백로그/토스트 ──
  function nearBottom(){ return log.scrollHeight - log.scrollTop - log.clientHeight < 40; }
  var stick=true;
  log.addEventListener('scroll', function(){ stick=nearBottom(); if(stick) newpill.classList.remove('show'); });
  function toBottom(force){ if(force||stick){ log.scrollTop=log.scrollHeight; newpill.classList.remove('show'); } else { newpill.classList.add('show'); } }
  newpill.addEventListener('click', function(){ stick=true; log.scrollTop=log.scrollHeight; newpill.classList.remove('show'); });
  var toastT=null;
  function toast(msg){ if(!msg) return; toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.classList.remove('show'); }, 1800); }
  function addBlk(cls){ var d=document.createElement('div'); d.className='blk '+(cls||''); log.appendChild(d); return d; }

  // ── 호흡 ──
  var pace=false, fast=false, typing=false, timer=null, autoTimer=null;
  var cur={id:null, pi:0}, awaiting=false, node=null;
  function clearT(){ clearTimeout(timer); clearTimeout(autoTimer); }
  function charDelay(ch){ if(fast){ if('.!?…'.indexOf(ch)>=0)return 150; if(',;—:'.indexOf(ch)>=0)return 80; return 6; }
    if('.!?…'.indexOf(ch)>=0)return 380; if(',;—:'.indexOf(ch)>=0)return 190; if(ch===' ')return 28; return 21; }
  function typeInto(el, raw, after){
    var chars=runsToChars(tokenize(raw)); typing=true; cont.classList.add('hidden');
    if(reduce){ el.innerHTML=renderChars(chars,chars.length); typing=false; after&&after(); toBottom(); return; }
    var ci=0;
    typeInto._complete=function(){ clearTimeout(timer); ci=chars.length; el.innerHTML=renderChars(chars,ci); typing=false; after&&after(); };
    (function step(){
      if(ci>=chars.length){ typing=false; el.innerHTML=renderChars(chars,chars.length); after&&after(); return; }
      ci++; el.innerHTML=renderChars(chars,ci)+'<span class="caret">▌</span>';
      if(ci%3===0) toBottom();
      timer=setTimeout(step, charDelay(chars[ci-1].ch));
    })();
  }

  // ── 진입/진행 ──
  function goTo(id){
    if(id==='END_WIN'){ return ending('win'); }
    if(id==='END_LOSE'){ return ending('lose'); }
    node=NODES[id]; cur={id:id, pi:0}; awaiting=false;
    if(!node) return;
    if(node.type==='text'){ if(node.title||node.page!=null){ emitHead(node); } if(node.toast) toast(node.toast); emitPara(); }
    else if(node.type==='figure'){ emitFigure(node); }
    else if(node.type==='choice'){ emitChoice(node); }
  }
  function emitHead(n){ var b=addBlk(); b.innerHTML='<div class="flourish">❧ ⟡ ❧</div>'+(n.title?'<div class="stitle">⟨ '+esc(n.title)+' ⟩</div>':''); toBottom(); }
  function emitPara(){
    var b=addBlk('p-blk');
    if(cur.pi===0 && node.speaker){ var s=document.createElement('div'); s.className='speaker'; s.innerHTML=esc(node.speaker)+(node.dir?'<span class="sdir">'+esc(node.dir)+'</span>':''); b.appendChild(s); }
    var p=document.createElement('div'); p.className='p'; b.appendChild(p);
    toBottom();
    typeInto(p, node.paras[cur.pi], function(){ cont.classList.remove('hidden'); if(pace){ autoTimer=setTimeout(advance, fast?400:800); } });
  }
  function emitPage(n){ if(n.page==null) return; var b=addBlk(); b.innerHTML='<div class="pageno mono">'+n.page+'</div>'; toBottom(); }
  function buildFig(n, full){
    var f=document.createElement('div'); f.className='fig'+(full?' full':'');
    f.style.setProperty('--sceneBg', SCENES[n.scene]||SCENES.harbor);
    var motif=document.createElement('div'); motif.className='motif'; motif.style.background=MOTIF[n.scene]||MOTIF.harbor; f.appendChild(motif);
    var cap=document.createElement('div'); cap.className='cap'; cap.textContent=(n.impact?'◍ 삽화(임팩트) · ':'◍ 삽화 · ')+n.desc; f.appendChild(cap);
    return f;
  }
  var impactActive=null;
  function emitFigure(n){
    if(n.impact){ // 본문 영역 풀 오버레이(상태바·하단 바 제외)
      impactOv.innerHTML=''; impactOv.appendChild(buildFig(n,true)); impactOv.classList.add('show');
      impactActive=n; awaiting=true; cont.classList.remove('hidden');
      if(pace){ autoTimer=setTimeout(advance, fast?1100:1900); }
      return;
    }
    var b=addBlk(); b.appendChild(buildFig(n,false)); awaiting=true; cont.classList.remove('hidden'); toBottom();
    if(pace){ autoTimer=setTimeout(advance, fast?520:920); }
  }
  function advance(){
    clearT();
    if(typing){ typeInto._complete&&typeInto._complete(); return; }
    if(awaiting){ awaiting=false;
      if(impactActive){ var n0=impactActive; impactActive=null; impactOv.classList.remove('show'); impactOv.innerHTML=''; var b=addBlk(); b.appendChild(buildFig(n0,false)); toBottom(true); }
      return goTo(node.next);
    }
    if(node && node.type==='text'){
      if(cur.pi < node.paras.length-1){ cur.pi++; emitPara(); return; }
      emitPage(node); cont.classList.add('hidden'); return goTo(node.next);
    }
  }
  log.addEventListener('click', function(){ if(typing) advance(); else if(awaiting || (node&&node.type==='text')) advance(); });
  impactOv.addEventListener('click', function(){ if(awaiting) advance(); });

  // ── 선택 ──
  function chance(stat,diff){ var succ=(20-(diff-S.stats[stat])+1)/20*100; return Math.max(5,Math.min(95,Math.round(succ))); }
  function stripMarks(s){ return s.replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1'); }
  function emitChoice(n){
    var b=addBlk(); var wrap=document.createElement('div'); wrap.className='choices';
    if(n.prompt){ var pr=document.createElement('div'); pr.className='cprompt'; pr.textContent=n.prompt; wrap.appendChild(pr); }
    n.options.forEach(function(opt){
      var btn=document.createElement('button'); btn.type='button'; btn.className='choice '+(opt.kind||'plain');
      var locked=false, tag=opt.tag||'';
      if(opt.kind==='cond') locked=!S.flags[opt.require];
      if(opt.kind==='prob') tag='['+STAT_KO[opt.prob.stat]+' '+chance(opt.prob.stat,opt.prob.diff)+'%]';
      var right = locked ? '<span class="ctag">🔒 '+esc(opt.reqDesc||'조건 미충족')+'</span>' : (tag?'<span class="ctag">'+esc(tag)+'</span>':'');
      btn.innerHTML='<span class="bul">✤</span><span class="lbl">'+esc(stripMarks(opt.label))+'</span>'+right;
      if(locked){ btn.classList.add('locked'); btn.disabled=true; }
      else btn.addEventListener('click', function(){ chooseOpt(b, opt); });
      wrap.appendChild(btn);
    });
    b.appendChild(wrap); cont.classList.add('hidden'); toBottom(true);
  }
  function chooseOpt(blk, opt){
    blk.innerHTML=''; var rec=document.createElement('div'); rec.className='picked'; rec.innerHTML='<span class="bul">✤</span> <b>'+esc(stripMarks(opt.label))+'</b>'; blk.appendChild(rec);
    if(opt.kind==='prob'){
      var ch=chance(opt.prob.stat,opt.prob.diff); var roll=reduce?11:Math.floor(Math.random()*20)+1;
      var ok=reduce?(ch>=50):(roll + S.stats[opt.prob.stat] >= opt.prob.diff);
      emitRoll(ok, opt.prob, roll);
      var br=ok?opt.onSuccess:opt.onFail; applySet(br.set); setTimeout(function(){ goTo(br.goto); }, reduce?150:800);
      return;
    }
    applySet(opt.set); goTo(opt.goto);
  }
  function emitRoll(ok, prob, roll){
    var b=addBlk(); var c=document.createElement('div'); c.className='rollcard '+(ok?'ok':'fail');
    c.innerHTML='<div class="lab mono">'+STAT_KO[prob.stat]+' 판정</div>'+
      '<div class="dice mono">d20('+roll+') + '+STAT_KO[prob.stat]+'('+S.stats[prob.stat]+') vs 난이도 '+prob.diff+'</div>'+
      '<div class="res">'+(ok?'성공!':'실패…')+'</div>';
    b.appendChild(c); toBottom(true);
  }

  // ── 상태 ──
  function applySet(set){ if(!set) return;
    if(set.vars){ for(var k in set.vars) S.vars[k]=set.vars[k]; }
    if(set.flag){ for(var f in set.flag) S.flags[f]=set.flag[f]; }
    if(set.inv){ if(S.inv.indexOf(set.inv)<0) S.inv.push(set.inv); }
    if('hp'in set){ S.hp=Math.max(0,Math.min(S.hpMax,S.hp+set.hp)); renderHP(true); }
    if('stigma'in set){ S.stigma=Math.max(0,Math.min(S.stigMax,S.stigma+set.stigma)); renderStig(true); if(set.stigma>0) toast('침식도 +'+set.stigma); }
    if(set.stat){ for(var s in set.stat) S.stats[s]+=set.stat[s]; renderStats(true); }
  }
  function renderHP(flash){ var hp=$('hpPips'); hp.innerHTML=''; for(var i=0;i<S.hpMax;i++){ var d=document.createElement('span'); d.className='pip hp'+(i<S.hp?' on':''); hp.appendChild(d); } if(flash&&hp.animate) hp.animate([{filter:'brightness(2)'},{filter:'brightness(1)'}],{duration:600}); }
  function renderStig(flash){ $('stigBar').style.width=(S.stigma/S.stigMax*100)+'%'; $('stigVal').textContent=S.stigma; if(flash){ var e=$('stigVal'); if(e.animate) e.animate([{filter:'brightness(2)'},{filter:'brightness(1)'}],{duration:700}); } }
  function renderStats(flash){ var g=$('statgrid'); g.innerHTML=''; STAT_ORDER.forEach(function(k){ var d=document.createElement('div'); d.className='sstat'; d.innerHTML='<span class="ic">'+STAT_IC[k]+'</span>'+S.stats[k]; g.appendChild(d); }); if(flash && g.animate) g.animate([{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:600}); }

  // ── 엔딩 ──
  function ending(kind){
    clearT(); cont.classList.add('hidden');
    var b=addBlk(); var win=kind==='win'; var e=document.createElement('div'); e.className='ending'+(win?'':' lose');
    var cb=S.vars.contraband||'증거', comp=S.vars.informant||'정보원';
    var desc = win
      ? (S.flags.forbiddenUsed ? '금서의 문장 한 줄로 어둠을 부려 초병을 지나쳤다. 대가로 침식이 깊어졌다. '+cb+'의 행방은 네 수첩에만 남았다.'
         : cb+'을(를) 품은 채, 너는 항만의 밤을 빠져나왔다. '+comp+'이(가) 먼저 와 있었다.')
      : '수사관 배지가 밤바다로 떨어진다. '+cb+'의 단서는 그들 손에 넘어갔다.';
    var items=[];
    if(S.vars.route) items.push(['경로',S.vars.route]);
    if(S.vars.contraband) items.push(['밀수품',S.vars.contraband]);
    if(S.vars.informant) items.push(['정보원',S.vars.informant]);
    items.push(['체력',S.hp+'/'+S.hpMax]); items.push(['침식도',S.stigma]);
    if(S.flags.caught) items.push(['발각','예']);
    if(S.flags.hasForbidden) items.push(['금서','소지']);
    if(S.flags.forbiddenUsed) items.push(['금단주문','사용']);
    var carry=''; items.forEach(function(kv){ carry+='<span class="tag">'+esc(kv[0])+' · <b>'+esc(String(kv[1]))+'</b></span>'; });
    e.innerHTML='<div class="tt mono">CHAPTER · '+(win?'탈출':'발각')+'</div><div class="big">'+(win?'연기 속으로':'붙잡히다')+'</div>'+
      '<div class="desc">'+esc(desc)+'</div>'+
      '<div class="carry"><h5>다음 씬으로 이월되는 상태</h5><div class="kv">'+carry+'</div></div>'+
      '<button type="button" class="again" id="againBtn">↺ 다시 플레이</button>';
    b.appendChild(e); toast(win?'에필로그를 얻었습니다.':'수사는 여기서 멈췄다.'); toBottom(true);
    $('againBtn').addEventListener('click', restart);
  }

  // ── 컨트롤 ──
  $('gear').addEventListener('click', function(){ toast('설정 (목업)'); });
  $('bottombar').addEventListener('click', function(e){
    var b=e.target.closest('[data-bb]'); if(!b) return; var k=b.getAttribute('data-bb');
    if(k==='inv') toast(S.inv.length? '소지품 · '+S.inv.join(', ') : '소지품 · 비어 있음');
    else if(k==='codex') toast('도감(코덱스) — 준비 중');
    else if(k==='rank') toast('업적·랭크 — 준비 중');
    else if(k==='wip') toast('증거 — 작업중…');
  });
  $('autoBtn').addEventListener('click', function(){ pace=!pace; this.textContent=pace?'▶ 자동 켜짐':'▷ 자동'; if(pace&&!typing&&node&&node.type==='text'){ clearTimeout(autoTimer); autoTimer=setTimeout(advance,500);} });
  $('fastBtn').addEventListener('click', function(){ fast=!fast; this.textContent=fast?'»» 빠르게 켜짐':'» 빠르게'; });
  $('theme').addEventListener('click', function(){ var c=document.documentElement.getAttribute('data-theme'); var n=c==='dark'?'light':(c==='light'?'dark':(window.matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark')); document.documentElement.setAttribute('data-theme',n); });
  function restart(){ clearT(); S=initState(); log.innerHTML=''; impactOv.classList.remove('show'); impactOv.innerHTML=''; impactActive=null; newpill.classList.remove('show'); toastEl.classList.remove('show'); stick=true; renderHP(false); renderStig(false); renderStats(false); goTo('start'); }
  $('restart').addEventListener('click', restart);

  renderHP(false); renderStig(false); renderStats(false); goTo('start');
})();
