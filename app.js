// Simple auth + storage helpers (namespaced per user)
const GLOBAL_KEYS = new Set(['users', 'currentUser']);
const auth = {
  currentUser: null,
  ensureInit() {
    // Single-user mode: remove users, keep global data.
    const prevUser = localStorage.getItem('currentUser') || 'facurombo';
    try {
      // Bring back namespaced data to global if missing
      const keys = ['agendaEvents','financeTransactions','plantStages','recurringEvents','bills','expenseYearly','futureIncomes','goals','dailyGoals','goalIdeas','weeklyClasses','academicTasks','lastOpenDate'];
      keys.forEach(k => {
        const base = localStorage.getItem(k);
        const ns = localStorage.getItem(`u:${prevUser}:${k}`);
        if (base === null && ns !== null) {
          localStorage.setItem(k, ns);
        }
      });
    } catch {}
    // Clear user accounts and force no current user
    localStorage.removeItem('currentUser');
    localStorage.removeItem('users');
    this.currentUser = null;
  },
  login(username, password) {
    username = String(username||'').trim(); password = String(password||'');
    const users = JSON.parse(localStorage.getItem('users')||'[]');
    const u = users.find(x=>x.username===username);
    if (u) {
      if (u.password !== password) return { ok:false, error:'Contraseña incorrecta' };
    } else {
      users.push({ username, password });
      localStorage.setItem('users', JSON.stringify(users));
    }
    localStorage.setItem('currentUser', username);
    this.currentUser = username;
    return { ok:true };
  }
};

auth.ensureInit();

const storage = {
  key(key){
    if (!auth.currentUser || GLOBAL_KEYS.has(key)) return key;
    return `u:${auth.currentUser}:${key}`;
  },
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(this.key(key))) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(this.key(key), JSON.stringify(value)); }
};

// Global state
const state = {
  // Calendar / weekly
  today: new Date(),
  calCursor: null, // Date at first day of current month
  selectedDate: null, // Date selected in month view
  weekStart: null, // Monday of current week cursor
  // Data
  events: storage.get('agendaEvents', {}), // { 'YYYY-MM-DD': [ {id, time, text} ] }
  txs: storage.get('financeTransactions', []), // [ {id, date, type, category, desc, amount} ]
  // Plants
  plantsUnlocked: false,
  plantStages: storage.get('plantStages', []), // [ {id, type, start, end?, notes: [ {date, text} ] } ]
  // Recurring events (series)
  recurring: storage.get('recurringEvents', []), // [ {groupId, startDate, time, text, priority, every, until?, canceled} ]
  // Bills / vencimientos
  bills: storage.get('bills', []), // [ {id, name, date, amount, monthly} ]
  // Yearly expense plan
  expenseYearly: storage.get('expenseYearly', {}), // { 'YYYY': { cats:[{id,name}], vals:{ [catId]: { '01':num, ... '12':num } } } }
  // Future incomes
  futureIncomes: storage.get('futureIncomes', []),
  // Goals
  goals: storage.get('goals', []),
  // Daily goals per date: { 'YYYY-MM-DD': [ {id,title,priority,notes,done,steps:[{id,text,done}]} ] }
  dailyGoals: storage.get('dailyGoals', {})
};

// Utilities
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromISO = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const monthLabel = (d) => d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const dayLabel = (d) => d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });
// Money formatting: no cents, thousands with dot, stick $ to number
const NBSP = '\u00A0';
const money = (n) => {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-$' + NBSP : '$' + NBSP) + s;
};
const cloneDate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a,b) => a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

// Monday-based helpers
function getMonday(d) {
  const tmp = cloneDate(d);
  const day = (tmp.getDay()+6)%7; // 0..6, Mon=0
  tmp.setDate(tmp.getDate() - day);
  return tmp;
}

// Views switching
const views = {
  mes: document.getElementById('view-mes'),
  semana: document.getElementById('view-semana'),
  finanzas: document.getElementById('view-finanzas'),
  objetivos: document.getElementById('view-objetivos')
};
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// User switcher
function refreshUserBtn(){ const el=document.getElementById('user-btn'); if(!el) return; el.textContent = `Usuario: ${auth.currentUser||'-'}`; }
async function openUserDialog(){
  const res = await showFormModal({ title:'Ingresar / Crear usuario', fields:[
    { name:'username', label:'Usuario', value:auth.currentUser||'' , required:true },
    { name:'password', label:'Contraseña', type:'password', value:'' }
  ]});
  if (!res) return;
  const r = auth.login(res.username, res.password||'');
  if (!r.ok) { alert(r.error||'Error'); return; }
  refreshUserBtn();
  location.reload();
}
document.getElementById('user-btn')?.addEventListener('click', openUserDialog);
refreshUserBtn();

function initLoginScreen(){
  const form = document.getElementById('login-form'); if (!form) return;
  const inUser = document.getElementById('login-username');
  const inPass = document.getElementById('login-password');
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const r = auth.login(inUser.value, inPass.value||'');
    if (!r.ok) { alert(r.error||'Error'); return; }
    const overlay = document.getElementById('login-screen'); overlay?.classList.add('hidden');
    const mainEl = document.querySelector('main.container'); if (mainEl) mainEl.style.display = '';
    refreshUserBtn();
    init();
  });
}

function switchView(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view===name));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('active', k===name));
  localStorage.setItem('lastView', name);
  // Auto-refresh when entering weekly view to ensure fresh state
  if (name === 'semana') {
    const key = 'skipNextSemanaReload';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      location.reload();
      return;
    } else {
      sessionStorage.removeItem(key);
    }
  }
}

// Calendar rendering
const monthLabelEl = document.getElementById('month-label');
const calendarGridEl = document.getElementById('calendar-grid');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const todayMonthBtn = document.getElementById('today-month');
const toggleHiddenBtn = document.getElementById('toggle-hidden');
const plantsPanel = document.getElementById('plants-panel');
const selectedDateLabel = document.getElementById('selected-date-label');
const eventsListEl = document.getElementById('events-list');
const eventForm = document.getElementById('event-form');
const eventDate = document.getElementById('event-date');
const eventTime = document.getElementById('event-time');
const eventEndTime = document.getElementById('event-end-time');
const eventText = document.getElementById('event-text');
const eventPriority = document.getElementById('event-priority');
const eventRecur = document.getElementById('event-recur');
const eventRecurDays = document.getElementById('event-recur-days');
const eventRecurUntil = document.getElementById('event-recur-until');
const eventRecurTimes = document.getElementById('event-recur-times');
const eventRecurWeekly = document.getElementById('event-recur-weekly');

prevMonthBtn.addEventListener('click', () => { state.calCursor.setMonth(state.calCursor.getMonth()-1); renderMonth(); });
nextMonthBtn.addEventListener('click', () => { state.calCursor.setMonth(state.calCursor.getMonth()+1); renderMonth(); });
todayMonthBtn.addEventListener('click', () => { state.calCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1); state.selectedDate = cloneDate(state.today); if (eventDate) eventDate.value = isoDate(state.today); renderMonth(); renderSelectedDay(); });
toggleHiddenBtn.addEventListener('click', () => {
  if (!state.plantsUnlocked) {
    const pass = prompt('error');
    if (pass === '???') {
      state.plantsUnlocked = true;
      plantsPanel.classList.remove('hidden');
      plantsPanel.setAttribute('aria-hidden', 'false');
      renderPlants();
    } else if (pass !== null) {
      alert('perfecto!');
    }
  } else {
    const hidden = plantsPanel.classList.toggle('hidden');
    plantsPanel.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }
});

function renderMonth() {
  const first = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth(), 1);
  const startOffset = (first.getDay()+6)%7; // Monday-first
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);

  monthLabelEl.textContent = monthLabel(first);
  calendarGridEl.innerHTML = '';
  for (let i=0; i<42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
    const cell = document.createElement('button');
    cell.className = 'day';
    const dow = d.getDay();
    if (dow === 6) cell.classList.add('sat','weekend');
    if (dow === 0) cell.classList.add('sun','weekend');
    if (d.getMonth() !== first.getMonth()) cell.classList.add('out');
    if (isSameDay(d, state.today)) cell.style.outline = '1px dashed rgba(255,255,255,0.15)';
    if (isSameDay(d, state.selectedDate)) cell.style.boxShadow = '0 0 0 2px rgba(34,197,94,.5) inset';

    const num = document.createElement('div'); num.className = 'num'; num.textContent = d.getDate();
    cell.appendChild(num);

    // Plant weekly counters (every 7 days since start, while active)
    const labels = document.createElement('div'); labels.className = 'labels';
    const actives = state.plantStages.filter(st => {
      const sd = fromISO(st.start);
      const ed = st.end ? fromISO(st.end) : null;
      const limitOk = (!st.limitDays) || (d <= new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + Number(st.limitDays) - 1));
      return d >= sd && (!ed || d <= ed) && limitOk;
    });
    actives.forEach(st => {
      const sd = fromISO(st.start);
      const diff = Math.floor((d - sd) / 86400000);
      if (diff >= 0 && diff % 7 === 0) {
        const span = document.createElement('span');
        const t = st.type;
        const cls = t === 'esquejacion' ? 'e' : (t === 'vegetacion' ? 'v' : 'f');
        const initial = t === 'esquejacion' ? 'E' : (t === 'vegetacion' ? 'V' : 'F');
        span.className = `chip ${cls}`;
        span.title = `${t} d+${diff}`;
        span.textContent = `${initial}+${diff}`;
        if (st.color) { span.style.color = st.color; span.style.borderColor = st.color; }
        labels.appendChild(span);
      }
      // Special pruning reminder: day 21 of floración
      if (st.type === 'floracion' && diff === 21) {
        const warn = document.createElement('span');
        warn.className = 'chip warn';
        warn.title = 'Día 21 de floración: podar';
        warn.textContent = 'Poda';
        labels.appendChild(warn);
      }
    });
    // Water change markers for this date (all stages)
    (state.plantStages || []).forEach(st => {
      const items = (st.waterChanges || []).filter(w => w.date === isoDate(d));
      if (!items.length) return;
      items.forEach(w => {
        const t = st.type;
        const cls = t === 'esquejacion' ? 'e' : (t === 'vegetacion' ? 'v' : 'f');
        const span = document.createElement('span');
        span.className = `chip ${cls}`;
        span.title = `Cambio de agua${st.name ? ' - '+st.name : ''}${w.note ? ' — ' + w.note : ''}`;
        span.textContent = 'Agua';
        if (st.color) { span.style.color = st.color; span.style.borderColor = st.color; }
        labels.appendChild(span);
      });
    });
    if (labels.childElementCount) cell.appendChild(labels);

    const key = isoDate(d);
    const all = getEventsForDate(d);
    if (all.length) {
      const listWrap = document.createElement('div');
      listWrap.className = 'evs';
      const sorted = all.slice().sort((a,b) => (a.time||'') < (b.time||'') ? -1 : 1);
      const MAX = 3;
      const take = Math.min(MAX, sorted.length);
      for (let j=0; j<take; j++){
        const ev = sorted[j];
        const row = document.createElement('div'); row.className = 'ev-mini';
      if (ev.time) {
          const t = document.createElement('div'); t.className = 'ev-time'; const rng = ev.end ? `${ev.time}-${ev.end}` : ev.time; t.textContent = rng; row.appendChild(t);
        }
        const line = document.createElement('div'); line.className = 'ev-line';
        const dot = document.createElement('div'); dot.className = 'ev-dot ' + priClass(ev.priority);
        const txt = document.createElement('div'); txt.className = 'ev-text';
        txt.textContent = `${ev.text}`;
        line.appendChild(dot);
        line.appendChild(txt);
        if (!ev._recurring) {
          const btn = document.createElement('button');
          btn.className = 'minibtn danger'; btn.title = 'Eliminar'; btn.textContent = '×';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const arr = state.events[key] || [];
            state.events[key] = arr.filter(x => x.id !== ev.id);
            storage.set('agendaEvents', state.events);
            renderMonth();
            if (isSameDay(d, state.selectedDate)) { renderSelectedDay(); renderWeek(); }
          });
          line.appendChild(btn);
        }
        row.appendChild(line);
        listWrap.appendChild(row);
      }
      if (sorted.length > MAX) {
        const more = document.createElement('div'); more.className = 'more';
        const extra = sorted.length - MAX;
        more.textContent = `+${extra} más`;
        more.style.cursor = 'pointer';
        more.addEventListener('click', (e) => { e.stopPropagation(); state.selectedDate = d; renderMonth(); renderSelectedDay(); });
        listWrap.appendChild(more);
      }
      cell.appendChild(listWrap);
      cell.title = all.map(e => {
        const t = e.time ? (e.end ? `${e.time}-${e.end} ` : `${e.time} `) : '';
        return `${e.priority ? '['+e.priority+'] ' : ''}${t}${e.text}${e._recurring?' (repite)':''}`;
      }).join('\n');
    }

    cell.addEventListener('click', () => {
      state.selectedDate = d;
      if (eventDate) eventDate.value = isoDate(d);
      renderMonth();
      renderSelectedDay();
    });
    calendarGridEl.appendChild(cell);
  }
}

function renderSelectedDay() {
  const d = state.selectedDate || cloneDate(state.today);
  const key = isoDate(d);
  selectedDateLabel.textContent = `Eventos – ${d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}`;
  const list = getEventsForDate(d);
  eventsListEl.innerHTML = '';
  list
    .slice()
    .sort((a,b) => (a.time||'') < (b.time||'') ? -1 : 1)
    .forEach(ev => {
      const li = document.createElement('li');
      li.className = 'event-item';
      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '8px';
      const dot = document.createElement('div'); dot.className = 'ev-dot ' + priClass(ev.priority);
      const left = document.createElement('div'); left.className = 'event-text';
      left.textContent = `${ev.time ? ev.time+' · ' : ''}${ev.text}`;
      leftWrap.appendChild(dot);
      leftWrap.appendChild(left);
      try {
        const tlabel2 = ev.time ? (ev.end ? `${ev.time} – ${ev.end} ` : `${ev.time} – `) : '';
        left.textContent = `${tlabel2}${ev.text}`;
      } catch {}

      const actions = document.createElement('div');
      actions.className = 'row';
      if (ev._recurring) {
        const edit = document.createElement('button'); edit.textContent = 'Editar'; edit.className='minibtn';
        edit.addEventListener('click', () => editSeries(ev._series.groupId));
        const cancel = document.createElement('button'); cancel.textContent = 'Cancelar'; cancel.className='minibtn danger';
        cancel.addEventListener('click', () => cancelSeries(ev._series.groupId));
        const delS = document.createElement('button'); delS.textContent = 'Borrar'; delS.className='minibtn danger';
        delS.addEventListener('click', () => deleteSeries(ev._series.groupId));
        actions.appendChild(edit); actions.appendChild(cancel); actions.appendChild(delS);
      } else {
        const del = document.createElement('button'); del.textContent = 'Borrar'; del.className='minibtn danger';
        del.addEventListener('click', () => {
          const arr = state.events[key] || [];
          state.events[key] = arr.filter(x => x.id !== ev.id);
          storage.set('agendaEvents', state.events);
          renderMonth(); renderSelectedDay(); renderWeek();
        });
        actions.appendChild(del);
      }
      li.appendChild(leftWrap);
      li.appendChild(actions);
      eventsListEl.appendChild(li);
    });

    // Add bills (vencimientos) for the selected day
    const billsToday = (state.bills || []).filter(b => billOccursOn(b, d));
    billsToday.forEach(b => {
      const li = document.createElement('li');
      li.className = 'event-item';
      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '8px';
      const dot = document.createElement('div'); dot.className = 'ev-dot high';
      const left = document.createElement('div'); left.className = 'event-text';
      left.textContent = `Vencimiento: ${b.name} - ${money(amountForBillOnDate(b, d))}`;
      leftWrap.appendChild(dot);
      leftWrap.appendChild(left);
      const actions = document.createElement('div'); actions.className = 'row';
      li.appendChild(leftWrap);
      li.appendChild(actions);
      eventsListEl.appendChild(li);
    });

    // Add important plant stage items if unlocked
    if (state.plantsUnlocked) {
      const actives = state.plantStages.filter(st => {
        const sd = fromISO(st.start);
        const ed = st.end ? fromISO(st.end) : null;
        const limitOk = (!st.limitDays) || (d <= new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + Number(st.limitDays) - 1));
        return d >= sd && (!ed || d <= ed) && limitOk;
      });
      actives.forEach(st => {
        const sd = fromISO(st.start);
        const diff = Math.floor((d - sd) / 86400000);
        if (diff >= 0 && diff % 7 === 0) {
          const li = document.createElement('li'); li.className = 'event-item';
          const leftWrap = document.createElement('div'); leftWrap.style.display='flex'; leftWrap.style.alignItems='center'; leftWrap.style.gap='8px';
          const dot = document.createElement('div'); dot.className='ev-dot med';
          const left = document.createElement('div'); left.className='event-text';
          const nm = st.name ? st.name + ' - ' : '';
          const typ = capitalize(st.type);
          left.textContent = `Etapa ${typ}: ${nm}+${diff} dias`;
          leftWrap.appendChild(dot); leftWrap.appendChild(left);
          const actions = document.createElement('div'); actions.className='row';
          li.appendChild(leftWrap); li.appendChild(actions);
          eventsListEl.appendChild(li);
        }
        if (st.type === 'floracion' && diff === 21) {
          const li = document.createElement('li'); li.className = 'event-item';
          const leftWrap = document.createElement('div'); leftWrap.style.display='flex'; leftWrap.style.alignItems='center'; leftWrap.style.gap='8px';
          const dot = document.createElement('div'); dot.className='ev-dot high';
          const left = document.createElement('div'); left.className = 'event-text';
          left.textContent = 'Floracion: dia 21 - Poda';
          leftWrap.appendChild(dot); leftWrap.appendChild(left);
          const actions = document.createElement('div'); actions.className='row';
          li.appendChild(leftWrap); li.appendChild(actions);
          eventsListEl.appendChild(li);
        }
      });
    }

    // Daily goals for this day
    // Header
    const hdr = document.createElement('li');
    hdr.className = 'event-item';
    const htx = document.createElement('div'); htx.className = 'event-text'; htx.textContent = 'Objetivos del día';
    hdr.appendChild(htx);
    eventsListEl.appendChild(hdr);

    // Add form: title + priority + add
    const addLi = document.createElement('li');
    addLi.className = 'event-item';
    const addWrap = document.createElement('div'); addWrap.className = 'row'; addWrap.style.flex = '1';
    const inTitle = document.createElement('input'); inTitle.type='text'; inTitle.placeholder='Nuevo objetivo del día'; inTitle.style.flex='1';
    const selPrio = document.createElement('select');
    selPrio.innerHTML = '<option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>';
    const btnAdd = document.createElement('button'); btnAdd.textContent = 'Agregar';
    btnAdd.addEventListener('click', () => {
      const title = (inTitle.value||'').trim(); if (!title) return;
      const g = { id: crypto.randomUUID(), title, priority: selPrio.value||'baja', notes:'', done:false, steps:[] };
      state.dailyGoals[key] = state.dailyGoals[key] || [];
      state.dailyGoals[key].push(g);
      storage.set('dailyGoals', state.dailyGoals);
      inTitle.value=''; selPrio.value='baja';
      renderSelectedDay();
    });
    addWrap.appendChild(inTitle); addWrap.appendChild(selPrio);
    addLi.appendChild(addWrap); addLi.appendChild(btnAdd);
    eventsListEl.appendChild(addLi);

    // List daily goals
    const dayGoals = (state.dailyGoals[key]||[]).slice().sort((a,b)=>{
      // not done first, then priority, then title
      const doneA = a.done?1:0, doneB=b.done?1:0; if (doneA!==doneB) return doneA-doneB;
      const pa = priRank(a.priority||'baja'), pb = priRank(b.priority||'baja'); if (pa!==pb) return pb-pa;
      return (a.title||'').localeCompare(b.title||'');
    });
    dayGoals.forEach(g => {
      const li = document.createElement('li');
      // reuse goal-card layout
      const card = document.createElement('div'); card.className = 'goal-card';
      const left = document.createElement('div');
      const head = document.createElement('div'); head.className = 'goal-head';
      const dot = document.createElement('div'); dot.className = 'ev-dot ' + priClass(g.priority);
      const title = document.createElement('div'); title.className = 'goal-title';
      title.textContent = g.title + (g.done ? ' (completado)' : '');
      if (g.done) title.classList.add('done');
      const meta = document.createElement('div'); meta.className = 'goal-meta'; meta.textContent = [g.priority||''].filter(Boolean).join(' · ');
      head.appendChild(dot); head.appendChild(title); left.appendChild(head); left.appendChild(meta);
      const prog = goalProgress(g);
      const bar = document.createElement('div'); bar.className = 'progress';
      const fill = document.createElement('div'); fill.style.width = `${prog.p}%`; bar.appendChild(fill); left.appendChild(bar);

      const steps = document.createElement('ul'); steps.className = 'goal-steps';
      (g.steps||[]).forEach(s => {
        const it = document.createElement('li'); it.className = 'goal-step';
        const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=!!s.done; cb.addEventListener('change', ()=>{ s.done = !!cb.checked; storage.set('dailyGoals', state.dailyGoals); renderSelectedDay(); });
        const tx = document.createElement('div'); tx.textContent = s.text;
        const del = document.createElement('button'); del.className = 'minibtn danger'; del.textContent = 'Borrar'; del.addEventListener('click', ()=>{ g.steps = (g.steps||[]).filter(x=>x.id!==s.id); storage.set('dailyGoals', state.dailyGoals); renderSelectedDay(); });
        it.appendChild(cb); it.appendChild(tx); it.appendChild(del);
        steps.appendChild(it);
      });
      left.appendChild(steps);
      const inWrap = document.createElement('div'); inWrap.className = 'row'; inWrap.style.marginTop='6px';
      const inStep = document.createElement('input'); inStep.type='text'; inStep.placeholder='Nueva tarea'; inStep.style.flex='1';
      const addBtn = document.createElement('button'); addBtn.textContent='Agregar tarea';
      addBtn.addEventListener('click', ()=>{ const t=(inStep.value||'').trim(); if(!t) return; g.steps=g.steps||[]; g.steps.push({id:crypto.randomUUID(), text:t, done:false}); inStep.value=''; storage.set('dailyGoals', state.dailyGoals); renderSelectedDay(); });
      inWrap.appendChild(inStep); inWrap.appendChild(addBtn); left.appendChild(inWrap);

      const actions = document.createElement('div'); actions.className = 'stack';
      const toggle = document.createElement('button'); toggle.className='minibtn'; toggle.textContent = g.done ? 'Reabrir' : 'Completar';
      toggle.addEventListener('click', ()=>{ g.done = !g.done; if (g.done) { (g.steps||[]).forEach(s=>s.done=true); } storage.set('dailyGoals', state.dailyGoals); renderSelectedDay(); });
      const edit = document.createElement('button'); edit.className='minibtn'; edit.textContent='Editar';
      edit.addEventListener('click', async ()=>{
        const res = await showFormModal({ title:'Editar objetivo del día', fields:[
          { name:'title', label:'Titulo', value:g.title, required:true },
          { name:'priority', label:'Prioridad', type:'select', value:g.priority||'baja', options:[{value:'baja'},{value:'media'},{value:'alta'}] },
          { name:'notes', label:'Notas (opcional)', value:g.notes||'' }
        ]});
        if(!res) return;
        Object.assign(g, { title:(res.title||'').trim(), priority:res.priority||'baja', notes:(res.notes||'').trim() });
        storage.set('dailyGoals', state.dailyGoals); renderSelectedDay();
      });
      const del = document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar';
      del.addEventListener('click', ()=>{
        if (!confirm('¿Borrar objetivo del día?')) return;
        state.dailyGoals[key] = (state.dailyGoals[key]||[]).filter(x=>x.id!==g.id);
        storage.set('dailyGoals', state.dailyGoals);
        renderSelectedDay();
      });
      actions.appendChild(toggle); actions.appendChild(edit); actions.appendChild(del);

      card.appendChild(left); card.appendChild(actions);
      li.appendChild(card);
      eventsListEl.appendChild(li);
    });
  }

function timeAddHM(tm, minutes){
  if (!tm) return '';
  const [h,m] = tm.split(':').map(Number);
  let total = h*60 + m + (Number(minutes)||0);
  if (!isFinite(total)) return tm;
  // clamp within the same day 00:00..23:59
  total = Math.max(0, Math.min(23*60+59, total));
  const hh = pad2(Math.floor(total/60));
  const mm = pad2(total%60);
  return `${hh}:${mm}`;
}

// Schedule a rollover at midnight to carry pending daily goals to the next day
function scheduleMidnightRollover() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2); // a tiny buffer past 00:00
  const ms = Math.max(1000, next.getTime() - now.getTime());
  setTimeout(async () => {
    try { doMidnightRollover(); } finally { scheduleMidnightRollover(); }
  }, ms);
}

function doMidnightRollover() {
  const prev = cloneDate(state.today);
  const fromKey = isoDate(prev);
  // Advance today
  const nextDay = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
  state.today = nextDay;
  const toKey = isoDate(nextDay);

  // Move pending goals from prev to next day; keep completed on prev
  const arr = (state.dailyGoals[fromKey] || []).slice();
  if (arr.length) {
    const done = arr.filter(g => !!g.done);
    const pending = arr.filter(g => !g.done);
    if (pending.length) {
      state.dailyGoals[toKey] = (state.dailyGoals[toKey] || []).concat(pending);
    }
    if (done.length) state.dailyGoals[fromKey] = done; else delete state.dailyGoals[fromKey];
    storage.set('dailyGoals', state.dailyGoals);
  }
  storage.set('lastOpenDate', toKey);

  // If the selected date was the previous today, shift selection to the new today
  if (isSameDay(state.selectedDate, prev)) {
    state.selectedDate = cloneDate(state.today);
    if (eventDate) eventDate.value = toKey;
  }
  // Keep quick forms dates in sync
  if (typeof weekEventDate !== 'undefined' && weekEventDate) weekEventDate.value = toKey;
  if (typeof finDate !== 'undefined' && finDate) finDate.value = toKey;

  // Refresh views
  renderMonth();
  renderSelectedDay();
  renderWeek();
}

eventForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = eventDate?.value || isoDate(state.selectedDate || state.today);
  const priority = eventPriority?.value || 'baja';
  const txt = eventText.value.trim();
  const tm = eventTime.value || '';
  let te = eventEndTime?.value || '';
  if (!te && tm) te = timeAddHM(tm, 60);
  if (!txt) return;
  if (eventRecur?.checked && ((eventRecurWeekly?.checked) || Number(eventRecurDays.value) >= 2)) {
    const series = {
      groupId: crypto.randomUUID(),
      startDate: key,
      time: tm,
      end: te,
      text: txt,
      priority,
      every: eventRecurWeekly?.checked ? 7 : Number(eventRecurDays.value),
      kind: eventRecurWeekly?.checked ? 'weekly' : 'days',
      until: eventRecurUntil.value || '',
      times: Number(eventRecurTimes?.value || 0) || 0,
      canceled: false
    };
    state.recurring.push(series);
    storage.set('recurringEvents', state.recurring);
  } else {
    const item = { id: crypto.randomUUID(), time: tm, end: te, text: txt, priority };
    state.events[key] = state.events[key] || [];
    state.events[key].push(item);
    storage.set('agendaEvents', state.events);
  }
  eventForm.reset();
  renderMonth();
  renderSelectedDay();
  renderWeek();
});

// Weekly agenda
const weekLabelEl = document.getElementById('week-label');
const weekListEl = document.getElementById('week-list');
document.getElementById('prev-week').addEventListener('click', () => { state.weekStart.setDate(state.weekStart.getDate()-7); renderWeek(); });
document.getElementById('next-week').addEventListener('click', () => { state.weekStart.setDate(state.weekStart.getDate()+7); renderWeek(); });
document.getElementById('this-week').addEventListener('click', () => { state.weekStart = getMonday(state.today); renderWeek(); });

const weekGridEl = document.getElementById('week-grid');
const weekAlertsEl = document.getElementById('week-alerts');
state.weeklyClasses = storage.get('weeklyClasses', []);
state.academicTasks = storage.get('academicTasks', []);
const classForm = document.getElementById('class-form');
const classSubject = document.getElementById('class-subject');
const classDay = document.getElementById('class-day');
const classStart = document.getElementById('class-start');
const classEnd = document.getElementById('class-end');
const classColor = document.getElementById('class-color');
const classTotal = document.getElementById('class-total');
const classStartDate = document.getElementById('class-start-date');
const classEndDate = document.getElementById('class-end-date');
const taskForm = document.getElementById('task-form');
const taskType = document.getElementById('task-type');
const weekEventEnd = document.getElementById('week-event-end');
const taskTitle = document.getElementById('task-title');
const taskDate = document.getElementById('task-date');
const taskList = document.getElementById('task-list');
const classList = document.getElementById('class-list');

const START_HOUR = 8, END_HOUR = 23;

// Weekly quick event form
const weekEventForm = document.getElementById('week-event-form');
const weekEventPriority = document.getElementById('week-event-priority');
const weekEventDate = document.getElementById('week-event-date');
const weekEventTime = document.getElementById('week-event-time');
const weekEventText = document.getElementById('week-event-text');
const weekEventRecur = document.getElementById('week-event-recur');
const weekEventRecurDays = document.getElementById('week-event-recur-days');
const weekEventRecurWeekly = document.getElementById('week-event-recur-weekly');
const weekEventRecurTimes = document.getElementById('week-event-recur-times');
const weekEventRecurUntil = document.getElementById('week-event-recur-until');

function renderWeek(){
  const start = getMonday(state.weekStart);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate()+6);
  weekLabelEl.textContent = `${start.toLocaleDateString('es-AR', { day:'numeric', month:'long' })} – ${end.toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}`;

  // Ajustar label semanal con mes numérico
  {
    const sD = start.getDate();
    const sM = pad2(start.getMonth()+1);
    const eD = end.getDate();
    const eM = pad2(end.getMonth()+1);
    const eY = end.getFullYear();
    weekLabelEl.textContent = `${sD}/${sM} – ${eD}/${eM}/${eY}`;
  }

  // Alerts
  weekAlertsEl.innerHTML = '';
  const today = state.today;
  state.academicTasks.map(t=>({...t,due:fromISO(t.date)})).map(t=>({...t,days:Math.floor((t.due-today)/86400000)})).filter(t=>t.days===14||t.days===7).sort((a,b)=>a.days-b.days).forEach(a=>{
    const div=document.createElement('div'); div.className='alert'; div.textContent=`${a.days===14?'Faltan 2 semanas':'Falta 1 semana'} · ${a.type.toUpperCase()}: ${a.title} (${a.date})`; weekAlertsEl.appendChild(div);
  });

  // (Las alertas semanales de vencimientos/etapas se muestran en los headers por día)

  // Build grid
  weekGridEl.innerHTML='';
  const headerTime=document.createElement('div'); headerTime.className='wg-head-time'; weekGridEl.appendChild(headerTime);
  for(let i=0;i<7;i++){ const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i); const hd=document.createElement('div'); hd.className='wg-head-day'; hd.textContent=d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric'}); weekGridEl.appendChild(hd); }
  for(let h=START_HOUR; h<END_HOUR; h++){ const tc=document.createElement('div'); tc.className='wg-time-col'; const inner=document.createElement('div'); inner.className='wg-time-cell'; inner.textContent=`${pad2(h)}:00`; tc.appendChild(inner); weekGridEl.appendChild(tc); for(let i=0;i<7;i++){ const cell=document.createElement('div'); cell.className='wg-hour-cell'; weekGridEl.appendChild(cell);} }
  // Plant stage badges in headers
  addWeekPlantBadges(start);
  // Bills badges in headers
  addWeekBillsBadges(start);
  // Alternar color de columnas (stripes)
  addWeekStripes();
  // Overlay absolute for class blocks
  const overlay = document.createElement('div'); overlay.className = 'wg-overlay'; weekGridEl.appendChild(overlay);
  state.weeklyClasses.forEach(c=>placeClassBlock(c, start, overlay));

  // Events overlay (timed and all-day)
  placeWeekEvents(start, overlay);
  // Daily goals in earliest free time slots of each day
  placeDailyGoalsTop(start, overlay);

  // Highlight today's column
  highlightTodayWeek(start);

  // Tasks list
  taskList.innerHTML='';
  state.academicTasks.slice().sort((a,b)=>a.date<b.date?-1:1).forEach(t=>{ const li=document.createElement('li'); li.className='event-item'; const tx=document.createElement('div'); tx.className='event-text'; tx.textContent=`${t.date} · ${t.type.toUpperCase()} · ${t.title}`; const row=document.createElement('div'); row.className='row'; const del=document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar'; del.addEventListener('click',()=>{ state.academicTasks=state.academicTasks.filter(x=>x.id!==t.id); storage.set('academicTasks', state.academicTasks); renderWeek(); }); row.appendChild(del); li.appendChild(tx); li.appendChild(row); taskList.appendChild(li); });

  // classes list with delete
  if (classList){
    classList.innerHTML='';
    const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    state.weeklyClasses.slice().sort((a,b)=> a.day-b.day || a.start.localeCompare(b.start)).forEach(c=>{ const li=document.createElement('li'); li.className='event-item'; const tx=document.createElement('div'); tx.className='event-text'; const totalTxt=c.total?` · ${c.total} clases`:''; tx.textContent=`${dayNames[c.day]} ${c.start}-${c.end} · ${c.subject}${totalTxt}`; const row=document.createElement('div'); row.className='row'; const del=document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar'; del.addEventListener('click',()=>{ state.weeklyClasses=state.weeklyClasses.filter(x=>x.id!==c.id); storage.set('weeklyClasses', state.weeklyClasses); renderWeek(); }); row.appendChild(del); li.appendChild(tx); li.appendChild(row); classList.appendChild(li); });
    // Enhance rendered rows: add Edit button and range
    try {
      const sorted = state.weeklyClasses.slice().sort((a,b)=> a.day-b.day || a.start.localeCompare(b.start));
      const names = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      Array.from(classList.children).forEach((li,i)=>{
        const c = sorted[i]; if (!c) return;
        const tx = li.querySelector('.event-text');
        if (tx) {
          const totalTxt = c.total ? ` · ${c.total} clases` : '';
          const rangeTxt = (c.startDate && c.endDate) ? ` · ${c.startDate} → ${c.endDate}` : '';
          tx.textContent = `${names[c.day]} ${c.start}-${c.end} · ${c.subject}`;
        }
        const row = li.querySelector('.row');
        if (row && !row.querySelector('[data-edit]')) {
          const edit=document.createElement('button'); edit.className='minibtn'; edit.textContent='Editar'; edit.setAttribute('data-edit', c.id);
          edit.addEventListener('click', ()=> editClass(c.id));
          row.insertBefore(edit, row.firstChild);
        }
      });
    } catch {}
  }
}

function placeClassBlock(c, weekStart, overlay){
  const col = (Number(c.day)+6)%7; // 0..6
  const hourCells = weekGridEl.querySelectorAll('.wg-hour-cell'); if (!hourCells.length) return;
  const gridRect = weekGridEl.getBoundingClientRect();
  const dayCell = hourCells[col]; if (!dayCell) return; const dayRect = dayCell.getBoundingClientRect();
  // Check date range for this class (if provided)
  if (c.startDate && c.endDate) {
    const dayDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+col);
    const sd = fromISO(c.startDate);
    const ed = fromISO(c.endDate);
    if (dayDate < sd || dayDate > ed) return;
  }
  const firstHourTop = dayRect.top - gridRect.top; const dayWidth = dayRect.width; const dayLeft = dayRect.left - gridRect.left;
  const totalMin = (END_HOUR-START_HOUR)*60; const [sh,sm]=(c.start||'0:0').split(':').map(Number); const [eh,em]=(c.end||'0:0').split(':').map(Number);
  const startMin=(sh*60+sm)-START_HOUR*60; const endMin=(eh*60+em)-START_HOUR*60;
  const hourH = dayRect.height; // actual height per hour cell
  const contentHeight = hourH * (END_HOUR-START_HOUR);
  const top = firstHourTop + Math.max(0, startMin/totalMin*contentHeight);
  const height = Math.max(12, (endMin-startMin)/totalMin*contentHeight);
  const block=document.createElement('div'); block.className='class-block'; const bg=c.color?hexToRgba(c.color,.18):'rgba(96,165,250,.15)'; const br=c.color?hexToRgba(c.color,.45):'rgba(96,165,250,.4)';
  block.style.top=`${top}px`; block.style.left = `${dayLeft}px`; block.style.width = `${dayWidth}px`; block.style.height=`${height}px`; block.style.background=bg; block.style.borderColor=br;
  const totalTxt = c.total ? ` · ${c.total} clases` : '';
  block.innerHTML=`<span class="t">${c.start} - ${c.end}</span>${escapeHtml(c.subject)}`;
  overlay.appendChild(block);
  // Override to show remaining classes if total provided
  if (c.total !== undefined && c.total !== null) {
    const remain = Math.max(0, Number(c.total) - (Number(c.done||0)));
    const remainTxt = ` · quedan ${remain}`;
    block.innerHTML = `<span class="t">${c.start} - ${c.end}</span>${escapeHtml(c.subject)}`;
  }
}

function placeWeekEvents(weekStart, overlay){
  const hourCells = weekGridEl.querySelectorAll('.wg-hour-cell'); if (!hourCells.length) return;
  const gridRect = weekGridEl.getBoundingClientRect();
  const totalMin = (END_HOUR-START_HOUR)*60;
  const hourH = hourCells[0]?.getBoundingClientRect().height || 48;
  const contentHeight = hourH * (END_HOUR-START_HOUR);

  for (let i=0; i<7; i++){
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+i);
    const dayCell = hourCells[i]; if (!dayCell) continue;
    const dayRect = dayCell.getBoundingClientRect();
    const firstHourTop = dayRect.top - gridRect.top;
    const dayWidth = dayRect.width;
    const dayLeft = dayRect.left - gridRect.left;

    const list = getEventsForDate(d).slice().sort((a,b)=> (a.time||'') < (b.time||'') ? -1 : 1);
    const buckets = {};
    list.forEach(ev => {
      const key = ev.time || 'all';
      const idx = (buckets[key] = (buckets[key]||0)+1) - 1;
      const minH = 18;
      let sh=START_HOUR, sm=0;
      if (ev.time && /^\d{1,2}:\d{2}$/.test(ev.time)) {
        [sh, sm] = ev.time.split(':').map(Number);
      }
      const startMin = (sh*60+sm) - START_HOUR*60;
      const top = firstHourTop + Math.max(0, (startMin/totalMin)*contentHeight) + idx*(minH+2);

      const block = document.createElement('div');
      block.className = `event-block ${priClass(ev.priority)}`;
      block.style.top = `${top}px`;
      block.style.left = `${dayLeft}px`;
      block.style.width = `${dayWidth}px`;
      block.style.height = `${minH}px`;
      const tline = ev.time ? `<span class="t">${ev.end ? (ev.time + ' – ' + ev.end) : ev.time}</span>` : '';
      block.innerHTML = `${tline}${escapeHtml(ev.text)}`;
      block.title = `${ev.priority ? '['+ev.priority+'] ' : ''}${ev.time ? (ev.end ? (ev.time+'-'+ev.end+' ') : (ev.time+' ')) : ''}${ev.text}${ev._recurring?' (repite)':''}`;
      try {
        let eh=sh, em=sm;
        if (ev.end && /^\d{1,2}:\d{2}$/.test(ev.end)) { [eh, em] = ev.end.split(':').map(Number); }
        else if (ev.time) { const added = timeAddHM(ev.time, 60); [eh, em] = added.split(':').map(Number); }
        const startMin2 = (sh*60+sm) - START_HOUR*60;
        let endMin2 = (eh*60+em) - START_HOUR*60;
        const maxMin2 = (END_HOUR-START_HOUR)*60;
        endMin2 = Math.max(startMin2 + 10, Math.min(maxMin2, endMin2));
        const top2 = firstHourTop + Math.max(0, (startMin2/totalMin)*contentHeight) + (ev.time ? idx*2 : idx*(minH+2));
        const height2 = Math.max(minH, ((endMin2 - startMin2)/totalMin)*contentHeight - (ev.time ? idx*2 : 0));
        block.style.top = `${top2}px`;
        block.style.height = `${height2}px`;
      } catch {}

      // Click actions
      block.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = isoDate(d);
        if (ev._recurring && ev._series) {
          const action = prompt('Serie: escribir "editar", "cancelar" o "borrar"', 'editar');
          if (action === null) return;
          const a = action.trim().toLowerCase();
          if (a.startsWith('bor')) { deleteSeries(ev._series.groupId); }
          else if (a.startsWith('can')) { cancelSeries(ev._series.groupId); }
          else { editSeries(ev._series.groupId); }
        } else {
          if (confirm('¿Borrar este evento?')) {
            const arr = state.events[key] || [];
            state.events[key] = arr.filter(x => x.id !== ev.id);
            storage.set('agendaEvents', state.events);
            renderMonth(); renderSelectedDay(); renderWeek();
          }
        }
      });

      overlay.appendChild(block);
    });
  }
}

// Place daily goals starting from early hours, avoiding overlaps with existing blocks
function placeDailyGoalsTop(weekStart, overlay){
  const hourCells = weekGridEl.querySelectorAll('.wg-hour-cell'); if (!hourCells.length) return;
  const gridRect = weekGridEl.getBoundingClientRect();
  const hourH = hourCells[0]?.getBoundingClientRect().height || 48;
  const contentHeight = hourH * (END_HOUR-START_HOUR);
  const minH = 18;

  for (let i=0; i<7; i++){
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+i);
    const dayCell = hourCells[i]; if (!dayCell) continue;
    const dayRect = dayCell.getBoundingClientRect();
    const firstHourTop = dayRect.top - gridRect.top;
    const dayWidth = dayRect.width;
    const dayLeft = dayRect.left - gridRect.left;

    const key = isoDate(d);
    const goals = (state.dailyGoals[key]||[]).slice().sort((a,b)=>{
      const da=a.done?1:0, db=b.done?1:0; if(da!==db) return da-db;
      const pa = priRank(a.priority||'baja'), pb = priRank(b.priority||'baja'); if (pa!==pb) return pb-pa;
      return (a.title||'').localeCompare(b.title||'');
    });
    if (!goals.length) continue;

    // Collect occupied intervals for this day from existing blocks
    const occ = [];
    overlay.querySelectorAll('.event-block, .class-block').forEach(el=>{
      if (el.style.left !== `${dayLeft}px`) return;
      const t = parseFloat(el.style.top||'0');
      const h = parseFloat(el.style.height||'0');
      if (isFinite(t) && isFinite(h) && h>0) occ.push([t, t+h]);
    });
    const placed = [];
    const maxTop = firstHourTop + contentHeight - minH;
    const step = minH + 2;
    for (const g of goals){
      let y = firstHourTop;
      let placedY = null;
      outer: while (y <= maxTop){
        const a = y, b = y + minH;
        for (const [s,e] of occ){ if (!(b <= s || a >= e)) { y += step; continue outer; } }
        for (const [s,e] of placed){ if (!(b <= s || a >= e)) { y += step; continue outer; } }
        placedY = y; break;
      }
      if (placedY === null) break;
      placed.push([placedY, placedY+minH]);
      const block = document.createElement('div');
      block.className = 'event-block goal';
      block.style.top = `${placedY}px`;
      block.style.left = `${dayLeft}px`;
      block.style.width = `${dayWidth}px`;
      block.style.height = `${minH}px`;
      const title = escapeHtml(g.title || 'Objetivo');
      block.innerHTML = `${g.done?'<span class=\"t\">✔</span>':''}${title}`;
      block.title = `${g.priority? '['+g.priority+'] ' : ''}${g.title}${g.done?' (completado)':''}`;
      overlay.appendChild(block);
    }
  }
}

function placeDailyGoals(weekStart, overlay){
  const hourCells = weekGridEl.querySelectorAll('.wg-hour-cell'); if (!hourCells.length) return;
  const gridRect = weekGridEl.getBoundingClientRect();
  const hourH = hourCells[0]?.getBoundingClientRect().height || 48;
  const contentHeight = hourH * (END_HOUR-START_HOUR);
  const minH = 18;

  for (let i=0; i<7; i++){
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+i);
    const dayCell = hourCells[i]; if (!dayCell) continue;
    const dayRect = dayCell.getBoundingClientRect();
    const firstHourTop = dayRect.top - gridRect.top;
    const dayWidth = dayRect.width;
    const dayLeft = dayRect.left - gridRect.left;

    const key = isoDate(d);
    const goals = (state.dailyGoals[key]||[]).slice().sort((a,b)=>{
      const da=a.done?1:0, db=b.done?1:0; if(da!==db) return da-db;
      const pa = priRank(a.priority||'baja'), pb = priRank(b.priority||'baja'); if (pa!==pb) return pb-pa;
      return (a.title||'').localeCompare(b.title||'');
    });
    if (!goals.length) continue;

    const count = Math.min(goals.length, Math.floor(contentHeight/(minH+2))); // cap to fit
    for (let j=0; j<count; j++){
      const g = goals[j];
      const bottomIdx = count - 1 - j; // stack from bottom up
      const top = firstHourTop + contentHeight - (bottomIdx+1)*(minH+2);
      const block = document.createElement('div');
      block.className = 'event-block goal';
      block.style.top = `${top}px`;
      block.style.left = `${dayLeft}px`;
      block.style.width = `${dayWidth}px`;
      block.style.height = `${minH}px`;
      const title = escapeHtml(g.title || 'Objetivo');
      block.innerHTML = `${g.done?'<span class="t">✔</span>':''}${title}`;
      block.title = `${g.priority? '['+g.priority+'] ' : ''}${g.title}${g.done?' (completado)':''}`;
      overlay.appendChild(block);
    }
  }
}

function highlightTodayWeek(weekStart){
  const today = state.today;
  const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate()+6);
  if (today < start || today > end) return;
  const c = Math.floor((today - start)/86400000); // 0..6
  const heads = weekGridEl.querySelectorAll('.wg-head-day');
  if (heads[c]) heads[c].classList.add('today');
  const hourCells = weekGridEl.querySelectorAll('.wg-hour-cell');
  const rows = END_HOUR - START_HOUR;
  for (let r=0; r<rows; r++){
    const idx = r*7 + c;
    const cell = hourCells[idx];
    if (cell) cell.classList.add('today');
  }
}

function addWeekPlantBadges(weekStart){
  const heads = weekGridEl.querySelectorAll('.wg-head-day');
  if (!heads.length) return;
  for (let i=0; i<7; i++){
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+i);
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '4px';
    wrap.style.justifyContent = 'center';
    wrap.style.flexWrap = 'wrap';
    wrap.style.marginTop = '2px';

    const actives = state.plantStages.filter(st => {
      const sd = fromISO(st.start);
      const ed = st.end ? fromISO(st.end) : null;
      const limitOk = (!st.limitDays) || (d <= new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + Number(st.limitDays) - 1));
      return d >= sd && (!ed || d <= ed) && limitOk;
    });
    actives.forEach(st => {
      const sd = fromISO(st.start);
      const diff = Math.floor((d - sd) / 86400000);
      if (diff >= 0 && diff % 7 === 0) {
        const span = document.createElement('span');
        const t = st.type;
        const cls = t === 'esquejacion' ? 'e' : (t === 'vegetacion' ? 'v' : 'f');
        const initial = t === 'esquejacion' ? 'E' : (t === 'vegetacion' ? 'V' : 'F');
        span.className = `chip ${cls}`;
        span.title = `${t} d+${diff}`;
        span.textContent = `${initial}+${diff}`;
        if (st.color) { span.style.color = st.color; span.style.borderColor = st.color; }
        wrap.appendChild(span);
      }
      if (st.type === 'floracion' && diff === 21) {
        const warn = document.createElement('span');
        warn.className = 'chip warn';
        warn.title = 'Día 21 de floración: podar';
        warn.textContent = 'Poda';
        wrap.appendChild(warn);
      }
    });

    if (wrap.childElementCount) heads[i].appendChild(wrap);
  }
}

function addWeekBillsBadges(weekStart){
  const heads = weekGridEl.querySelectorAll('.wg-head-day');
  if (!heads.length) return;
  for (let i=0; i<7; i++){
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+i);
    const bills = (state.bills||[]).filter(b => billOccursOn(b, d));
    if (!bills.length) continue;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '4px';
    wrap.style.justifyContent = 'center';
    wrap.style.flexWrap = 'wrap';
    wrap.style.marginTop = '2px';
    bills.forEach(b => {
      const span = document.createElement('span');
      span.className = 'chip';
      const amt = money(amountForBillOnDate(b, d));
      span.title = `Vence: ${b.name} ${amt}`;
      span.textContent = `${b.name} ${amt}`;
      wrap.appendChild(span);
    });
    heads[i].appendChild(wrap);
  }
}

async function editClass(id){
  const c = state.weeklyClasses.find(x=>x.id===id); if (!c) return;
  const dayOpts = [
    {value:'1', label:'Lunes'},
    {value:'2', label:'Martes'},
    {value:'3', label:'Miércoles'},
    {value:'4', label:'Jueves'},
    {value:'5', label:'Viernes'},
    {value:'6', label:'Sábado'},
    {value:'0', label:'Domingo'}
  ];
  const res = await showFormModal({
    title: 'Editar materia',
    fields: [
      { name: 'subject', label: 'Materia', type: 'text', value: c.subject, required: true },
      { name: 'day', label: 'Día', type: 'select', options: dayOpts, value: String(c.day) },
      { name: 'start', label: 'Hora inicio', type: 'time', value: c.start, required: true },
      { name: 'end', label: 'Hora fin', type: 'time', value: c.end, required: true },
      { name: 'startDate', label: 'Inicio (fecha)', type: 'date', value: c.startDate || '' },
      { name: 'endDate', label: 'Fin (fecha)', type: 'date', value: c.endDate || '' },
      { name: 'color', label: 'Color', type: 'color', value: c.color || '#60a5fa' }
    ]
  });
  if (!res) return;
  const day = Number(res.day);
  const sd = res.startDate || '';
  const ed = res.endDate || '';
  const total = (sd && ed) ? countDowBetween(day, sd, ed) : c.total;
  Object.assign(c, { subject: (res.subject||'').trim(), day, start: res.start, end: res.end, startDate: sd, endDate: ed, color: res.color, total });
  storage.set('weeklyClasses', state.weeklyClasses);
  renderWeek();
}

function hexToRgba(hex,a){ const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex||''); if(!m) return hex; const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16); return `rgba(${r}, ${g}, ${b}, ${a})`; }

function addWeekStripes(){
  // remove existing stripes
  const olds = weekGridEl.querySelectorAll('.wg-stripes'); olds.forEach(n=>n.remove());
  const stripes = document.createElement('div'); stripes.className = 'wg-stripes'; weekGridEl.appendChild(stripes);
  const cells = weekGridEl.querySelectorAll('.wg-hour-cell'); if (!cells.length) return;
  const gridRect = weekGridEl.getBoundingClientRect();
  for (let col=0; col<7; col++) {
    const rect = cells[col].getBoundingClientRect();
    const s = document.createElement('div'); s.className='wg-stripe'+(col%2?' alt':'');
    s.style.left = `${rect.left - gridRect.left}px`; s.style.width = `${rect.width}px`;
    stripes.appendChild(s);
  }
}

classForm?.addEventListener('submit',(e)=>{
  e.preventDefault();
  const subject = (classSubject.value||'').trim();
  const day = Number(classDay.value);
  const start = classStart.value;
  const end = classEnd.value;
  const sd = classStartDate?.value;
  const ed = classEndDate?.value;
  if (!subject || !start || !end) return;
  let totalCalc = Number(classTotal?.value||0) || 0;
  if (sd && ed) {
    totalCalc = countDowBetween(day, sd, ed);
  }
  const item={ id:crypto.randomUUID(), subject, day, start, end, color:classColor.value, startDate: sd||'', endDate: ed||'', total: totalCalc, done: 0 };
  state.weeklyClasses.push(item);
  storage.set('weeklyClasses', state.weeklyClasses);
  classForm.reset();
  if (classColor) classColor.value='#60a5fa';
  renderWeek();
});

function countDowBetween(day, startISO, endISO){
  // day: 0..6 (Dom..Sáb). Inclusive range
  try {
    const start = fromISO(startISO); const end = fromISO(endISO);
    if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end < start) return 0;
    const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const shift = (day - first.getDay() + 7) % 7;
    first.setDate(first.getDate() + shift);
    if (first > end) return 0;
    const daysSpan = Math.floor((end - first)/86400000);
    return 1 + Math.floor(daysSpan / 7);
  } catch { return 0; }
}

// Auto-recalculate total when range or day changes
[classDay, classStartDate, classEndDate].forEach(el => el?.addEventListener('change', () => {
  const day = Number(classDay?.value||NaN);
  const sd = classStartDate?.value; const ed = classEndDate?.value;
  if (!isNaN(day) && sd && ed) {
    const n = countDowBetween(day, sd, ed);
    if (classTotal) { classTotal.value = String(n); }
  }
}));

taskForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const t={ id:crypto.randomUUID(), type:taskType.value, title:taskTitle.value.trim(), date:taskDate.value }; if(!t.title||!t.date) return; state.academicTasks.push(t); storage.set('academicTasks', state.academicTasks); taskForm.reset(); renderWeek(); });

// Finanzas
const finMonth = document.getElementById('fin-month');
const finTodayBtn = document.getElementById('fin-today');
const finForm = document.getElementById('fin-form');
const finType = document.getElementById('fin-type');
const finDate = document.getElementById('fin-date');
const finCategory = document.getElementById('fin-category');
const finDesc = document.getElementById('fin-desc');
const finAmount = document.getElementById('fin-amount');
const finTableBody = document.querySelector('#fin-table tbody');
const sumIngresos = document.getElementById('sum-ingresos');
const sumGastos = document.getElementById('sum-gastos');
const sumBalance = document.getElementById('sum-balance');
const finIncomeList = document.getElementById('fin-income-list');
const futureIncomeTotalEl = document.getElementById('future-income-total');
const futureExpenseTotalEl = document.getElementById('future-expense-total');
const futureBalanceTotalEl = document.getElementById('future-balance-total');

function currentMonthStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }

function renderFinanzas() {
  const monthStr = finMonth.value || currentMonthStr(state.today);
  finMonth.value = monthStr;
  const [y, m] = monthStr.split('-').map(Number);
  const rows = state.txs.filter(tx => tx.date.startsWith(monthStr));
  let ingresos = 0, gastos = 0;
  finTableBody.innerHTML = '';
  rows.sort((a,b) => a.date < b.date ? -1 : 1).forEach(tx => {
    if (tx.type === 'ingreso') ingresos += tx.amount; else gastos += tx.amount;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tx.date}</td>
      <td style="color:${tx.type==='ingreso'?'#86efac':'#fecaca'}">${tx.type}</td>
      <td>${tx.category}</td>
      <td>${tx.desc||''}</td>
      <td class="num">${money(tx.amount * (tx.type==='ingreso'?1:-1))}</td>
      <td class="num"><button class="danger" data-del="${tx.id}">Eliminar</button></td>
    `;
    finTableBody.appendChild(tr);
  });
  sumIngresos.textContent = money(ingresos);
  sumGastos.textContent = money(gastos);
  sumBalance.textContent = money(ingresos - gastos);

  // Fill incomes list
  if (finIncomeList){
    finIncomeList.innerHTML = '';
    rows.filter(tx=>tx.type==='ingreso').forEach(tx=>{
      const li=document.createElement('li'); li.className='event-item';
      const txd=document.createElement('div'); txd.className='event-text';
      txd.textContent = `${tx.date} · ${tx.category}${tx.desc? ' · '+tx.desc:''} · ${money(tx.amount)}`;
      const row=document.createElement('div'); row.className='row';
      const del=document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar'; del.addEventListener('click',()=>{ state.txs = state.txs.filter(t => t.id !== tx.id); storage.set('financeTransactions', state.txs); renderFinanzas(); });
      row.appendChild(del);
      li.appendChild(txd); li.appendChild(row);
      finIncomeList.appendChild(li);
    });
  }
  // Refresh chart since txs may change
  renderExpensesChart();
  renderExpensePie();
}

function yearFromISO(iso){ const [y]= (iso||'').split('-').map(Number); return y||state.today.getFullYear(); }

function populateFinCategoriesFromYear(year){
  if (!finCategory) return;
  ensureYearDefaults(year);
  const y = String(year);
  const cats = (state.expenseYearly[y]?.cats)||[];
  const current = finCategory.value;
  finCategory.innerHTML = '';
  cats.forEach((c, idx)=>{
    const opt = document.createElement('option'); opt.value = c.name; opt.textContent = c.name; finCategory.appendChild(opt);
  });
  if (cats.length && (!current || !cats.some(c=>c.name===current))) {
    finCategory.value = cats[0].name;
  } else if (current) {
    finCategory.value = current;
  }
}

finTableBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del]');
  if (!btn) return;
  const id = btn.getAttribute('data-del');
  const tx = state.txs.find(t => t.id === id);
  if (tx && tx.type === 'gasto') { applyTxToYearly(tx, -1); renderYearly(); renderExpensesChart(); }
  renderExpensePie();
  state.txs = state.txs.filter(t => t.id !== id);
  storage.set('financeTransactions', state.txs);
  renderFinanzas();
});

finForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const tx = {
    id: crypto.randomUUID(),
    type: finType.value,
    date: finDate.value,
    category: (finCategory?.value||'').trim(),
    desc: finDesc.value.trim(),
    amount: Number(finAmount.value)
  };
  if (!tx.date || !tx.category || !tx.amount) return;
  state.txs.push(tx);
  storage.set('financeTransactions', state.txs);
  if (tx.type === 'gasto') { applyTxToYearly(tx, +1); renderYearly(); renderExpensesChart(); }
  renderExpensePie();
  finForm.reset();
  finDate.value = isoDate(state.today);
  populateFinCategoriesFromYear(yearFromISO(finDate.value));
  renderFinanzas();
});

finMonth.addEventListener('change', renderFinanzas);
finTodayBtn.addEventListener('click', () => { finMonth.value = currentMonthStr(state.today); renderFinanzas(); });
finDate.addEventListener('change', () => { populateFinCategoriesFromYear(yearFromISO(finDate.value)); });

// Init
function init() {
  // Before rendering, rollover pending daily goals from last open day(s) to today
  try {
    const todayKey = isoDate(state.today);
    const lastOpen = storage.get('lastOpenDate', null);
    if (lastOpen && typeof lastOpen === 'string' && lastOpen !== todayKey) {
      // Walk day by day from lastOpen to the day before today, carrying pending goals forward
      let d = fromISO(lastOpen);
      // If lastOpen is in the future (clock change), ignore and reset
      if (d <= state.today) {
        while (isoDate(d) !== todayKey) {
          const fromKey = isoDate(d);
          const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
          const toKey = isoDate(next);
          const arr = (state.dailyGoals[fromKey] || []).slice();
          if (arr.length) {
            const done = arr.filter(g => !!g.done);
            const pending = arr.filter(g => !g.done);
            if (pending.length) {
              state.dailyGoals[toKey] = (state.dailyGoals[toKey] || []).concat(pending);
            }
            // Keep only completed goals on the source day to preserve history
            if (done.length) state.dailyGoals[fromKey] = done; else delete state.dailyGoals[fromKey];
          }
          d = next;
        }
        storage.set('dailyGoals', state.dailyGoals);
      }
    }
    // Update lastOpenDate to today
    storage.set('lastOpenDate', todayKey);
  } catch {}

  // Restore last view
  const last = localStorage.getItem('lastView') || 'mes';
  switchView(last);

  // Calendar defaults
  state.calCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
  state.selectedDate = cloneDate(state.today);
  if (eventDate) eventDate.value = isoDate(state.today);
  renderMonth();
  renderSelectedDay();

  // Weekly defaults
  state.weekStart = getMonday(state.today);
  renderWeek();
  if (weekEventDate) weekEventDate.value = isoDate(state.today);

  // Finanzas defaults
  finMonth.value = currentMonthStr(state.today);
  finDate.value = isoDate(state.today);
  renderFinanzas();

  // Bills defaults
  state.billCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
  const billDate = document.getElementById('bill-date'); if (billDate) billDate.value = isoDate(state.today);
  initBills();

  // Yearly plan defaults
  const y = state.today.getFullYear();
  const yearlyYear = document.getElementById('yearly-year'); if (yearlyYear) yearlyYear.value = String(y);
  ensureYearDefaults(y);
  populateFinCategoriesFromYear(y);
  // Ensure recurring bills are applied to the selected year once
  ensureBillsAppliedToYear(y);
  renderYearly();
  renderExpensesChart();
  renderExpensePie();

  // Future incomes
  renderFutureIncomes();
  renderFutureSummary();

  // Goals
  const ideas = storage.get('goalIdeas', '');
  const goalIdeasEl = document.getElementById('goal-ideas');
  if (goalIdeasEl) goalIdeasEl.value = ideas;
  renderGoals();

  // Live rollover at midnight
  scheduleMidnightRollover();
}

function boot(){
  // Single-user mode: no login screen
  const overlay = document.getElementById('login-screen');
  const mainEl = document.querySelector('main.container');
  if (overlay) overlay.classList.add('hidden');
  if (mainEl) mainEl.style.display = '';
  init();
}

document.addEventListener('DOMContentLoaded', boot);

// Handle weekly quick event creation
weekEventForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = weekEventDate?.value || isoDate(state.weekStart || state.today);
  const priority = weekEventPriority?.value || 'baja';
  const txt = (weekEventText?.value || '').trim();
  const tm = weekEventTime?.value || '';
  let te = weekEventEnd?.value || '';
  if (!te && tm) te = timeAddHM(tm, 60);
  if (!txt) return;
  if (weekEventRecur?.checked && ((weekEventRecurWeekly?.checked) || Number(weekEventRecurDays?.value) >= 2)) {
    const series = {
      groupId: crypto.randomUUID(),
      startDate: key,
      time: tm,
      end: te,
      text: txt,
      priority,
      every: weekEventRecurWeekly?.checked ? 7 : Number(weekEventRecurDays?.value),
      kind: weekEventRecurWeekly?.checked ? 'weekly' : 'days',
      until: weekEventRecurUntil?.value || '',
      times: Number(weekEventRecurTimes?.value || 0) || 0,
      canceled: false
    };
    state.recurring.push(series);
    storage.set('recurringEvents', state.recurring);
  } else {
    const item = { id: crypto.randomUUID(), time: tm, end: te, text: txt, priority };
    state.events[key] = state.events[key] || [];
    state.events[key].push(item);
    storage.set('agendaEvents', state.events);
  }
  weekEventForm.reset();
  if (weekEventDate) weekEventDate.value = key;
  renderMonth();
  renderSelectedDay();
  renderWeek();
});

// ====== Plants (hidden panel) ======
const plantForm = document.getElementById('plant-form');
const plantName = document.getElementById('plant-name');
const plantType = document.getElementById('plant-type');
const plantStart = document.getElementById('plant-start');
const plantLimitDays = document.getElementById('plant-limit-days');
const plantColor = document.getElementById('plant-color');
const plantList = document.getElementById('plant-list');

function renderPlants() {
  plantList.innerHTML = '';
  const list = state.plantStages.slice().sort((a,b) => a.start < b.start ? 1 : -1);
  list.forEach(st => {
    // migrate legacy water notes to waterChanges
    if (st.notes && st.notes.some(n => n.kind === 'water')) {
      st.waterChanges = st.waterChanges || [];
      st.notes = st.notes.filter(n => {
        if (n.kind === 'water') {
          st.waterChanges.push({ id: crypto.randomUUID(), date: n.date, note: n.text || '' });
          return false;
        }
        return true;
      });
      storage.set('plantStages', state.plantStages);
    }

    const li = document.createElement('li');
    li.className = 'event-item';
    const left = document.createElement('div');
    left.className = 'event-text';
    const status = st.end ? `Finalizado ${st.end}` : 'Activo';
    const notesCount = st.notes?.length || 0;
    const name = st.name ? st.name + ' — ' : '';
    const head = document.createElement('div'); head.className='stage-head';
    const typeBadge = document.createElement('span'); typeBadge.className='badge'; typeBadge.textContent = capitalize(st.type);
    if (st.color){ typeBadge.style.borderColor = st.color; typeBadge.style.color = st.color; }
    const startSpan = document.createElement('span'); startSpan.textContent = `Inicio ${st.start}`;
    const statusSpan = document.createElement('span'); statusSpan.textContent = `· ${status}`;
    const limitSpan = document.createElement('span'); if (st.limitDays) { limitSpan.textContent = `· Límite ${st.limitDays}d`; }
    head.appendChild(document.createTextNode(name)); head.appendChild(typeBadge); head.appendChild(startSpan); head.appendChild(statusSpan); if (st.limitDays) head.appendChild(limitSpan);
    left.appendChild(head);

    const actions = document.createElement('div');
    actions.className = 'row';
    // (botón de editar antiguo eliminado)
    // Nuevo: Agregar notas (ventana)
    const addNoteBtn = document.createElement('button');
    addNoteBtn.textContent = '+ nota';
    addNoteBtn.className = 'minibtn';
    addNoteBtn.addEventListener('click', async () => {
      const res = await showFormModal({
        title: 'Agregar nota',
        fields: [
          { name: 'date', label: 'Fecha', type: 'date', value: isoDate(state.today) },
          { name: 'text', label: 'Nota', type: 'text', placeholder: 'Escribe una nota' }
        ]
      });
      if (!res) return;
      const text = (res.text || '').trim();
      const date = res.date || isoDate(state.today);
      if (text) {
        st.notes = st.notes || [];
        st.notes.push({ id: crypto.randomUUID(), date, text, kind: 'note' });
        storage.set('plantStages', state.plantStages);
        renderPlants();
      }
    });
    actions.appendChild(addNoteBtn);

    // Editar etapa
    const editStageBtn = document.createElement('button');
    editStageBtn.textContent = 'Editar';
    editStageBtn.className = 'minibtn';
    editStageBtn.addEventListener('click', async () => {
      const res = await showFormModal({
        title: 'Editar etapa',
        fields: [
          { name: 'name', label: 'Nombre', type: 'text', value: st.name || '' },
          { name: 'type', label: 'Tipo', type: 'select', options: [
            {value:'esquejacion', label:'Esquejacion'},
            {value:'vegetacion', label:'Vegetacion'},
            {value:'floracion', label:'Floracion'}
          ], value: st.type },
          { name: 'start', label: 'Inicio', type: 'date', value: st.start },
          { name: 'limitDays', label: 'Limite (días)', type: 'number', value: st.limitDays || '' },
          { name: 'color', label: 'Color', type: 'color', value: st.color || '#86efac' }
        ]
      });
      if (!res) return;
      Object.assign(st, { name: (res.name||'').trim(), type: res.type, start: res.start, limitDays: Number(res.limitDays||0)||0, color: res.color || st.color });
      storage.set('plantStages', state.plantStages);
      renderPlants();
      renderMonth();
    });
    actions.appendChild(editStageBtn);

    // Water changes section (list + add)

    if (!st.end) {
      const finBtn = document.createElement('button');
      finBtn.textContent = 'Finalizar';
      finBtn.className = 'danger';
      finBtn.addEventListener('click', () => {
        if (confirm('¿Finalizar esta etapa hoy?')) {
          st.end = isoDate(state.today);
          storage.set('plantStages', state.plantStages);
          renderPlants();
          renderMonth();
        }
      });
      actions.appendChild(finBtn);
    }

    // Delete stage
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Borrar etapa';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => {
      if (confirm('¿Seguro que quieres borrar esta etapa? Se eliminarán también sus notas.')) {
        state.plantStages = state.plantStages.filter(x => x.id !== st.id);
        storage.set('plantStages', state.plantStages);
        renderPlants();
        renderMonth();
      }
    });
    actions.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(actions);
    // Water changes block
    const watersWrap = document.createElement('div');
    watersWrap.className = 'notes';
    const wTitle = document.createElement('div'); wTitle.style.color='var(--muted)'; wTitle.style.fontSize='12px'; wTitle.textContent='Cambios de agua';
    const wForm = document.createElement('div'); wForm.className='row';
    const wDate = document.createElement('input'); wDate.type='date'; wDate.value = isoDate(state.today);
    const wNote = document.createElement('input'); wNote.type='text'; wNote.placeholder='Nota (opcional)';
    const wAdd = document.createElement('button'); wAdd.textContent='Agregar';
    wAdd.addEventListener('click', () => {
      const entry = { id: crypto.randomUUID(), date: wDate.value, note: (wNote.value||'').trim() };
      if (!entry.date) return;
      st.waterChanges = st.waterChanges || [];
      st.waterChanges.push(entry);
      storage.set('plantStages', state.plantStages);
      renderPlants();
    });
    wForm.appendChild(wDate); wForm.appendChild(wNote); wForm.appendChild(wAdd);
    const wList = document.createElement('ul'); wList.className='water-list'; wList.style.listStyle='none'; wList.style.padding='0'; wList.style.margin='6px 0 0'; wList.style.display='grid'; wList.style.gap='6px';
    (st.waterChanges||[]).slice().sort((a,b)=> a.date < b.date ? 1 : -1).forEach(w => {
      const it = document.createElement('li'); it.className='event-item';
      const txt = document.createElement('div'); txt.className='event-text'; txt.textContent = `${w.date}${w.note? ' · '+w.note:''}`;
      const row = document.createElement('div'); row.className='row';
      const del = document.createElement('button'); del.textContent='Borrar'; del.className='minibtn danger';
      del.addEventListener('click', ()=>{
        st.waterChanges = (st.waterChanges||[]).filter(x=>x.id!==w.id);
        storage.set('plantStages', state.plantStages);
        renderPlants();
      });
      row.appendChild(del);
      it.appendChild(txt); it.appendChild(row);
      wList.appendChild(it);
    });
    watersWrap.appendChild(wTitle);
    watersWrap.appendChild(wForm);
    watersWrap.appendChild(wList);

    // Notes section (view-only here)
    const notesWrap = document.createElement('div');
    notesWrap.className = 'notes';
    const toggle = document.createElement('button');
    toggle.className = 'ghost';
    toggle.textContent = 'Ver notas';
    const listEl = document.createElement('ul');
    listEl.style.display = 'none';
    toggle.addEventListener('click', () => {
      const show = listEl.style.display === 'none';
      listEl.style.display = show ? 'grid' : 'none';
      toggle.textContent = show ? 'Ocultar notas' : 'Ver notas';
    });
    // Fill notes
    if (st.notes && st.notes.length) {
      let changed = false;
      st.notes.forEach(n => { if (!n.id) { n.id = crypto.randomUUID(); changed = true; } });
      if (changed) { storage.set('plantStages', state.plantStages); }
    }
    (st.notes || []).slice().sort((a,b) => a.date < b.date ? -1 : 1).forEach(n => {
      const it = document.createElement('li');
      const kind = n.kind === 'water' ? 'water' : 'note';
      it.innerHTML = `<span class="badge ${kind}">${kind==='water'?'Agua':'Nota'}</span> ${n.date}${n.text? ' · '+escapeHtml(n.text): ''}`;
      const del = document.createElement('button');
      del.className = 'minibtn danger';
      del.textContent = 'Borrar';
      del.addEventListener('click', () => {
        st.notes = (st.notes || []).filter(x => x.id !== n.id);
        storage.set('plantStages', state.plantStages);
        renderPlants();
      });
      it.appendChild(del);
      listEl.appendChild(it);
    });
    notesWrap.appendChild(toggle);
    notesWrap.appendChild(listEl);
    li.appendChild(watersWrap);
    li.appendChild(notesWrap);
    plantList.appendChild(li);
  });
}

function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(s){
  return s.replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

plantForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const st = {
    id: crypto.randomUUID(),
    name: (plantName?.value || '').trim(),
    type: plantType.value,
    start: plantStart.value,
    limitDays: Number(plantLimitDays?.value || 0) || 0,
    color: (plantColor?.value || '#86efac'),
    waterChanges: [],
    notes: []
  };
  if (!st.start) return;
  state.plantStages.push(st);
  storage.set('plantStages', state.plantStages);
  plantForm.reset();
  plantStart.value = isoDate(state.today);
  if (plantName) plantName.value = '';
  if (plantColor) plantColor.value = '#86efac';
  renderPlants();
  renderMonth();
});

// ===== Recurring helpers =====
function priRank(p){ return p==='alta'?3 : p==='media'?2 : 1; }
function priClass(p){ return p==='alta'?'high' : p==='media'?'med' : 'low'; }

function occursOn(series, date){
  if (series.canceled) return false;
  const sd = fromISO(series.startDate);
  if (date < sd) return false;
  const diff = Math.floor((date - sd)/86400000);
  if (series.kind === 'weekly') {
    if (date.getDay() !== sd.getDay()) return false;
    // weekly occurrences
  } else {
    if (diff % series.every !== 0) return false;
  }
  if (series.until) {
    const ud = fromISO(series.until);
    if (date > ud) return false;
  }
  if (series.times && series.times > 0) {
    const idx = series.kind === 'weekly' ? Math.floor(diff / 7) : Math.floor(diff / series.every);
    if (idx >= series.times) return false;
  }
  return true;
}

function getEventsForDate(date){
  const key = isoDate(date);
  const singles = (state.events[key] || []).map(e => ({...e, _recurring:false}));
  const recs = state.recurring
    .filter(s => occursOn(s, date))
    .map(s => ({ id: `${s.groupId}:${key}`, time: s.time, end: s.end, text: s.text, priority: s.priority, _recurring:true, _series: s }));
  // Academic tasks: show on due date and reminders 14d/7d before
  const tasks = (state.academicTasks||[]).flatMap(t => {
    const due = fromISO(t.date);
    const diff = Math.floor((due - date)/86400000);
    if (isSameDay(date, due)) {
      return [{ id: `task:${t.id}:${key}`, time: '', text: `${t.type.toUpperCase()}: ${t.title}`, priority: 'alta', _task: t }];
    }
    if (diff === 14 || diff === 7) {
      const label = diff===14 ? 'Estudiar (faltan 2 semanas)' : 'Estudiar (falta 1 semana)';
      return [{ id: `taskwarn:${t.id}:${key}`, time: '', text: `${label}: ${t.type.toUpperCase()} ${t.title}`, priority: 'media', _taskWarn: t }];
    }
    return [];
  });
  return singles.concat(recs, tasks);
}

// No auto-finalize; chips dejan de mostrarse al pasar el límite

function findSeries(groupId){ return state.recurring.find(s => s.groupId === groupId); }

function cancelSeries(groupId){
  const s = findSeries(groupId); if (!s) return;
  if (!confirm('Cancelar la serie completa (no se mostrarán más ocurrencias)?')) return;
  s.canceled = true; storage.set('recurringEvents', state.recurring);
  renderMonth(); renderSelectedDay(); renderWeek();
}

function deleteSeries(groupId){
  if (!confirm('Borrar la serie completa?')) return;
  state.recurring = state.recurring.filter(s => s.groupId !== groupId);
  storage.set('recurringEvents', state.recurring);
  renderMonth(); renderSelectedDay(); renderWeek();
}

function editSeries(groupId){
  const s = findSeries(groupId); if (!s) return;
  const text = prompt('Texto del evento:', s.text);
  if (text === null) return;
  const time = prompt('Hora inicio (HH:MM, opcional):', s.time || ''); if (time===null) return;
  const end = prompt('Hora fin (HH:MM, opcional):', s.end || ''); if (end===null) return;
  const priority = prompt('Importancia (baja, media, alta):', s.priority || 'baja'); if (priority===null) return;
  const everyStr = prompt('Repite cada X días:', String(s.every)); if (everyStr===null) return;
  const until = prompt('Hasta (YYYY-MM-DD, opcional):', s.until || ''); if (until===null) return;
  const timesStr = prompt('Veces (número, opcional; vacío = sin límite):', s.times ? String(s.times) : ''); if (timesStr===null) return;
  const every = Number(everyStr);
  if (!every || every < 2) { alert('La repetición debe ser cada 2 días o más.'); return; }
  const times = Number(timesStr) || 0;
  Object.assign(s, { text: text.trim(), time: time.trim(), end: end.trim(), priority: (priority||'baja').toLowerCase(), every, until: until.trim(), times });
  storage.set('recurringEvents', state.recurring);
  renderMonth(); renderSelectedDay(); renderWeek();
}

// (music widget removed by request)

// ===== Modal helper =====
const modalEl = document.getElementById('modal');
const modalTitleEl = document.getElementById('modal-title');
const modalFormEl = document.getElementById('modal-form');
const modalCancelEl = document.getElementById('modal-cancel');

function showFormModal({ title = 'Editar', fields = [] } = {}){
  return new Promise((resolve) => {
  modalTitleEl.textContent = title;
  // Mantener la estructura del formulario del modal; solo vaciar los campos
  const fieldsWrap = document.getElementById('modal-fields');
  if (fieldsWrap) { fieldsWrap.innerHTML = ''; }
  const controls = {};
  fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    if (f.label) {
      const label = document.createElement('label'); label.textContent = f.label; label.style.fontSize = '12px'; label.style.color = 'var(--muted)';
      wrap.appendChild(label);
    }
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      (f.options||[]).forEach(opt => {
        const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label || opt.value; input.appendChild(o);
      });
      if (f.value !== undefined) input.value = f.value;
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.value !== undefined) input.value = f.value;
      if (f.rows) input.rows = f.rows;
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.value !== undefined) input.value = f.value;
    }
    input.name = f.name;
    input.required = !!f.required;
    wrap.appendChild(input);
    controls[f.name] = input;
    (fieldsWrap || modalFormEl).appendChild(wrap);
  });

    function close(result){
      modalEl.classList.add('hidden');
      modalEl.setAttribute('aria-hidden', 'true');
      modalCancelEl.removeEventListener('click', onCancel);
      modalFormEl.removeEventListener('submit', onSubmit);
      resolve(result);
    }
    function onCancel(){ close(null); }
    function onSubmit(e){
      e.preventDefault();
      const out = {};
      fields.forEach(f => { out[f.name] = controls[f.name].value; });
      close(out);
    }
    modalCancelEl.addEventListener('click', onCancel);
    document.getElementById('modal-close-x').addEventListener('click', onCancel);
    modalEl.querySelector('.modal-backdrop').addEventListener('click', onCancel);
    modalFormEl.addEventListener('submit', onSubmit);

    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
    const first = modalFormEl.querySelector('input, select, textarea');
    if (first) first.focus();
  });
}

// ====== Bills (vencimientos) ======
function initBills(){
  const prev = document.getElementById('bill-prev');
  const next = document.getElementById('bill-next');
  prev?.addEventListener('click', ()=>{ state.billCursor.setMonth(state.billCursor.getMonth()-1); renderBills(); });
  next?.addEventListener('click', ()=>{ state.billCursor.setMonth(state.billCursor.getMonth()+1); renderBills(); });
  document.getElementById('bill-form')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = (document.getElementById('bill-name')?.value||'').trim();
    const date = document.getElementById('bill-date')?.value;
    const amount = Number(document.getElementById('bill-amount')?.value||0);
    const monthly = !!document.getElementById('bill-monthly')?.checked;
    if (!name || !date || !amount) return;
    const bill = { id: crypto.randomUUID(), name, date, amount, monthly };
    state.bills.push(bill);
    storage.set('bills', state.bills);
    // Connect to yearly table: add to category totals
    applyBillToYearly(bill);
    (document.getElementById('bill-form')).reset();
    document.getElementById('bill-date').value = isoDate(state.today);
    renderBills();
    renderYearly();
  });
  renderBills();
}

function monthDaysGrid(firstDay){
  const first = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
  const startOffset = (first.getDay()+6)%7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
  const days = [];
  for (let i=0;i<42;i++){
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
  }
  return days;
}

function billOccursOn(bill, d){
  if (!bill.monthly) {
    return bill.date === isoDate(d);
  }
  // monthly: same day-of-month as original date, clamp to month length
  const dd = Number((bill.date||'').split('-')[2]||'1');
  const mLast = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const day = Math.min(dd, mLast);
  return d.getDate() === day;
}

function billDueDateInMonth(bill, year, monthIndex){
  if (!bill) return null;
  if (bill.monthly){
    const dd = Number((bill.date||'').split('-')[2]||'1');
    const last = new Date(year, monthIndex+1, 0).getDate();
    const day = Math.min(dd, last);
    return new Date(year, monthIndex, day);
  }
  const bd = fromISO(bill.date||'');
  if (bd && bd.getFullYear()===year && bd.getMonth()===monthIndex){
    return new Date(year, monthIndex, bd.getDate());
  }
  return null;
}

// Bill amount resolution with per-month overrides and future changes
function amountForBillOnDate(bill, d){
  const ym = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  if (bill.overrides && bill.overrides[ym] != null) return Number(bill.overrides[ym]);
  let base = Number(bill.amount || 0);
  const changes = (bill.changes || []).slice().sort((a,b) => (a.from < b.from ? -1 : 1));
  for (const ch of changes){ if (ch && ch.from && ch.from <= ym) base = Number(ch.amount||0); }
  return base;
}

function getBillPaidInfo(bill, dateKey){
  if (!bill || !dateKey) return null;
  const paid = bill.paid || {};
  const raw = paid[dateKey];
  if (!raw) return null;
  if (typeof raw === 'object' && raw) {
    const on = raw.on || raw.date || dateKey;
    const ts = typeof raw.ts === 'number' ? raw.ts : Date.parse(on) || Date.parse(dateKey);
    return { on, ts: Number.isFinite(ts) ? ts : null };
  }
  if (raw === true) {
    const ts = Date.parse(dateKey);
    return { on: dateKey, ts: Number.isFinite(ts) ? ts : null };
  }
  if (typeof raw === 'string') {
    const ts = Date.parse(raw);
    return { on: raw, ts: Number.isFinite(ts) ? ts : null };
  }
  return null;
}

function isBillPaidOn(bill, dateKey){
  return !!getBillPaidInfo(bill, dateKey);
}

function setBillPaid(bill, dateKey, paidOn){
  if (!bill || !dateKey) return;
  const paidDate = paidOn || isoDate(state.today);
  const parsed = Date.parse(paidDate);
  bill.paid = bill.paid || {};
  bill.paid[dateKey] = { on: paidDate, ts: Number.isFinite(parsed) ? parsed : Date.now() };
}

function clearBillPaid(bill, dateKey){
  if (!bill || !bill.paid) return;
  delete bill.paid[dateKey];
  if (Object.keys(bill.paid).length === 0) delete bill.paid;
}

function isBillPaidRecent(bill, dateKey, days){
  const info = getBillPaidInfo(bill, dateKey);
  if (!info) return false;
  const today = cloneDate(state.today);
  const paidDate = fromISO(info.on || dateKey);
  if (!(paidDate instanceof Date) || isNaN(paidDate)) return false;
  const diff = Math.floor((today - paidDate)/86400000);
  return diff <= days;
}
// Apply a bill to yearly table via deltas, tracking applied amounts per month
function updateBillApplication(bill, year){
  const y = Number(year);
  const ystr = String(y);
  const catId = getOrCreateCategoryIdByName(y, bill.name);
  ensureYearDefaults(y);
  const vals = state.expenseYearly[ystr].vals;
  bill.applied = bill.applied || {};
  for (let m=1; m<=12; m++){
    const mm = pad2(m);
    let desired = 0;
    if (bill.monthly){
      const d = new Date(y, m-1, 1);
      // pick the actual due date inside month
      const dd = Number((bill.date||'').split('-')[2]||'1');
      const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      const day = Math.min(dd, last);
      const occur = new Date(y, m-1, day);
      desired = amountForBillOnDate(bill, occur);
    } else {
      const bd = fromISO(bill.date||'');
      if (bd && bd.getFullYear()===y && (bd.getMonth()+1)===m) desired = Number(bill.amount||0);
    }
    const key = `${ystr}-${mm}`;
    const prev = Number(bill.applied[key] || 0);
    const delta = desired - prev;
    if (delta !== 0){
      vals[catId] = vals[catId] || {};
      const cur = Number((vals[catId][mm]||0));
      vals[catId][mm] = Math.max(0, cur + delta);
      bill.applied[key] = desired;
    }
  }
  storage.set('bills', state.bills);
  storage.set('expenseYearly', state.expenseYearly);
}

function renderBills(){
  const label = document.getElementById('bill-month-label');
  const grid = document.getElementById('bill-grid');
  if (!label || !grid) return;
  const first = new Date(state.billCursor.getFullYear(), state.billCursor.getMonth(), 1);
  label.textContent = monthLabel(first);
  grid.innerHTML = '';
  const days = monthDaysGrid(first);
  days.forEach(d=>{
    const cell = document.createElement('div'); cell.className='mc-day'; if (d.getMonth()!==first.getMonth()) cell.classList.add('out');
    const num = document.createElement('div'); num.className='num'; num.textContent=String(d.getDate()); cell.appendChild(num);
    const bills = state.bills.filter(b=>billOccursOn(b, d));
    if (bills.length){
      const list = document.createElement('div'); list.className='bills';
      bills.forEach(b=>{
        const pill = document.createElement('div'); pill.className='bill-pill';
        const paidKey = isoDate(d);
        const isPaid = isBillPaidOn(b, paidKey);
        const today = state.today; const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (isPaid) pill.classList.add('paid');
        else if (dd < new Date(today.getFullYear(), today.getMonth(), today.getDate())) pill.classList.add('overdue');
        else if ((dd - today)/86400000 <= 3) pill.classList.add('soon');
        const note = (b.notes && b.notes[paidKey]) || '';
        if (note) { pill.classList.add('has-note'); pill.title = note; } else { pill.title = 'Click para agregar notas'; }
        const amountToday = amountForBillOnDate(b, d);
        pill.textContent = `${b.name} - ${money(amountToday)}`;
        pill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openBillNote(b, d);
        });
        list.appendChild(pill);
      });
      cell.appendChild(list);
    }
    grid.appendChild(cell);
  });
  renderUpcomingBills();
  renderBillsTotals();
  renderFutureSummary();
}

async function openBillNote(bill, date){
  if (!bill || !date) return;
  const key = isoDate(date);
  const current = (bill.notes && bill.notes[key]) || '';
  const res = await showFormModal({
    title: `Notas - ${bill.name}`,
    fields: [
      { name:'note', label:'Notas', type:'textarea', value: current, rows: 4 }
    ]
  });
  if (!res) return;
  const text = (res.note || '').trim();
  if (text) {
    bill.notes = bill.notes || {};
    bill.notes[key] = text;
  } else if (bill.notes && bill.notes[key] !== undefined) {
    delete bill.notes[key];
    if (Object.keys(bill.notes).length === 0) delete bill.notes;
  }
  storage.set('bills', state.bills);
  renderBills();
}



function getOrCreateCategoryIdByName(year, name){
  const y = String(year); ensureYearDefaults(y);
  const entry = state.expenseYearly[y];
  let cat = entry.cats.find(c => (c.name||'').toLowerCase() === name.toLowerCase());
  if (!cat){ cat = { id: crypto.randomUUID(), name }; entry.cats.push(cat); entry.vals[cat.id] = {}; storage.set('expenseYearly', state.expenseYearly); }
  return cat.id;
}

function applyBillToYearly(bill){
  try { const d = fromISO(bill.date); if (!d) return; updateBillApplication(bill, d.getFullYear()); } catch {}
}

function ensureBillsAppliedToYear(year){
  const y = Number(year);
  state.bills.forEach(b=> updateBillApplication(b, y));
}

function renderUpcomingBills(){
  const wrap = document.getElementById('bill-upcoming'); if (!wrap) return; wrap.innerHTML='';
  const today = cloneDate(state.today);
  const end = new Date(today.getFullYear(), today.getMonth()+1, 0); // ultimo dia del mes
  const totalDays = Math.max(0, Math.floor((end - today)/86400000));
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const pastDays = Math.max(0, Math.floor((today - start)/86400000));

  const appendEntry = (billRef, date, label, extraClass) => {
    const paidKey = isoDate(date);
    const isPaid = isBillPaidOn(billRef, paidKey);
    if (isPaid && !isBillPaidRecent(billRef, paidKey, 2)) return;
    const div = document.createElement('div'); div.className = extraClass;
    if (isPaid) div.classList.add('paid');
    const amountNow = amountForBillOnDate(billRef, date);
    div.textContent = `${label}: ${billRef.name} (${money(amountNow)}) el ${isoDate(date)}`;
    const toggle = document.createElement('button');
    toggle.textContent = isPaid ? 'No pague' : 'Pague';
    toggle.className = 'minibtn';
    toggle.style.marginLeft = '8px';
    toggle.addEventListener('click', () => {
      if (isBillPaidOn(billRef, paidKey)) {
        clearBillPaid(billRef, paidKey);
      } else {
        setBillPaid(billRef, paidKey, isoDate(state.today));
      }
      storage.set('bills', state.bills);
      renderBills();
    });
    div.appendChild(toggle);
    const del = document.createElement('button'); del.textContent = 'Borrar'; del.className = 'minibtn danger'; del.style.marginLeft = '8px';
    del.addEventListener('click', () => {
      state.bills = state.bills.filter(x => x.id !== billRef.id);
      storage.set('bills', state.bills);
      renderBills();
    });
    div.appendChild(del);
    const edit = document.createElement('button'); edit.textContent = 'Editar'; edit.className = 'minibtn'; edit.style.marginLeft = '6px';
    edit.addEventListener('click', async () => {
      const ym = `${date.getFullYear()}-${pad2(date.getMonth()+1)}`;
      const res = await showFormModal({
        title: 'Editar vencimiento',
        fields: [
          { name:'amount', label:'Monto', type:'number', value:String(amountNow), required:true },
          { name:'scope', label:'Aplicar', type:'select', options:[
            {value:'only', label:'Solo este mes'},
            {value:'from', label:'Desde este mes en adelante'}
          ], value:'only' }
        ]
      });
      if (!res) return;
      const newAmt = Number(res.amount||0); if (!newAmt) return;
      billRef.overrides = billRef.overrides || {}; billRef.changes = billRef.changes || [];
      if (res.scope === 'only') { billRef.overrides[ym] = newAmt; } else { billRef.changes.push({ from: ym, amount: newAmt }); }
      storage.set('bills', state.bills);
      updateBillApplication(billRef, date.getFullYear());
      renderBills(); renderYearly(); renderExpensesChart(); renderExpensePie();
    });
    div.appendChild(edit);
    wrap.appendChild(div);
  };

  try {
    for (let i=0; i<pastDays; i++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
      const due = state.bills.filter(b=>billOccursOn(b, d));
      due.forEach(bill => appendEntry(bill, d, 'Vencido', 'alert unpaid'));
    }
  } catch {}

  for (let i=0;i<=totalDays;i++){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()+i);
    const due = state.bills.filter(b=>billOccursOn(b, d));
    due.forEach(bill => {
      const label = i===0 ? 'Hoy' : (i===1 ? 'Ma\u00f1ana' : `En ${i} d�as`);
      appendEntry(bill, d, label, 'alert');
    });
  }
}

function renderBillsTotals(){
  const wrap = document.getElementById('bill-totals'); if (!wrap) return;
  const today = cloneDate(state.today);
  let sum15 = 0, sum30 = 0;
  for (let i=0; i<=30; i++){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()+i);
    const daySum = state.bills.filter(b=>billOccursOn(b,d)).reduce((acc,b)=> acc + Number(amountForBillOnDate(b, d)||0), 0);
    sum30 += daySum;
    if (i<=15) sum15 += daySum;
  }
  wrap.innerHTML = `
    <div><strong>Total 15 días:</strong> ${money(sum15)}</div>
    <div><strong>Total 30 días:</strong> ${money(sum30)}</div>
  `;
}

// ====== Yearly expense plan ======
function ensureYearDefaults(year){
  const y = String(year);
  if (!state.expenseYearly[y]){
    const defaults = ['Alquiler','Servicios','Comida','Transporte','Salud','Ocio','Otros'];
    const cats = defaults.map(n=>({ id: crypto.randomUUID(), name: n }));
    const vals = {}; cats.forEach(c=>{ vals[c.id] = {}; });
    state.expenseYearly[y] = { cats, vals };
    storage.set('expenseYearly', state.expenseYearly);
  }
}

function renderYearly(){
  const yearEl = document.getElementById('yearly-year'); const table = document.getElementById('yearly-table'); const form = document.getElementById('yearly-cat-form'); const nameEl = document.getElementById('yearly-cat-name');
  if (!yearEl || !table) return;
  const y = String(yearEl.value || state.today.getFullYear()); ensureYearDefaults(y);
  if (form) form.onsubmit = (e)=>{ e.preventDefault(); const nm=(nameEl?.value||'').trim(); if(!nm) return; const id=crypto.randomUUID(); state.expenseYearly[y].cats.push({id,name:nm}); state.expenseYearly[y].vals[id]={}; storage.set('expenseYearly', state.expenseYearly); nameEl.value=''; renderYearly(); populateFinCategoriesFromYear(Number(y)); };
  yearEl.onchange = () => { ensureYearDefaults(yearEl.value); ensureBillsAppliedToYear(Number(yearEl.value)); renderYearly(); renderExpensesChart(); renderExpensePie(); populateFinCategoriesFromYear(Number(yearEl.value)); };

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const { cats, vals } = state.expenseYearly[y];
  const totalsByMonth = new Array(12).fill(0);
  let html = '<thead><tr><th>Categoria</th>' + months.map(m=>`<th class="num">${m}</th>`).join('') + '<th class="num">Total</th><th></th></tr></thead><tbody>';
  cats.forEach(c=>{
    let rowTotal = 0; let cells='';
    for (let m=1;m<=12;m++){
      const key = String(m).padStart(2,'0'); const v = Number((vals[c.id]||{})[key]||0);
      rowTotal += v; totalsByMonth[m-1]+=v;
      const amt = String(Math.round(Number(v)||0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      cells += `<td class=\"num\"><div class=\"money-cell\"><div class=\"cur\">$</div><div class=\"amt editable\" data-cat-id=\"${c.id}\" data-month=\"${key}\" title=\"Click para editar\">${amt}</div></div></td>`;
    }
    const rowAmt = String(Math.round(rowTotal||0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    html += `<tr><td><span class=\"cat-name\" data-cat-id=\"${c.id}\" tabindex=\"0\" title=\"Click y usa ↑/↓ para reordenar\">${c.name}</span></td>${cells}<td class=\"num\"><div class=\"money-cell\"><div class=\"cur\">$</div><div class=\"amt\">${rowAmt}</div></div></td><td class=\"num\">`
      
      + `<button class=\"danger\" data-del-cat=\"${c.id}\">Eliminar</button>`
      + `</td></tr>`;
  });
  const totCells = totalsByMonth.map(v=>{ const amt=String(Math.round(Number(v)||0)).replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return `<td class=\"num\"><div class=\"money-cell\"><div class=\"cur\">$</div><div class=\"amt\">${amt}</div></div></td>`; }).join('');
  const grand = totalsByMonth.reduce((a,b)=>a+b,0);
  const grandAmt = String(Math.round(grand||0)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  html += `<tr><th>Total</th>${totCells}<th class=\"num\"><div class=\"money-cell\"><div class=\"cur\">$</div><div class=\"amt\">${grandAmt}</div></div></th><th></th></tr>`;
  html += '</tbody>';
  table.innerHTML = html;
  table.querySelectorAll('button[data-del-cat]')?.forEach(btn=>{
    btn.addEventListener('click', ()=>{ const id=btn.getAttribute('data-del-cat'); state.expenseYearly[y].cats = state.expenseYearly[y].cats.filter(c=>c.id!==id); delete state.expenseYearly[y].vals[id]; storage.set('expenseYearly', state.expenseYearly); renderYearly(); renderExpensesChart(); renderExpensePie(); });
  });
  // Flechas removidas: se reordena con teclado sobre el nombre
  // Inline edit monthly amounts by clicking the number only
  function beginEditAmount(amtEl){
    const catId = amtEl.getAttribute('data-cat-id');
    const mm = amtEl.getAttribute('data-month');
    if (!catId || !mm) return;
    const moneyCell = amtEl.closest('.money-cell');
    if (!moneyCell || moneyCell.querySelector('input')) return;
    const raw = String((state.expenseYearly[y].vals[catId]||{})[mm]||0);
    amtEl.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'number'; input.step = '1'; input.min = '0';
    input.value = raw;
    input.style.width = '84px'; input.style.padding = '2px 4px';
    input.style.fontSize = '12px';
    input.style.background = '#0b1220'; input.style.color = 'var(--text)';
    input.style.border = '1px solid var(--border)'; input.style.borderRadius = '6px';
    input.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { cancel(); }
    });
    input.addEventListener('blur', ()=>{
      const val = Number(input.value||0);
      state.expenseYearly[y].vals[catId] = state.expenseYearly[y].vals[catId] || {};
      state.expenseYearly[y].vals[catId][mm] = isNaN(val) || val < 0 ? 0 : Math.round(val);
      storage.set('expenseYearly', state.expenseYearly);
      renderYearly(); renderExpensesChart(); renderExpensePie();
    });
    function cancel(){
      input.remove();
      amtEl.style.display = '';
    }
    moneyCell.appendChild(input);
    input.focus(); input.select();
  }
  table.querySelectorAll('.amt[data-cat-id]')?.forEach(el=>{
    el.addEventListener('click', ()=> beginEditAmount(el));
  });

  // Reorder categories via keyboard when focusing the name
  table.querySelectorAll('.cat-name[data-cat-id]')?.forEach(el=>{
    el.addEventListener('click', ()=> el.focus());
    el.addEventListener('keydown', (e)=>{
      const id = el.getAttribute('data-cat-id');
      const list = state.expenseYearly[y].cats;
      const i = list.findIndex(c=>c.id===id);
      if (e.key === 'ArrowUp' && i > 0){
        e.preventDefault();
        const [it]=list.splice(i,1); list.splice(i-1,0,it);
        storage.set('expenseYearly', state.expenseYearly); renderYearly();
        setTimeout(()=>{ const n = document.querySelector(`.cat-name[data-cat-id="${id}"]`); n?.focus(); }, 0);
      }
      if (e.key === 'ArrowDown' && i >= 0 && i < list.length-1){
        e.preventDefault();
        const [it]=list.splice(i,1); list.splice(i+1,0,it);
        storage.set('expenseYearly', state.expenseYearly); renderYearly();
        setTimeout(()=>{ const n = document.querySelector(`.cat-name[data-cat-id="${id}"]`); n?.focus(); }, 0);
      }
    });
  });
}

// ====== Chart of expenses ======
function renderExpensesChart(){
  const wrap = document.getElementById('fin-chart'); const yearEl = document.getElementById('yearly-year'); if (!wrap || !yearEl) return;
  const y = String(yearEl.value || state.today.getFullYear());
  // Compute monthly totals from yearly table
  ensureYearDefaults(y);
  const entry = state.expenseYearly[y];
  const totals = new Array(12).fill(0);
  if (entry){
    const { cats = [], vals = {} } = entry;
    cats.forEach(c => {
      for (let m=1; m<=12; m++){
        const key = pad2(m);
        totals[m-1] += Number((vals[c.id]||{})[key]||0);
      }
    });
  }
  const max = Math.max(1, ...totals);
  const W = 540, H = 140, PAD=24; const dx = (W-PAD*2)/11; const scale = (H-PAD*2)/max;
  const pts = totals.map((v,i)=>[PAD + i*dx, H-PAD - v*scale]);
  const path = pts.map((p,i)=> (i? 'L':'M') + p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area = `M ${PAD},${H-PAD} ` + pts.map((p,i)=> (i? 'L':'L') + p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ') + ` L ${PAD + 11*dx},${H-PAD} Z`;
  const circles = pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#60a5fa" />`).join('');
  const labels = totals.map((_,i)=>`<text x="${(PAD + i*dx).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">${i+1}</text>`).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <rect x="1" y="1" width="${W-2}" height="${H-2}" fill="#0b1220" stroke="rgba(255,255,255,0.06)" />
    <path d="${area}" fill="rgba(96,165,250,0.12)" />
    <path d="${path}" stroke="#60a5fa" stroke-width="2" fill="none" />
    ${circles}
    ${labels}
  </svg>`;
}

// ====== Pie chart (annual expenses by category) ======
function renderExpensePie(){
  const wrap = document.getElementById('fin-pie'); const yearEl = document.getElementById('yearly-year'); if (!wrap || !yearEl) return;
  const y = String(yearEl.value || state.today.getFullYear());
  ensureYearDefaults(y);
  const entry = state.expenseYearly[y] || { cats: [], vals: {} };
  const totalsByCat = (entry.cats||[]).map(c => {
    let sum = 0; for (let m=1;m<=12;m++){ const key = pad2(m); sum += Number((entry.vals?.[c.id]||{})[key]||0); } return { name: c.name, val: sum };
  }).filter(x=>x.val>0).sort((a,b)=>b.val-a.val);
  const cats = totalsByCat.map(x=>x.name);
  const vals = totalsByCat.map(x=>x.val);
  const total = vals.reduce((a,b)=>a+b,0);
  if (!total){ wrap.innerHTML = '<div style="color:var(--muted);font-size:12px">Sin datos para este anio</div>'; return; }

  const W=540, H=180; const cx=90, cy=90, R=64, innerR=32;
  let start=-Math.PI/2;
  function polar(r, ang){ return [cx + r*Math.cos(ang), cy + r*Math.sin(ang)]; }
  function slicePath(a0,a1){
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const p0 = polar(R,a0), p1 = polar(R,a1);
    const q0 = polar(innerR,a1), q1 = polar(innerR,a0);
    return `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${R} ${R} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${q0[0].toFixed(1)} ${q0[1].toFixed(1)} A ${innerR} ${innerR} 0 ${large} 0 ${q1[0].toFixed(1)} ${q1[1].toFixed(1)} Z`;
  }
  function color(i){ const h=(i*57)%360; return `hsl(${h} 70% 55%)`; }
  const slices = cats.map((c,i)=>{
    const ang = (vals[i]/total)*Math.PI*2; const a0=start; const a1=start+ang; start=a1;
    return `<path d="${slicePath(a0,a1)}" fill="${color(i)}" />`;
  }).join('');
  const legends = cats.map((c,i)=>{
    const y0 = 16 + i*16; const val = money(vals[i]);
    return `<rect x="180" y="${y0-10}" width="10" height="10" fill="${color(i)}" />`+
           `<text x="196" y="${y0}" font-size="12" fill="#d1d5db">${escapeHtml(c)} - ${val}</text>`;
  }).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <rect x="1" y="1" width="${W-2}" height="${H-2}" fill="#0b1220" stroke="rgba(255,255,255,0.06)" />
    ${slices}
    ${legends}
  </svg>`;
}

// Override with interactive pie (color picker on click)
renderExpensePie = function(){
  const wrap = document.getElementById('fin-pie'); const yearEl = document.getElementById('yearly-year'); if (!wrap || !yearEl) return;
  const y = String(yearEl.value || state.today.getFullYear());
  ensureYearDefaults(y);
  const entry = state.expenseYearly[y] || { cats: [], vals: {} };
  const catList = entry.cats || [];
  const dataAll = catList.map(c => { let sum=0; for(let m=1;m<=12;m++){ const key=pad2(m); sum += Number((entry.vals?.[c.id]||{})[key]||0); } return { id:c.id, name:c.name, color:c.color||'', val:sum }; });
  const data = dataAll.filter(d=>d.val>0).sort((a,b)=>b.val-a.val);
  const total = data.reduce((a,b)=>a+b.val,0);
  if (!total){ wrap.innerHTML = '<div style="color:var(--muted);font-size:12px">Sin datos para este anio</div>'; return; }
  const W=540, H=180; const cx=90, cy=90, R=64, innerR=32; let start=-Math.PI/2;
  function polar(r,a){ return [cx + r*Math.cos(a), cy + r*Math.sin(a)]; }
  function slicePath(a0,a1){ const large=((a1-a0)>Math.PI)?1:0; const p0=polar(R,a0), p1=polar(R,a1); const q0=polar(innerR,a1), q1=polar(innerR,a0); return `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${R} ${R} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${q0[0].toFixed(1)} ${q0[1].toFixed(1)} A ${innerR} ${innerR} 0 ${large} 0 ${q1[0].toFixed(1)} ${q1[1].toFixed(1)} Z`; }
  function autoColor(i){ const h=(i*57)%360; return `hsl(${h} 70% 55%)`; }
  const slices = data.map((d,i)=>{ const ang=(d.val/total)*Math.PI*2; const a0=start; const a1=start+ang; start=a1; const fill=d.color||autoColor(i); return `<path data-cat-id="${d.id}" d="${slicePath(a0,a1)}" fill="${fill}" style="cursor:pointer" />`; }).join('');
  const legends = data.map((d,i)=>{ const y0=16+i*16; const val=money(d.val); const fill=d.color||autoColor(i); return `<rect data-cat-id="${d.id}" x="180" y="${y0-10}" width="10" height="10" fill="${fill}" style="cursor:pointer" />` + `<text data-cat-id="${d.id}" x="196" y="${y0}" font-size="12" fill="#d1d5db" style="cursor:pointer">${escapeHtml(d.name)} - ${val}</text>`; }).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><rect x="1" y="1" width="${W-2}" height="${H-2}" fill="#0b1220" stroke="rgba(255,255,255,0.06)" />${slices}${legends}</svg>`;
  wrap.querySelectorAll('[data-cat-id]')?.forEach(el=>{ el.addEventListener('click', async ()=>{ const id=el.getAttribute('data-cat-id'); const cats=state.expenseYearly[y]?.cats||[]; const cat=cats.find(c=>c.id===id); if(!cat) return; const startColor=cat.color||'#60a5fa'; const res=await showFormModal({ title:'Color de categoría', fields:[{ name:'color', label:'Color', type:'color', value:startColor }] }); if(!res) return; cat.color=res.color||cat.color; storage.set('expenseYearly', state.expenseYearly); renderExpensePie(); }); });
};

// ====== Future incomes ======
function renderFutureIncomes(){
  const form = document.getElementById('future-income-form'); const list = document.getElementById('fi-list'); if (!form || !list) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const date = document.getElementById('fi-date')?.value;
    const text = (document.getElementById('fi-text')?.value||'').trim();
    const amount = Number(document.getElementById('fi-amount')?.value||0);
    const prob = Number(document.getElementById('fi-prob')?.value||0)||0;
    if (!date || !text || !amount) return;
    state.futureIncomes.push({ id: crypto.randomUUID(), date, text, amount, prob });
    storage.set('futureIncomes', state.futureIncomes);
    form.reset(); document.getElementById('fi-date').value = isoDate(state.today);
    fillFiList();
  });
  document.getElementById('fi-date').value = isoDate(state.today);
  fillFiList();
}

// ====== Link tx gastos -> yearly plan ======
function applyTxToYearly(tx, sign){
  try {
    if (!tx || tx.type !== 'gasto') return;
    const d = fromISO(tx.date); if (!(d instanceof Date) || isNaN(d)) return;
    const y = d.getFullYear(); const mm = pad2(d.getMonth()+1);
    const catId = getOrCreateCategoryIdByName(y, tx.category);
    ensureYearDefaults(y);
    const vals = state.expenseYearly[String(y)].vals;
    const prev = Number((vals[catId]||{})[mm]||0);
    vals[catId] = vals[catId] || {};
    vals[catId][mm] = Math.max(0, prev + sign*Number(tx.amount||0));
    storage.set('expenseYearly', state.expenseYearly);
  } catch {}
}

function renderFutureSummary(){
  if (!futureIncomeTotalEl || !futureExpenseTotalEl || !futureBalanceTotalEl) return;
  const today = cloneDate(state.today);
  const todayIso = isoDate(today);
  let futureIncome = 0;
  (state.futureIncomes || []).forEach(item => {
    if (!item || !item.date) return;
    if (item.date >= todayIso) futureIncome += Number(item.amount || 0);
  });
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  let pendingThisMonth = 0;
  let futureMonths = 0;
  (state.bills || []).forEach(bill => {
    const dueNow = billDueDateInMonth(bill, currentYear, currentMonth);
    if (dueNow) {
      const keyNow = isoDate(dueNow);
      if (!isBillPaidOn(bill, keyNow)) {
        pendingThisMonth += Number(amountForBillOnDate(bill, dueNow) || 0);
      }
    }
    for (let m = currentMonth + 1; m < 12; m++){
      const due = billDueDateInMonth(bill, currentYear, m);
      if (!due) continue;
      const key = isoDate(due);
      if (!isBillPaidOn(bill, key)) {
        futureMonths += Number(amountForBillOnDate(bill, due) || 0);
      }
    }
  });
  const futureExpenses = pendingThisMonth + futureMonths;
  futureIncomeTotalEl.textContent = money(futureIncome);
  futureExpenseTotalEl.textContent = money(futureExpenses);
  futureBalanceTotalEl.textContent = money(futureIncome - futureExpenses);
}

function fillFiList(){
  const list = document.getElementById('fi-list'); if (!list) return;
  list.innerHTML='';
  state.futureIncomes.slice().sort((a,b)=> a.date < b.date ? -1 : 1).forEach(it=>{
    const li=document.createElement('li'); li.className='event-item';
    const tx=document.createElement('div'); tx.className='event-text';
    const prob = it.prob ? ` · ${it.prob}%` : '';
    tx.textContent = `${it.date} · ${it.text} · ${money(it.amount)}${prob}`;
    const row=document.createElement('div'); row.className='row';
    const del=document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar'; del.addEventListener('click',()=>{ state.futureIncomes=state.futureIncomes.filter(x=>x.id!==it.id); storage.set('futureIncomes', state.futureIncomes); fillFiList(); });
    row.appendChild(del);
    li.appendChild(tx); li.appendChild(row);
    list.appendChild(li);
  });
  renderFutureSummary();
}

// ====== Objetivos ======
const goalForm = document.getElementById('goal-form');
const goalTitle = document.getElementById('goal-title');
const goalCategory = document.getElementById('goal-category');
const goalPriority = document.getElementById('goal-priority');
const goalDue = document.getElementById('goal-due');
const goalsList = document.getElementById('goals-list');
const goalIdeas = document.getElementById('goal-ideas');
const goalsStats = document.getElementById('goals-stats');

function goalProgress(g){ const all=g.steps?.length||0; const done=(g.steps||[]).filter(s=>s.done).length; const p=all?Math.round(done*100/all):(g.done?100:0); return {all,done,p}; }
function renderGoals(){ if(!goalsList) return; goalsList.innerHTML='';
  const arr = state.goals.slice().sort((a,b)=>{
    const pr = (x)=>x==='alta'?3:(x==='media'?2:1);
    const ap=pr(a.priority||'baja'), bp=pr(b.priority||'baja'); if (ap!==bp) return bp-ap;
    const ad=a.due||'9999-99-99', bd=b.due||'9999-99-99'; return ad<bd?-1:1;
  });
  arr.forEach(g=>{
    const li=document.createElement('li'); li.className='event-item';
    const card=document.createElement('div'); card.className='goal-card';
    const left=document.createElement('div');
    const head=document.createElement('div'); head.className='goal-head';
    const title=document.createElement('div'); title.className='goal-title'; title.textContent=g.title; if (g.done) title.classList.add('done');
    const meta=document.createElement('div'); meta.className='goal-meta'; meta.textContent=[g.category||'', g.due?`vence ${g.due}`:'', g.priority||''].filter(Boolean).join(' · ');
    head.appendChild(title); head.appendChild(meta); left.appendChild(head);
    const prog=goalProgress(g); const bar=document.createElement('div'); bar.className='progress'; const fill=document.createElement('div'); fill.style.width=`${prog.p}%`; bar.appendChild(fill); left.appendChild(bar);
    const steps=document.createElement('ul'); steps.className='goal-steps';
    (g.steps||[]).forEach(s=>{
      const it=document.createElement('li'); it.className='goal-step';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!s.done; cb.addEventListener('change',()=>{ s.done=!!cb.checked; storage.set('goals', state.goals); renderGoals(); });
      const sp=document.createElement('span'); sp.textContent=s.text + (s.due?` (${s.due})`: ''); if(s.done) sp.style.textDecoration='line-through';
      const del=document.createElement('button'); del.className='minibtn danger'; del.textContent='Borrar'; del.addEventListener('click',()=>{ g.steps=g.steps.filter(x=>x.id!==s.id); storage.set('goals', state.goals); renderGoals(); });
      it.appendChild(cb); it.appendChild(sp); it.appendChild(del); steps.appendChild(it);
    });
    const addRow=document.createElement('div'); addRow.className='row';
    const inStep=document.createElement('input'); inStep.type='text'; inStep.placeholder='Nuevo paso';
    const inDue=document.createElement('input'); inDue.type='date';
    const addBtn=document.createElement('button'); addBtn.textContent='Agregar paso'; addBtn.addEventListener('click',()=>{ const t=(inStep.value||'').trim(); if(!t) return; g.steps=g.steps||[]; g.steps.push({id:crypto.randomUUID(), text:t, due:inDue.value||'', done:false}); inStep.value=''; inDue.value=''; storage.set('goals', state.goals); renderGoals(); });
    addRow.appendChild(inStep); addRow.appendChild(inDue); addRow.appendChild(addBtn);
    left.appendChild(steps); left.appendChild(addRow);

    const actions=document.createElement('div'); actions.className='row';
    const doneBtn=document.createElement('button'); doneBtn.className='minibtn'; doneBtn.textContent=g.done?'Reabrir':'Completar'; doneBtn.addEventListener('click',()=>{ g.done=!g.done; if(g.done){ (g.steps||[]).forEach(s=>s.done=true); } storage.set('goals', state.goals); renderGoals(); });
    const editBtn=document.createElement('button'); editBtn.className='minibtn'; editBtn.textContent='Editar'; editBtn.addEventListener('click', async ()=>{
      const res = await showFormModal({ title:'Editar objetivo', fields:[
        {name:'title', label:'Titulo', type:'text', value:g.title},
        {name:'category', label:'Categoria', type:'text', value:g.category||''},
        {name:'priority', label:'Prioridad', type:'select', options:[{value:'baja',label:'baja'},{value:'media',label:'media'},{value:'alta',label:'alta'}], value:g.priority||'baja'},
        {name:'due', label:'Vence', type:'date', value:g.due||''},
        {name:'notes', label:'Notas', type:'text', value:g.notes||''}
      ]}); if(!res) return; Object.assign(g, { title:(res.title||'').trim(), category:(res.category||'').trim(), priority:res.priority, due:res.due||'', notes:(res.notes||'').trim() }); storage.set('goals', state.goals); renderGoals(); });
    const delBtn=document.createElement('button'); delBtn.className='danger'; delBtn.textContent='Borrar'; delBtn.addEventListener('click',()=>{ if(!confirm('¿Borrar objetivo?')) return; state.goals = state.goals.filter(x=>x.id!==g.id); storage.set('goals', state.goals); renderGoals(); });
    actions.appendChild(doneBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);

    card.appendChild(left); card.appendChild(actions); li.appendChild(card); goalsList.appendChild(li);
  });
  if (goalsStats){ const total=state.goals.length; const done=state.goals.filter(g=>g.done).length; goalsStats.innerHTML = `<div><strong>Objetivos:</strong> ${done}/${total}</div>`; }
}

goalForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const title=(goalTitle?.value||'').trim(); if(!title) return; const g={ id:crypto.randomUUID(), title, category:(goalCategory?.value||'').trim(), priority:goalPriority?.value||'baja', due:goalDue?.value||'', notes:'', done:false, steps:[] }; state.goals.push(g); storage.set('goals', state.goals); goalForm.reset(); renderGoals(); });

goalIdeas?.addEventListener('input', ()=>{ storage.set('goalIdeas', goalIdeas.value); });

















