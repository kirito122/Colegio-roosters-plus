const $ = (selector) => document.querySelector(selector);
const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
let lessons = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

function parseSchedule(html, klas) {
  const documentFromSource = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...documentFromSource.querySelectorAll('#rooster_table tr')].slice(1);
  return rows.map((row, index) => {
    const cells = [...row.querySelectorAll('td')];
    const sourceTime = cells.shift()?.innerText.replace(/\s+/g, ' ').trim() || '';
    // The source sometimes renders e.g. "107:3008:15" (lesson 1 + both times).
    // Matching without word boundaries deliberately recovers 07:30 and 08:15.
    const clockTimes = sourceTime.match(/\d{1,2}:\d{2}/g) || [];
    const time = clockTimes.length >= 2 ? `${clockTimes[0]} – ${clockTimes[1]}` : sourceTime || `Lesuur ${index + 1}`;
    return { time, cells: cells.map(cell => {
      const raw = cell.innerText.replace(/\s+/g, ' ').trim().replace(klas, '').trim();
      if (!raw) return [];
      return raw.split(new RegExp(`\\s*${klas}\\s*`, 'g')).filter(Boolean).map(text => {
        const match = text.match(/^(.+?)\s+([A-Z]{1,4})\s+\((.+)\)$/i);
        return { raw:text, klas, room:match?.[1] || '', teacher:match?.[2] || '', subject:normalizeSubject(match?.[3] || text) };
      });
    }) };
  });
}

function normalizeSubject(value) {
  const subject = value.trim().replace(/\s+/g, ' ');
  // The timetable is inconsistent about capitals and spaces in these labels.
  if (/^en\s*eb$/i.test(subject)) return 'en';
  if (/^ne\s*eb$/i.test(subject)) return 'ne';
  if (/^wi\s*eb$/i.test(subject)) return 'wi B';
  if (/^wi\s*ea$/i.test(subject)) return 'wi A';
  return subject;
}

function mergeSchedules(schedules) {
  const parsed = schedules.map(data => parseSchedule(data.html, data.klas));
  if (!parsed.length) return [];
  return parsed[0].map((row, rowIndex) => ({
    time: row.time,
    cells: days.map((_, dayIndex) => parsed.flatMap(schedule => schedule[rowIndex]?.cells[dayIndex] || []))
  }));
}

function updateFilterOptions() {
  const unique = (key) => [...new Set(lessons.flatMap(row => row.cells.flat()).map(x => x[key]).filter(Boolean))].sort();
  for (const [id, key, label] of [['roomSelect','room','Alle lokalen'], ['teacherSelect','teacher','Alle docenten'], ['subjectSelect','subject','Alle vakken']]) {
    const selected = $(`#${id}`).value;
    $(`#${id}`).innerHTML = `<option value="">${label}</option>` + unique(key).map(x => `<option value="${x}">${x}</option>`).join('');
    $(`#${id}`).value = selected;
  }
  const selected = $('#periodSelect').value;
  $('#periodSelect').innerHTML = '<option value="">Alle lesuren</option>' + lessons.map((row, index) => `<option value="${index}">${index + 1} · ${row.time}</option>`).join('');
  $('#periodSelect').value = selected;
}

function updateSummary() {
  const klass = $('#classSelect').value;
  const requestedDay = $('#daySelect').value;
  const dayIndex = requestedDay ? days.indexOf(requestedDay) : 0;
  const day = days[dayIndex];
  const teacher = $('#teacherSelect').value, subject = $('#subjectSelect').value, room = $('#roomSelect').value;
  $('#summaryTitle').textContent = `${klass} · ${day}`;
  const cards = lessons.map((row, index) => {
    const slot = (row.cells[dayIndex] || []).filter(x => (!teacher || x.teacher === teacher) && (!subject || x.subject === subject) && (!room || x.room === room));
    const names = [...new Set(slot.map(x => x.teacher).filter(Boolean))];
    const lessonLabels = slot.map(x => `${x.klas} · ${x.subject}`);
    const details = lessonLabels.slice(0, 3).join(', ') + (lessonLabels.length > 3 ? ` + ${lessonLabels.length - 3} meer` : '');
    const rooms = [...new Set(slot.map(x => x.room).filter(Boolean))];
    return `<div class="summary-card ${slot.length ? '' : 'free'}"><b>${index + 1} · ${row.time}</b>${slot.length ? `${names.join(' + ') || 'Docent onbekend'} · ${details}<small>Lokaal: ${rooms.join(', ') || '—'}</small>` : 'Vrij uur — geen les'}</div>`;
  });
  $('#summaryCards').innerHTML = cards.join('');
}

function draw() {
  const teacher = $('#teacherSelect').value, subject = $('#subjectSelect').value, room = $('#roomSelect').value, dayFilter = $('#daySelect').value, period = $('#periodSelect').value, freeOnly = $('#freeOnly').checked;
  const grid = document.createElement('div'); grid.className = 'week';
  grid.append(document.createElement('div'));
  days.forEach(day => { const item=document.createElement('div'); item.className=`day ${dayFilter && day !== dayFilter ? 'dim' : ''}`; item.textContent=day; grid.append(item); });
  let shown = 0;
  for (const row of lessons) {
    const time = document.createElement('div'); time.className='time'; time.textContent=row.time; grid.append(time);
    row.cells.forEach((slot, dayIndex) => { const isActiveDay = !dayFilter || days[dayIndex] === dayFilter; const isActivePeriod = !period || Number(period) === lessons.indexOf(row); const visibleLessons = slot.filter(x => (!teacher || x.teacher === teacher) && (!subject || x.subject === subject) && (!room || x.room === room)); const shouldShowFree = freeOnly && slot.length === 0; const cell=document.createElement('div'); cell.className=`slot ${!isActiveDay || !isActivePeriod ? 'dim' : ''}`; if (isActiveDay && isActivePeriod && ((freeOnly && shouldShowFree) || (!freeOnly && visibleLessons.length))) { if (shouldShowFree) { shown++; cell.innerHTML='<div class="free-slot">Vrij uur</div>'; } else visibleLessons.forEach(x => { shown++; const card=$('#lessonTemplate').content.firstElementChild.cloneNode(true); card.querySelector('.subject').textContent=x.subject; card.querySelector('.student-class').textContent=x.klas; card.querySelector('.teacher').textContent=x.teacher || '—'; card.querySelector('.room').textContent=x.room || '—'; cell.append(card); }); } grid.append(cell); });
  }
  $('#schedule').replaceChildren(shown ? grid : Object.assign(document.createElement('p'), { className:'empty', textContent:'Geen lessen gevonden met deze filters.' }));
}

async function loadSchedule() {
  const klas = $('#classSelect').value; if (!klas) return;
  const isAllClasses = klas === 'all';
  $('#status').textContent = isAllClasses ? 'Alle klassen worden opgehaald. Dit kan de eerste keer even duren…' : `${klas} wordt opgehaald…`;
  try { const data = isAllClasses ? await request('/api/all-schedules') : await request(`/api/schedule?class=${encodeURIComponent(klas)}`); lessons = isAllClasses ? mergeSchedules(data.schedules) : parseSchedule(data.html, klas); updateFilterOptions(); updateSummary(); draw(); $('#updated').textContent = new Date(data.sourceUpdatedAt).toLocaleString('nl-NL'); $('#status').textContent = isAllClasses ? `Alle klassen · ${data.schedules.length} roosters geladen` : `${klas} · ${data.cached ? 'opgeslagen versie' : 'zojuist bijgewerkt'} · ${lessons.length} lesuren`; }
  catch (error) { $('#schedule').innerHTML = `<p class="empty">${error.message}</p>`; $('#status').textContent = 'Rooster niet beschikbaar.'; }
}

async function init() {
  const data = await request('/api/classes');
  $('#classSelect').innerHTML = '<option value="all">Alle klassen — lokaal zoeken</option>' + data.classes.map(x => `<option value="${x}">${x}</option>`).join('');
  $('#classSelect').value = localStorage.getItem('colegio-class') || 'CB1a';
  await loadSchedule();
}
$('#classSelect').addEventListener('change', () => { localStorage.setItem('colegio-class', $('#classSelect').value); loadSchedule(); });
['roomSelect', 'teacherSelect', 'subjectSelect', 'periodSelect', 'freeOnly'].forEach(id => $(`#${id}`).addEventListener('change', () => { updateSummary(); draw(); }));
$('#daySelect').addEventListener('change', () => { updateSummary(); draw(); });
$('#overviewToggle').addEventListener('click', () => {
  const overview = $('#dayOverview');
  const isNowVisible = overview.hidden;
  overview.hidden = !isNowVisible;
  $('#overviewToggle').textContent = isNowVisible ? 'Verberg dagoverzicht' : 'Toon dagoverzicht';
  $('#overviewToggle').setAttribute('aria-expanded', String(!isNowVisible));
});
$('#clear').addEventListener('click', () => { $('#daySelect').value=''; $('#periodSelect').value=''; $('#roomSelect').value=''; $('#teacherSelect').value=''; $('#subjectSelect').value=''; $('#freeOnly').checked=false; updateSummary(); draw(); });
$('#refresh').addEventListener('click', async () => { await request('/api/refresh', {method:'POST'}); loadSchedule(); });
init().catch(error => { $('#status').textContent=error.message; });
