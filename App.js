import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────
const ls = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────
const DRILLS_SHOKYU = [
  "ワンハンドドリブル(右) low","ワンハンドドリブル(右) middle","ワンハンドドリブル(右) high",
  "ワンハンドドリブル(左) low","ワンハンドドリブル(左) middle","ワンハンドドリブル(左) high",
  "フロントチェンジ 小さく","フロントチェンジ 大きく",
  "V字ドリブル 横","V字ドリブル 縦","プッシュクロス 横","プッシュクロス 縦",
  "レッグスルー","ビハインド","8の字ドリブル",
];
const DRILLS_CHUKYU = [
  "ワンハンドドリブル","レッグスルー","クロスオーバー",
  "ビハインド","インアウトクロスオーバー","インアウトレッグスルー",
];
const DRILLS_JOKYU = [
  "ツーハンドドリブル low","ツーハンドドリブル middle","ツーハンドドリブル high",
  "ツーハンドドリブル(交互) low","ツーハンドドリブル(交互) middle","ツーハンドドリブル(交互) high",
  "high & low","V字ドリブル 横(大)","V字ドリブル 横(小)","V字ドリブル 縦(大)","V字ドリブル 縦(小)",
  "ワンドリ → レッグスルー","ワンドリ → レッグビハインド","ダブルクロスオーバー","クロス→ビハインド",
];
const TIME_SETTINGS = {
  "3分": { drill:15, rest:5 },
  "5分": { drill:20, rest:5 },
  "10分": { drill:30, rest:10 },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function buildMenu(drillNames, time) {
  const { drill, rest } = TIME_SETTINGS[time];
  const count = Math.floor((parseInt(time)*60)/(drill+rest));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ type:"drill", name:drillNames[i % drillNames.length], duration:drill });
    if (i < count-1) out.push({ type:"rest", name:"休憩", duration:rest });
  }
  return out;
}

function makeMenu(level, time) {
  const { drill, rest } = TIME_SETTINGS[time];
  const count = Math.floor((parseInt(time)*60)/(drill+rest));
  let names = [];
  if (level === "初級") {
    const s = shuffle(DRILLS_SHOKYU);
    for (let i=0;i<count;i++) names.push(s[i%s.length]);
  } else if (level === "中級") {
    for (let i=0;i<count;i++) names.push(shuffle(DRILLS_CHUKYU).slice(0, Math.random()<0.5?2:3).join(" → "));
  } else {
    const s = shuffle(DRILLS_JOKYU);
    for (let i=0;i<count;i++) names.push(s[i%s.length]);
  }
  return buildMenu(names, time);
}

function makeMyMenu(drills, time) {
  const { drill, rest } = TIME_SETTINGS[time];
  const count = Math.floor((parseInt(time)*60)/(drill+rest));
  let pool = shuffle([...drills]);
  const names = [];
  for (let i=0;i<count;i++) {
    if (!pool.length) pool = shuffle([...drills]);
    const idx = Math.floor(Math.random()*pool.length);
    names.push(pool[idx]);
    if (drills.length >= count) pool.splice(idx,1);
  }
  return buildMenu(names, time);
}

async function fetchAIMenu(level, time, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1000,
      messages:[{ role:"user", content:`バスケドリブル練習メニューをJSONで。レベル:${level} 時間:${time} 形式:{"menu":[{"type":"drill"or"rest","name":"名前","duration":秒},...]} drillとrestを交互、合計${time}以内。JSON以外出力しない。` }],
    }),
  });
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return JSON.parse(data.content.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim()).menu;
}

// ─────────────────────────────────────────────
// Sound
// ─────────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function playBeep(type="drill") {
  try {
    const ctx = getAudioCtx();
    const play = () => {
      const t = ctx.currentTime;
      if (type==="drill") {
        [[0,880,0.15],[0.2,880,0.15]].forEach(([delay,freq,dur])=>{
          const osc=ctx.createOscillator(), gain=ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type="sine"; osc.frequency.setValueAtTime(freq,t+delay);
          gain.gain.setValueAtTime(0.5,t+delay);
          gain.gain.exponentialRampToValueAtTime(0.001,t+delay+dur);
          osc.start(t+delay); osc.stop(t+delay+dur+0.01);
        });
      } else {
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type="sine"; osc.frequency.setValueAtTime(440,t);
        gain.gain.setValueAtTime(0.4,t);
        gain.gain.exponentialRampToValueAtTime(0.001,t+0.3);
        osc.start(t); osc.stop(t+0.31);
      }
    };
    ctx.state==="suspended" ? ctx.resume().then(play) : play();
  } catch(e) { console.warn("sound",e); }
}
function unlockAudio() {
  try { const c=getAudioCtx(); if(c.state==="suspended") c.resume(); } catch{}
}

// ─────────────────────────────────────────────
// Timer Hook
// ─────────────────────────────────────────────
function useTimer(menu, soundOn=true) {
  const [curIdx, setCurIdx]   = useState(0);
  const [secsLeft, setSecsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const ref = useRef(null);

  useEffect(()=>{
    if (!running) return;
    if (secsLeft > 0) {
      ref.current = setTimeout(()=>setSecsLeft(s=>s-1), 1000);
    } else {
      if (curIdx < menu.length-1) {
        const n=curIdx+1; setCurIdx(n); setSecsLeft(menu[n].duration);
        if (soundOn) playBeep(menu[n].type);
      } else { setRunning(false); setFinished(true); }
    }
    return ()=>clearTimeout(ref.current);
  },[running,secsLeft,curIdx,menu,soundOn]);

  const start=(m)=>{ unlockAudio(); setCurIdx(0); setSecsLeft(m[0].duration); setRunning(true); setFinished(false); };
  const skip=(m)=>{
    clearTimeout(ref.current);
    if (curIdx<m.length-1){ const n=curIdx+1; setCurIdx(n); setSecsLeft(m[n].duration); if(soundOn) playBeep(m[n].type); }
    else { setRunning(false); setFinished(true); }
  };
  const reset=()=>{ clearTimeout(ref.current); setCurIdx(0); setSecsLeft(0); setRunning(false); setFinished(false); };
  return { curIdx, secsLeft, running, finished, setRunning, start, skip, reset };
}

// ─────────────────────────────────────────────
// Brand Icon
// ─────────────────────────────────────────────
function BrandIcon({ size=30, white=true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={white?"bgw":"bgo"} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={white?"#fff":"#FF9500"}/>
          <stop offset="100%" stopColor={white?"#ffe0b0":"#FF6B00"}/>
        </linearGradient>
      </defs>
      <path d="M38 4C48 4 62 14 64 28c2 10-6 18-14 24 6-8 7-18 0-26-6-7-16-8-21-2 8-8 11 6 6 16-5 10-17 14-21 24-6 12 2 26 14 30C14 88 6 74 8 60c2-16 12-30 22-40 6-7 6-16 8-16z"
        fill={`url(#${white?"bgw":"bgo"})`} transform="scale(0.78) translate(2,-2)"/>
      <path d="M52 16L32 46l12-4-18 30 32-34-13 4z" fill={`url(#${white?"bgw":"bgo"})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────
// Mood Picker
// ─────────────────────────────────────────────
const STAMPS = [
  { emoji:"🔥", label:"最高" },
  { emoji:"😄", label:"楽しい" },
  { emoji:"🙂", label:"普通" },
  { emoji:"😫", label:"きつい" },
];
function MoodPicker({ value, onChange }) {
  return (
    <div>
      <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:8}}>感情スタンプ（任意）</div>
      <div style={{display:"flex",gap:8}}>
        {STAMPS.map(s=>{
          const active=value===s.emoji;
          return (
            <button key={s.emoji} onClick={()=>onChange(active?null:s.emoji)} style={{
              flex:1,padding:"10px 0",borderRadius:13,border:"none",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              background:active?"linear-gradient(135deg,#FF6B00,#FF9500)":"white",
              boxShadow:active?"0 4px 12px rgba(255,107,0,0.35)":"0 2px 8px rgba(0,0,0,0.06)",
              transition:"all 0.2s",
            }}>
              <span style={{fontSize:22}}>{s.emoji}</span>
              <span style={{fontSize:10,fontWeight:700,color:active?"white":"#888"}}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Saved Page
// ─────────────────────────────────────────────
function SavedPage({ records, onDelete }) {
  if (!records.length) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#aaa"}}>
      <div style={{fontSize:48}}>📂</div>
      <div style={{fontWeight:700,fontSize:15,color:"#888"}}>まだ記録がありません</div>
      <div style={{fontSize:12,textAlign:"center",lineHeight:1.7}}>練習を完了して保存すると<br/>ここに記録が残ります</div>
    </div>
  );
  return (
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
      {records.map(r=>(
        <div key={r.id} style={{background:"white",borderRadius:16,padding:"14px 16px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)",position:"relative"}}>
          <button onClick={()=>onDelete(r.id)} style={{position:"absolute",top:10,right:12,background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#ccc"}}>✕</button>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",borderRadius:8,padding:"2px 9px",fontSize:11,fontWeight:800}}>{r.time}</span>
            <span style={{fontSize:11,color:"#aaa",fontWeight:600}}>{r.level}</span>
            <span style={{marginLeft:"auto",fontSize:10,color:"#bbb"}}>{r.date}</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:(r.memo||r.mood)?8:0}}>
            {r.drills.map((d,j)=><span key={j} style={{background:"#fff0e6",color:"#FF6B00",borderRadius:7,padding:"2px 9px",fontSize:11,fontWeight:600}}>✓ {d}</span>)}
            {r.mood && <span style={{background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",borderRadius:7,padding:"2px 9px",fontSize:12,fontWeight:700}}>{r.mood}</span>}
          </div>
          {r.memo && <div style={{background:"#f8f5f0",borderRadius:9,padding:"7px 11px",fontSize:12,color:"#555",lineHeight:1.5,borderLeft:"3px solid #FF9500"}}>{r.memo}</div>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Calendar Page
// ─────────────────────────────────────────────
function CalendarPage({ records, events, onSaveEvents }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(null);
  const [eventInput, setEventInput] = useState("");

  const practicedDates = new Set(records.map(r=>{
    const p=r.date.split(" ")[0].split("/");
    return `${p[0]}/${parseInt(p[1])}/${parseInt(p[2])}`;
  }));

  const toKey=(y,m,d)=>`${y}/${m+1}/${d}`;
  const todayKey=toKey(today.getFullYear(),today.getMonth(),today.getDate());
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  const prevMonth=()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth=()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  const selKey=selected;
  const selRecords=selKey?records.filter(r=>{
    const p=r.date.split(" ")[0].split("/");
    return toKey(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]))===selKey;
  }):[];
  const selPracticed=selKey?practicedDates.has(selKey):false;

  const saveEvent=()=>{
    const updated={...events};
    if(eventInput.trim()) updated[selKey]=eventInput; else delete updated[selKey];
    onSaveEvents(updated);
  };

  const MONTHS_JP=["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
  const DAYS_JP=["日","月","火","水","木","金","土"];
  const practicedThisMonth=[...practicedDates].filter(k=>{const[y,m]=k.split("/");return parseInt(y)===year&&parseInt(m)===month+1;}).length;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"white",borderRadius:18,padding:"14px 16px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#FF6B00",padding:"4px 8px"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#222"}}>{year}年 {MONTHS_JP[month]}</div>
            <div style={{fontSize:11,color:"#FF6B00",fontWeight:700,marginTop:2}}>🔥 {practicedThisMonth}日練習</div>
          </div>
          <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#FF6B00",padding:"4px 8px"}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
          {DAYS_JP.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#e53935":i===6?"#1565c0":"#aaa",padding:"2px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const key=toKey(year,month,d);
            const practiced=practicedDates.has(key);
            const hasEvent=!!events[key];
            const isToday=key===todayKey;
            const isSel=key===selected;
            const dow=(firstDay+d-1)%7;
            return (
              <div key={i} onClick={()=>{setSelected(key);setEventInput(events[key]||"");}}
                style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,cursor:"pointer",
                  background:isSel?"linear-gradient(135deg,#FF6B00,#FF9500)":practiced?"#fff0e6":"transparent",
                  border:isToday&&!isSel?"2px solid #FF6B00":"2px solid transparent",transition:"all 0.15s"}}>
                <span style={{fontSize:13,fontWeight:isSel||isToday?800:600,color:isSel?"white":practiced?"#FF6B00":dow===0?"#e53935":dow===6?"#1565c0":"#333",lineHeight:1.2}}>{d}</span>
                <div style={{display:"flex",gap:1,marginTop:1,height:8,alignItems:"center"}}>
                  {practiced&&<span style={{fontSize:8,lineHeight:1}}>🔥</span>}
                  {hasEvent&&<span style={{fontSize:8,lineHeight:1}}>⭐</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:12,marginTop:10,justifyContent:"center"}}>
          {[["🔥","練習あり"],["⭐","予定あり"]].map(([icon,label])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#888"}}><span style={{fontSize:10}}>{icon}</span>{label}</div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#888"}}>
            <span style={{width:12,height:12,borderRadius:3,border:"2px solid #FF6B00",display:"inline-block"}}/>今日
          </div>
        </div>
      </div>

      {selected && (
        <div style={{background:"white",borderRadius:18,padding:16,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#222",marginBottom:10}}>
            {year}年{month+1}月{selected.split("/")[2]}日
            {selPracticed&&<span style={{marginLeft:8,fontSize:12,color:"#FF6B00",fontWeight:700}}>🔥 練習済み</span>}
          </div>
          {selRecords.map((r,i)=>(
            <div key={i} style={{background:"#fff8f0",borderRadius:10,padding:"8px 12px",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",borderRadius:6,padding:"1px 8px",fontSize:10,fontWeight:800}}>{r.time}</span>
                <span style={{fontSize:10,color:"#aaa"}}>{r.level}</span>
                {r.mood&&<span style={{fontSize:14}}>{r.mood}</span>}
              </div>
              {r.memo&&<div style={{fontSize:11,color:"#666"}}>{r.memo}</div>}
            </div>
          ))}
          <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:6}}>⭐ 予定・目標メモ</div>
          <textarea value={eventInput} onChange={e=>setEventInput(e.target.value)} placeholder={"例: ○○大会\nこの日のためにやる！"}
            style={{width:"100%",minHeight:64,borderRadius:10,border:"1.5px solid #e8e0d8",padding:10,fontSize:12,resize:"none",fontFamily:"inherit",background:"#faf8f5",outline:"none",boxSizing:"border-box",lineHeight:1.6}}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>setSelected(null)} style={{flex:1,padding:"10px",borderRadius:11,border:"none",background:"#e8e0d8",color:"#555",fontWeight:700,fontSize:13,cursor:"pointer"}}>閉じる</button>
            <button onClick={saveEvent} style={{flex:2,padding:"10px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 4px 12px rgba(255,107,0,0.3)"}}>💾 保存</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// My Drill Page
// ─────────────────────────────────────────────
const PUR = "#6B3FFF";

function MyDrillPage({ sets, onSaveSets, onSaveRecord, soundOn }) {
  const [view, setView]         = useState("home");
  const [editing, setEditing]   = useState(null);
  const [input, setInput]       = useState("");
  const [activeId, setActiveId] = useState(null);
  const [myTime, setMyTime]     = useState("5分");
  const [myMenu, setMyMenu]     = useState([]);
  const [memo, setMemo]         = useState("");
  const [mood, setMood]         = useState(null);
  const [recSaved, setRecSaved] = useState(false);
  const timer = useTimer(myMenu, soundOn);

  const activeSet = sets.find(s=>s.id===activeId);

  const createSet=()=>{ if(sets.length>=3) return; const s={id:Date.now(),name:`セット${sets.length+1}`,drills:[]}; onSaveSets([...sets,s]); setEditing({...s}); setView("edit"); };
  const openEdit=(s)=>{ setEditing({...s,drills:[...s.drills]}); setView("edit"); };
  const saveEdit=()=>{ onSaveSets(sets.map(s=>s.id===editing.id?editing:s)); setView("home"); };
  const deleteSet=(id)=>onSaveSets(sets.filter(s=>s.id!==id));
  const addDrill=()=>{ const t=input.trim(); if(!t) return; setEditing(e=>({...e,drills:[...e.drills,t]})); setInput(""); };
  const removeDrill=(i)=>setEditing(e=>({...e,drills:e.drills.filter((_,idx)=>idx!==i)}));
  const startPractice=(s)=>{ setActiveId(s.id); setView("practice"); };
  const generate=()=>{ const m=makeMyMenu(activeSet.drills,myTime); setMyMenu(m); setView("menu"); };
  const startTimer=()=>{ timer.start(myMenu); setView("timer"); };
  const skip=()=>{ timer.skip(myMenu); };

  useEffect(()=>{ if(timer.finished) setView("done"); },[timer.finished]);

  const saveRecord=()=>{
    const now=new Date();
    onSaveRecord({ id:Date.now(),
      date:`${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`,
      time:myTime, level:`My Drill (${activeSet?.name})`,
      drills:[...new Set(myMenu.filter(m=>m.type==="drill").map(m=>m.name))], memo, mood });
    setRecSaved(true);
  };
  const resetAll=()=>{ timer.reset(); setMyMenu([]); setMemo(""); setMood(null); setRecSaved(false); setView("home"); };

  const Btn=({children,onClick,disabled,style:s={}})=>(
    <button onClick={onClick} disabled={disabled} style={{padding:"13px",borderRadius:13,border:"none",color:"white",fontWeight:800,fontSize:14,cursor:disabled?"not-allowed":"pointer",...s}}>{children}</button>
  );

  if (view==="home") return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:12,color:"#888",fontWeight:700}}>セット一覧（最大3つ）</div>
      {sets.map(s=>(
        <div key={s.id} style={{background:"white",borderRadius:16,padding:"14px 16px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{flex:1,fontSize:15,fontWeight:800,color:"#222"}}>{s.name}</div>
            <button onClick={()=>openEdit(s)} style={{background:"#f0ecff",border:"none",borderRadius:8,padding:"5px 11px",fontSize:11,color:PUR,fontWeight:700,cursor:"pointer"}}>編集</button>
            <button onClick={()=>deleteSet(s.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#ddd",padding:"4px"}}>✕</button>
          </div>
          <div style={{fontSize:12,color:"#aaa",marginBottom:10}}>
            {!s.drills.length?"メニューなし":s.drills.slice(0,3).join("・")+(s.drills.length>3?` 他${s.drills.length-3}件`:"")}
          </div>
          <button onClick={()=>startPractice(s)} disabled={!s.drills.length} style={{
            width:"100%",padding:"11px",borderRadius:12,border:"none",fontWeight:800,fontSize:14,
            background:s.drills.length?`linear-gradient(135deg,${PUR},#9B6BFF)`:"#e0e0e0",
            color:"white",cursor:s.drills.length?"pointer":"not-allowed",
            boxShadow:s.drills.length?"0 4px 14px rgba(107,63,255,0.3)":"none",
          }}>▶ このセットで練習</button>
        </div>
      ))}
      {sets.length<3
        ?<button onClick={createSet} style={{padding:"14px",borderRadius:14,border:`2px dashed ${PUR}`,background:"transparent",color:PUR,fontWeight:800,fontSize:15,cursor:"pointer"}}>＋ 新しいセットを作成</button>
        :<div style={{textAlign:"center",fontSize:12,color:"#bbb",padding:"8px 0"}}>セットは最大3つまでです</div>}
      {!sets.length&&<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,color:"#bbb",marginTop:16}}>
        <div style={{fontSize:44}}>🏀</div>
        <div style={{fontSize:13,color:"#999",fontWeight:700}}>セットがまだありません</div>
        <div style={{fontSize:12,textAlign:"center",lineHeight:1.8}}>「＋ 新しいセットを作成」から<br/>オリジナルメニューを作ろう！</div>
      </div>}
    </div>
  );

  if (view==="edit"&&editing) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"white",borderRadius:16,padding:14,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:12,color:PUR,fontWeight:700,marginBottom:8}}>セット名</div>
        <input value={editing.name} onChange={e=>setEditing(s=>({...s,name:e.target.value}))}
          style={{width:"100%",padding:"10px 12px",borderRadius:11,border:`1.5px solid ${PUR}55`,fontSize:14,fontWeight:700,fontFamily:"inherit",outline:"none",background:"#faf8ff",boxSizing:"border-box",color:"#222"}}/>
      </div>
      <div style={{background:"white",borderRadius:16,padding:14,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:12,color:PUR,fontWeight:700,marginBottom:8}}>＋ ドリルを追加</div>
        <div style={{display:"flex",gap:8}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addDrill()} placeholder="例: クロスオーバー low"
            style={{flex:1,padding:"10px 12px",borderRadius:11,border:"1.5px solid #e8e0d8",fontSize:13,fontFamily:"inherit",outline:"none",background:"#faf8f5"}}/>
          <button onClick={addDrill} style={{padding:"10px 16px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${PUR},#9B6BFF)`,color:"white",fontWeight:800,fontSize:18,cursor:"pointer"}}>＋</button>
        </div>
      </div>
      {editing.drills.length>0&&<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:7}}>
        <div style={{fontSize:11,color:"#aaa",fontWeight:600}}>{editing.drills.length}件</div>
        {editing.drills.map((d,i)=>(
          <div key={i} style={{background:"white",borderRadius:13,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{width:24,height:24,borderRadius:7,background:`linear-gradient(135deg,${PUR},#9B6BFF)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:10,fontWeight:800,flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,fontSize:13,fontWeight:600,color:"#222"}}>{d}</div>
            <button onClick={()=>removeDrill(i)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#ddd"}}>✕</button>
          </div>
        ))}
      </div>}
      <div style={{display:"flex",gap:9,marginTop:"auto"}}>
        <Btn onClick={()=>setView("home")} style={{background:"#e8e0d8",color:"#444",flex:1}}>キャンセル</Btn>
        <Btn onClick={saveEdit} style={{background:`linear-gradient(135deg,${PUR},#9B6BFF)`,boxShadow:"0 4px 14px rgba(107,63,255,0.3)",flex:2}}>💾 保存</Btn>
      </div>
    </div>
  );

  if (view==="practice") return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"white",borderRadius:16,padding:14,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:11,color:"#aaa",fontWeight:600,marginBottom:4}}>選択中のセット</div>
        <div style={{fontSize:18,fontWeight:900,color:PUR}}>{activeSet?.name}</div>
        <div style={{fontSize:12,color:"#bbb",marginTop:4}}>{activeSet?.drills.length}件のドリル</div>
      </div>
      <div>
        <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:8}}>時間</div>
        <div style={{display:"flex",gap:7}}>
          {["3分","5分","10分"].map(t=>(
            <button key={t} onClick={()=>setMyTime(t)} style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all 0.2s",background:myTime===t?`linear-gradient(135deg,${PUR},#9B6BFF)`:"#e8e0d8",color:myTime===t?"white":"#555",boxShadow:myTime===t?"0 4px 12px rgba(107,63,255,0.3)":"none"}}>{t}</button>
          ))}
        </div>
      </div>
      <Btn onClick={generate} style={{background:`linear-gradient(135deg,${PUR},#9B6BFF)`,boxShadow:"0 6px 18px rgba(107,63,255,0.35)",fontSize:16,padding:"15px"}}>⚡ メニューを生成</Btn>
      <Btn onClick={()=>setView("home")} style={{background:"#e8e0d8",color:"#555"}}>← セット一覧に戻る</Btn>
    </div>
  );

  if (view==="menu") return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{textAlign:"center",fontSize:13,color:PUR,fontWeight:700}}>{activeSet?.name} — {myTime}</div>
      <div style={{flex:1,overflowY:"auto",maxHeight:360}}>
        {myMenu.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #e8e0d8"}}>
            <div style={{width:42,textAlign:"center",fontSize:14,fontWeight:800,color:item.type==="rest"?"#aaa":PUR}}>{item.duration}秒</div>
            <div style={{fontSize:14,color:item.type==="rest"?"#999":"#222",fontWeight:item.type==="rest"?400:600}}>{item.name}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:9}}>
        <Btn onClick={generate} style={{background:"#e8e0d8",color:"#444",flex:1}}>再生成</Btn>
        <Btn onClick={startTimer} style={{background:`linear-gradient(135deg,${PUR},#9B6BFF)`,boxShadow:"0 6px 18px rgba(107,63,255,0.35)",fontSize:15,flex:2}}>▶ スタート</Btn>
      </div>
    </div>
  );

  if (view==="timer") {
    const curItem=myMenu[timer.curIdx];
    const prog=curItem?((curItem.duration-timer.secsLeft)/curItem.duration)*100:0;
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{textAlign:"center",marginTop:8}}>
          <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:5}}>{timer.curIdx+1} / {myMenu.length}</div>
          <div style={{fontSize:20,fontWeight:900,color:curItem?.type==="rest"?"#888":"#222",marginBottom:14}}>{curItem?.name}</div>
          <div style={{fontSize:88,fontWeight:900,lineHeight:1,color:curItem?.type==="rest"?"#999":PUR,fontVariantNumeric:"tabular-nums"}}>
            {timer.secsLeft}<span style={{fontSize:24,fontWeight:600}}>秒</span>
          </div>
        </div>
        <div style={{background:"#e8e0d8",borderRadius:99,height:9,overflow:"hidden"}}>
          <div style={{width:`${prog}%`,height:"100%",background:curItem?.type==="rest"?"linear-gradient(90deg,#aaa,#bbb)":`linear-gradient(90deg,${PUR},#9B6BFF)`,borderRadius:99,transition:"width 0.9s linear"}}/>
        </div>
        {timer.curIdx<myMenu.length-1&&<div style={{textAlign:"center",fontSize:13,color:"#999"}}>次: <b style={{color:"#555"}}>{myMenu[timer.curIdx+1].name}</b></div>}
        <div style={{display:"flex",gap:9,marginTop:"auto"}}>
          <Btn onClick={()=>timer.setRunning(r=>!r)} style={{background:"#e8e0d8",color:"#444",flex:1}}>{timer.running?"⏸ 一時停止":"▶ 再開"}</Btn>
          <Btn onClick={skip} style={{background:`linear-gradient(135deg,${PUR},#9B6BFF)`,flex:1}}>スキップ ›</Btn>
        </div>
      </div>
    );
  }

  if (view==="done") return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:6}}>🎉</div>
        <div style={{fontSize:24,fontWeight:900,color:PUR}}>おつかれ！</div>
        <div style={{fontSize:13,color:"#888",marginTop:4}}>{activeSet?.name} 完了: {myTime}</div>
      </div>
      <div style={{background:"white",borderRadius:15,padding:14}}>
        <div style={{fontSize:12,color:PUR,fontWeight:700,marginBottom:9}}>実行メニュー</div>
        {[...new Set(myMenu.filter(m=>m.type==="drill").map(m=>m.name))].map((n,i)=>(
          <div key={i} style={{fontSize:13,color:"#333",marginBottom:5,display:"flex",gap:7}}><span style={{color:PUR}}>✓</span>{n}</div>
        ))}
      </div>
      <div>
        <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:7}}>今日のメモ（任意）</div>
        <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例: クロスオーバー上手くいった"
          style={{width:"100%",minHeight:70,borderRadius:11,border:"1px solid #e0d8d0",padding:11,fontSize:12,resize:"none",fontFamily:"inherit",background:"#f5f0ff",outline:"none",boxSizing:"border-box"}}/>
      </div>
      <MoodPicker value={mood} onChange={setMood}/>
      <div style={{display:"flex",gap:9}}>
        <Btn onClick={saveRecord} disabled={recSaved} style={{background:recSaved?"#c8e6c9":"linear-gradient(135deg,#2e7d32,#43a047)",cursor:recSaved?"default":"pointer",flex:1}}>{recSaved?"✓ 保存済み":"💾 保存する"}</Btn>
        <Btn onClick={resetAll} style={{background:`linear-gradient(135deg,${PUR},#9B6BFF)`,flex:1}}>↩ 戻る</Btn>
      </div>
    </div>
  );
  return null;
}

// ─────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────
function SettingsPage({ profile, onEditProfile, soundOn, onToggleSound }) {
  const avatar=profile.photo||null;
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"white",borderRadius:20,padding:"20px 18px",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:58,height:58,borderRadius:18,background:"linear-gradient(135deg,#FF6B00,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
          {avatar?<img src={avatar} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:26}}>👤</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:17,fontWeight:800,color:"#222",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{profile.name||"名前未設定"}</div>
          <div style={{fontSize:12,color:"#aaa",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{profile.email||""}</div>
          {profile.position&&<div style={{fontSize:11,color:"#FF6B00",fontWeight:700,marginTop:3}}>📍 {profile.position}</div>}
        </div>
      </div>
      <div style={{background:"white",borderRadius:18,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <button onClick={onEditProfile} style={{width:"100%",padding:"16px 18px",border:"none",background:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #f0ebe4"}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#FF6B00,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>👤</div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#222"}}>プロフィール</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:1}}>名前・写真・ポジションを編集</div>
          </div>
          <span style={{fontSize:18,color:"#ccc"}}>›</span>
        </button>
        <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:soundOn?"linear-gradient(135deg,#FF6B00,#FF9500)":"#e0e0e0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,transition:"background 0.3s"}}>🔔</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"#222"}}>サウンド</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:1}}>切り替え時に通知音を再生</div>
          </div>
          <div onClick={onToggleSound} style={{width:50,height:28,borderRadius:99,cursor:"pointer",background:soundOn?"linear-gradient(135deg,#FF6B00,#FF9500)":"#ccc",position:"relative",transition:"background 0.3s",flexShrink:0}}>
            <div style={{position:"absolute",top:3,left:soundOn?22:3,width:22,height:22,borderRadius:99,background:"white",transition:"left 0.3s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
          </div>
        </div>
      </div>
      <div style={{flex:1}}/>
      <div style={{textAlign:"center",fontSize:11,color:"#ccc"}}>SPDR DRIBBLE v1.0</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Profile Edit Page
// ─────────────────────────────────────────────
function ProfileEditPage({ profile, onSave, onBack }) {
  const [name,setName]         = useState(profile.name||"");
  const [email,setEmail]       = useState(profile.email||"");
  const [position,setPosition] = useState(profile.position||"");
  const [photo,setPhoto]       = useState(profile.photo||null);
  const handlePhoto=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setPhoto(ev.target.result); r.readAsDataURL(f); };
  const save=()=>{ onSave({name,email,position,photo}); onBack(); };
  const POSITIONS=["PG","SG","SF","PF","C"];
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"8px 0"}}>
        <div style={{width:80,height:80,borderRadius:24,background:"linear-gradient(135deg,#FF6B00,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",boxShadow:"0 4px 16px rgba(255,107,0,0.3)"}}>
          {photo?<img src={photo} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:36}}>👤</span>}
        </div>
        <label style={{background:"#fff0e6",color:"#FF6B00",borderRadius:10,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",border:"1.5px solid #ffd9b0"}}>
          📷 写真を変更
          <input type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
        </label>
      </div>
      {[
        {label:"名前",value:name,set:setName,placeholder:"例: 山田太郎"},
        {label:"メールアドレス",value:email,set:setEmail,placeholder:"example@email.com",type:"email"},
      ].map(({label,value,set,placeholder,type})=>(
        <div key={label} style={{background:"white",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:7}}>{label}</div>
          <input value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} type={type||"text"}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e8e0d8",fontSize:14,fontFamily:"inherit",outline:"none",background:"#faf8f5",boxSizing:"border-box"}}/>
        </div>
      ))}
      <div style={{background:"white",borderRadius:14,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:8}}>ポジション</div>
        <div style={{display:"flex",gap:7}}>
          {POSITIONS.map(p=>(
            <button key={p} onClick={()=>setPosition(position===p?"":p)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.2s",background:position===p?"linear-gradient(135deg,#FF6B00,#FF9500)":"#e8e0d8",color:position===p?"white":"#555",boxShadow:position===p?"0 3px 10px rgba(255,107,0,0.3)":"none"}}>{p}</button>
          ))}
        </div>
      </div>
      <button onClick={save} style={{padding:"15px",borderRadius:15,border:"none",background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:"0 6px 20px rgba(255,107,0,0.4)",marginTop:4}}>
        💾 保存する
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Home Practice
// ─────────────────────────────────────────────
function HomePractice({ level, time, onSaveRecord, soundOn, onScreenChange, apiKey }) {
  const [screen,setScreen]   = useState("home");
  const changeScreen=(s)=>{ setScreen(s); onScreenChange?.(s); };
  const [menu,setMenu]       = useState([]);
  const [aiLoad,setAiLoad]   = useState(false);
  const [memo,setMemo]       = useState("");
  const [mood,setMood]       = useState(null);
  const [recSaved,setRecSaved] = useState(false);
  const timer = useTimer(menu, soundOn);

  useEffect(()=>{ if(timer.finished) changeScreen("done"); },[timer.finished]);

  const generate=()=>{ const m=makeMenu(level,time); setMenu(m); changeScreen("menu"); };
  const generateAI=async()=>{
    setAiLoad(true);
    try { const m=await fetchAIMenu(level,time,apiKey); setMenu(m); changeScreen("menu"); }
    catch { generate(); }
    finally { setAiLoad(false); }
  };
  const startTimer=()=>{ timer.start(menu); changeScreen("timer"); };
  const skip=()=>{ timer.skip(menu); };
  const saveRecord=()=>{
    const now=new Date();
    onSaveRecord({ id:Date.now(),
      date:`${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`,
      time, level, drills:[...new Set(menu.filter(m=>m.type==="drill").map(m=>m.name))], memo, mood });
    setRecSaved(true);
  };
  const reset=()=>{ timer.reset(); setMenu([]); setMemo(""); setMood(null); setRecSaved(false); changeScreen("home"); };
  const curItem=menu[timer.curIdx];
  const prog=curItem?((curItem.duration-timer.secsLeft)/curItem.duration)*100:0;

  if (screen==="home") return (
    <>
      <button onClick={generateAI} disabled={aiLoad} style={{padding:"15px",borderRadius:15,border:"none",background:aiLoad?"#ccc":"linear-gradient(135deg,#1a1a1a,#333)",color:"white",fontWeight:800,fontSize:15,cursor:aiLoad?"not-allowed":"pointer",boxShadow:"0 6px 20px rgba(0,0,0,0.2)"}}>
        {aiLoad?"⏳ AI生成中...":"🤖 AIメニュー作成"}
      </button>
      <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10,padding:"8px 0"}}>
        <BrandIcon size={48} white={false}/>
        <div><div style={{fontSize:20,fontWeight:900,color:"#FF6B00",letterSpacing:1}}>SPDR</div><div style={{fontSize:11,color:"#aaa",fontWeight:600,letterSpacing:2}}>DRIBBLE</div></div>
      </div>
      <div style={{background:"#fff8f0",borderRadius:14,padding:14,border:"1px solid #ffd9b0"}}>
        <div style={{fontSize:11,color:"#FF6B00",fontWeight:700,marginBottom:7}}>📋 レベル説明</div>
        <div style={{fontSize:12,color:"#555",lineHeight:1.9}}>
          <div>🔥 <b>上級</b> — ツーハンドドリブル系 15種</div>
          <div>⭐ <b>中級</b> — 複合ドリブル 2〜3種</div>
          <div>⭐ <b>初級</b> — ワンハンド系 15種</div>
        </div>
      </div>
    </>
  );
  if (screen==="menu") return (
    <>
      <div style={{textAlign:"center",fontSize:13,color:"#FF6B00",fontWeight:700}}>合計: {time}（{level}）</div>
      <div style={{flex:1,overflowY:"auto",maxHeight:360}}>
        {menu.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #e8e0d8"}}>
            <div style={{width:42,textAlign:"center",fontSize:14,fontWeight:800,color:item.type==="rest"?"#aaa":"#FF6B00"}}>{item.duration}秒</div>
            <div style={{fontSize:14,color:item.type==="rest"?"#999":"#222",fontWeight:item.type==="rest"?400:600}}>{item.name}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:9}}>
        <button onClick={generate} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:"#e8e0d8",color:"#444",fontWeight:700,fontSize:13,cursor:"pointer"}}>再生成</button>
        <button onClick={startTimer} style={{flex:2,padding:"13px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:"0 6px 18px rgba(255,107,0,0.4)"}}>▶ スタート</button>
      </div>
    </>
  );
  if (screen==="timer"&&curItem) return (
    <>
      <div style={{textAlign:"center",marginTop:8}}>
        <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:5}}>{timer.curIdx+1} / {menu.length}</div>
        <div style={{fontSize:20,fontWeight:900,color:curItem.type==="rest"?"#888":"#222",marginBottom:14}}>{curItem.name}</div>
        <div style={{fontSize:88,fontWeight:900,lineHeight:1,color:curItem.type==="rest"?"#999":"#FF6B00",fontVariantNumeric:"tabular-nums"}}>
          {timer.secsLeft}<span style={{fontSize:24,fontWeight:600}}>秒</span>
        </div>
      </div>
      <div style={{background:"#e8e0d8",borderRadius:99,height:9,overflow:"hidden"}}>
        <div style={{width:`${prog}%`,height:"100%",background:curItem.type==="rest"?"linear-gradient(90deg,#aaa,#bbb)":"linear-gradient(90deg,#FF6B00,#FF9500)",borderRadius:99,transition:"width 0.9s linear"}}/>
      </div>
      {timer.curIdx<menu.length-1&&<div style={{textAlign:"center",fontSize:13,color:"#999"}}>次: <b style={{color:"#555"}}>{menu[timer.curIdx+1].name}</b></div>}
      <div style={{display:"flex",gap:9,marginTop:"auto"}}>
        <button onClick={()=>timer.setRunning(r=>!r)} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:"#e8e0d8",color:"#444",fontWeight:700,fontSize:13,cursor:"pointer"}}>{timer.running?"⏸ 一時停止":"▶ 再開"}</button>
        <button onClick={skip} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",fontWeight:800,fontSize:13,cursor:"pointer"}}>スキップ ›</button>
      </div>
    </>
  );
  if (screen==="done") return (
    <>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:6}}>🎉</div>
        <div style={{fontSize:24,fontWeight:900,color:"#FF6B00"}}>おつかれ！</div>
        <div style={{fontSize:13,color:"#888",marginTop:4}}>練習完了: {time}</div>
      </div>
      <div style={{background:"white",borderRadius:15,padding:14}}>
        <div style={{fontSize:12,color:"#FF6B00",fontWeight:700,marginBottom:9}}>実行メニュー</div>
        {[...new Set(menu.filter(m=>m.type==="drill").map(m=>m.name))].map((n,i)=>(
          <div key={i} style={{fontSize:13,color:"#333",marginBottom:5,display:"flex",gap:7}}><span style={{color:"#FF6B00"}}>✓</span>{n}</div>
        ))}
      </div>
      <div>
        <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:7}}>今日のメモ（任意）</div>
        <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例: クロスオーバー上手くいった"
          style={{width:"100%",minHeight:70,borderRadius:11,border:"1px solid #e0d8d0",padding:11,fontSize:12,resize:"none",fontFamily:"inherit",background:"#fff8f0",outline:"none",boxSizing:"border-box"}}/>
      </div>
      <MoodPicker value={mood} onChange={setMood}/>
      <div style={{display:"flex",gap:9}}>
        <button onClick={saveRecord} disabled={recSaved} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:recSaved?"#c8e6c9":"linear-gradient(135deg,#2e7d32,#43a047)",color:"white",fontWeight:800,fontSize:13,cursor:recSaved?"default":"pointer"}}>{recSaved?"✓ 保存済み":"💾 保存する"}</button>
        <button onClick={reset} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#FF6B00,#FF9500)",color:"white",fontWeight:800,fontSize:13,cursor:"pointer"}}>🏠 ホーム</button>
      </div>
    </>
  );
  return null;
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  const [tab,setTab]             = useState("home");
  const [settingsView,setSettingsView] = useState("menu");
  const [level,setLevel]         = useState("上級");
  const [time,setTime]           = useState("5分");
  const [records,setRecords]     = useState(()=>ls.get("records")||[]);
  const [sets,setSets]           = useState(()=>ls.get("drillsets")||[]);
  const [profile,setProfile]     = useState(()=>ls.get("profile")||{name:"",email:"",position:"",photo:null});
  const [soundOn,setSoundOn]     = useState(()=>{ const v=ls.get("soundon"); return v===null?true:v; });
  const [events,setEvents]       = useState(()=>ls.get("calevents")||{});
  const [homeScreen,setHomeScreen] = useState("home");
  const [apiKey,setApiKey]       = useState(()=>ls.get("apikey")||"");
  const [showKeyInput,setShowKeyInput] = useState(false);

  const saveRecords=(v)=>{ setRecords(v); ls.set("records",v); };
  const saveSets=(v)=>{ setSets(v); ls.set("drillsets",v); };
  const saveProfile=(v)=>{ setProfile(v); ls.set("profile",v); };
  const saveEvents=(v)=>{ setEvents(v); ls.set("calevents",v); };
  const toggleSound=()=>{ const v=!soundOn; setSoundOn(v); ls.set("soundon",v); };
  const addRecord=(rec)=>saveRecords([rec,...records]);
  const delRecord=(id)=>saveRecords(records.filter(r=>r.id!==id));

  const TABS=[
    {id:"home",    icon:"🏠",label:"ホーム"},
    {id:"myDrill", icon:"🏀",label:"My Drill"},
    {id:"calendar",icon:"📅",label:"スタンプ"},
    {id:"saved",   icon:"📋",label:"保存"},
    {id:"settings",icon:"⚙️",label:"設定"},
  ];
  const headerTitle=()=>{
    if(tab==="saved")    return "保存した練習";
    if(tab==="myDrill")  return "My Drill";
    if(tab==="calendar") return "スタンプカレンダー";
    if(tab==="settings") return settingsView==="profile"?"プロフィール編集":"設定";
    return "SPDR DRIBBLE";
  };
  const showBack=tab==="settings"&&settingsView==="profile";

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a1a 0%,#2d1810 50%,#1a1a1a 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Helvetica Neue','Hiragino Sans',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:390,background:"#f5f0eb",borderRadius:32,overflow:"hidden",boxShadow:"0 40px 80px rgba(0,0,0,0.5)",minHeight:700,display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#FF6B00,#FF9500)",padding:"18px 20px 14px",display:"flex",alignItems:"center",gap:8}}>
          {showBack&&<button onClick={()=>setSettingsView("menu")} style={{background:"none",border:"none",color:"white",fontSize:26,cursor:"pointer",padding:0,lineHeight:1,marginRight:4}}>‹</button>}
          <BrandIcon size={30} white={true}/>
          <span style={{color:"white",fontWeight:900,fontSize:17,letterSpacing:1}}>{headerTitle()}</span>
          {tab==="home"&&homeScreen==="home"&&(
            <button onClick={()=>setShowKeyInput(v=>!v)} style={{marginLeft:"auto",background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,padding:"4px 8px",color:"white",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔑 APIキー</button>
          )}
        </div>

        {/* API Key Input */}
        {showKeyInput&&(
          <div style={{background:"#1a1a1a",padding:"10px 16px",display:"flex",gap:8,alignItems:"center"}}>
            <input value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Anthropic APIキーを入力"
              style={{flex:1,padding:"8px 10px",borderRadius:8,border:"none",fontSize:12,fontFamily:"inherit",outline:"none",background:"#333",color:"white"}}/>
            <button onClick={()=>{ ls.set("apikey",apiKey); setShowKeyInput(false); }} style={{padding:"8px 12px",borderRadius:8,border:"none",background:"#FF6B00",color:"white",fontWeight:700,fontSize:12,cursor:"pointer"}}>保存</button>
          </div>
        )}

        {/* Body */}
        <div style={{flex:1,padding:"20px 18px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>

          {/* HOME */}
          {tab==="home"&&<>
            {homeScreen==="home"&&<>
              <div>
                <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:9}}>レベル選択</div>
                <div style={{display:"flex",gap:7}}>
                  {["初級","中級","上級"].map(l=>(
                    <button key={l} onClick={()=>setLevel(l)} style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all 0.2s",background:level===l?"linear-gradient(135deg,#FF6B00,#FF9500)":"#e8e0d8",color:level===l?"white":"#555",boxShadow:level===l?"0 4px 12px rgba(255,107,0,0.3)":"none"}}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:12,color:"#888",fontWeight:700,marginBottom:9}}>時間</div>
                <div style={{display:"flex",gap:7}}>
                  {["3分","5分","10分"].map(t=>(
                    <button key={t} onClick={()=>setTime(t)} style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all 0.2s",background:time===t?"linear-gradient(135deg,#FF6B00,#FF9500)":"#e8e0d8",color:time===t?"white":"#555",boxShadow:time===t?"0 4px 12px rgba(255,107,0,0.3)":"none"}}>{t}</button>
                  ))}
                </div>
              </div>
            </>}
            <HomePractice key={`${level}-${time}`} level={level} time={time} onSaveRecord={addRecord} soundOn={soundOn} onScreenChange={setHomeScreen} apiKey={apiKey}/>
          </>}

          {tab==="myDrill"&&<MyDrillPage sets={sets} onSaveSets={saveSets} onSaveRecord={addRecord} soundOn={soundOn}/>}
          {tab==="calendar"&&<CalendarPage records={records} events={events} onSaveEvents={saveEvents}/>}
          {tab==="saved"&&<SavedPage records={records} onDelete={delRecord}/>}
          {tab==="settings"&&settingsView==="menu"&&<SettingsPage profile={profile} onEditProfile={()=>setSettingsView("profile")} soundOn={soundOn} onToggleSound={toggleSound}/>}
          {tab==="settings"&&settingsView==="profile"&&<ProfileEditPage profile={profile} onSave={saveProfile} onBack={()=>setSettingsView("menu")}/>}
        </div>

        {/* Tab Bar */}
        <div style={{background:"white",borderTop:"1px solid #ece8e0",display:"flex"}}>
          {TABS.map(({id,icon,label})=>{
            const active=tab===id;
            const accent=id==="myDrill"?PUR:"#FF6B00";
            const badge=id==="saved"?records.length:id==="myDrill"?sets.length:0;
            return (
              <button key={id} onClick={()=>{ setTab(id); if(id!=="settings") setSettingsView("menu"); }}
                style={{flex:1,border:"none",background:"none",cursor:"pointer",padding:"12px 0 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative"}}>
                {active&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",height:3,borderRadius:"0 0 4px 4px",background:`linear-gradient(90deg,${accent},${accent}bb)`}}/>}
                <span style={{fontSize:18}}>{icon}</span>
                <span style={{fontSize:10,fontWeight:700,color:active?accent:"#bbb",letterSpacing:0.3}}>{label}</span>
                {badge>0&&<div style={{position:"absolute",top:7,right:"calc(50% - 20px)",background:accent,color:"white",borderRadius:99,fontSize:9,fontWeight:800,minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{badge}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
