/* =========================================================
   스터디로그 - 메인 로직
   구성: (A) 저장 도우미  (B) 탭  (C) 타이머  (D) 노트  (E) 문제 출제
   데이터는 모두 브라우저 localStorage 에 저장됩니다.
   ========================================================= */

/* =========================================================
   (A) localStorage 저장/불러오기 도우미
   - localStorage 는 문자열만 저장 가능해서 JSON 으로 변환해 사용
   ========================================================= */
const KEY = {
  sessions: 'studylog_sessions', // 공부 기록 배열
  notes:    'studylog_notes',    // 노트 배열
};

function load(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// 화면에 보이는 동안 메모리에 들고 있을 데이터
let sessions = load(KEY.sessions, []);
let notes    = load(KEY.notes, []);


/* =========================================================
   (B) 탭 전환
   ========================================================= */
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab; // 'timer' | 'notes' | 'quiz'

    // 버튼 활성화 상태 변경
    tabButtons.forEach(b => b.classList.toggle('is-active', b === btn));

    // 패널 표시 전환
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('is-active', panel.id === 'tab-' + target);
    });

    // 문제 탭으로 가면 노트 목록을 드롭다운에 다시 채움
    if (target === 'quiz') fillQuizSourceOptions();
  });
});


/* =========================================================
   (C) 타이머 + 집중 모드
   - 일시정지/재개를 지원하려고 '누적 시간' 방식을 씀
     총 시간 = accumulated(이전까지 쌓인 시간) + (작동중이면 지금-segmentStart)
   - 집중 모드: 시작하면 다른 탭이 잠기고,
     탭 전환/최소화로 자리를 비우면 자동 일시정지(그 시간은 안 셈)
   ========================================================= */
const subjectInput = document.getElementById('subject-input');
const clockEl      = document.getElementById('clock');
const startBtn     = document.getElementById('start-btn');
const stopBtn      = document.getElementById('stop-btn');
const focusStatus  = document.getElementById('focus-status');

let timerId      = null;  // 화면 갱신용 setInterval ID
let running      = false; // 지금 시간이 흐르는 중인가
let active       = false; // 세션이 진행 중인가(시작~정지 사이) → 탭 잠금 기준
let accumulated  = 0;     // 이전 구간들에서 쌓인 시간(ms)
let segmentStart = 0;     // 현재 구간 시작 시각(ms)
let leaveCount   = 0;     // 자리 비운(이탈) 횟수

// 지금까지 측정된 총 시간(ms)
function elapsedMs() {
  return accumulated + (running ? Date.now() - segmentStart : 0);
}

// 타이머 탭을 뺀 나머지 탭 버튼들 (잠금 대상)
const lockableTabs = [...document.querySelectorAll('.tab-btn')]
  .filter(b => b.dataset.tab !== 'timer');
function lockTabs(lock) {
  lockableTabs.forEach(b => { b.disabled = lock; });
}

// 집중 모드 상태 문구 갱신
function updateFocusStatus() {
  if (!active) { focusStatus.hidden = true; return; }
  focusStatus.hidden = false;
  const state = running ? '🟢 집중 중' : '⏸️ 일시정지 (자리 비움)';
  focusStatus.textContent = `${state} · 이탈 ${leaveCount}회 · 다른 탭은 정지 후 이용 가능`;
  focusStatus.classList.toggle('is-paused', !running);
}

// 밀리초 -> "HH:MM:SS" 문자열
function formatClock(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── 시작 ──
function startTimer() {
  active = true;
  running = true;
  accumulated = 0;
  segmentStart = Date.now();
  leaveCount = 0;

  clockEl.classList.add('is-running');
  startBtn.disabled = true;
  stopBtn.disabled  = false;
  subjectInput.disabled = true;
  lockTabs(true);          // 다른 탭 잠금
  updateFocusStatus();

  // 0.5초마다 화면 갱신
  timerId = setInterval(() => {
    clockEl.textContent = formatClock(elapsedMs());
  }, 500);
}

// ── 일시정지 (자리 비울 때 자동 호출) ──
function pauseTimer() {
  if (!running) return;
  accumulated += Date.now() - segmentStart; // 지금까지 흐른 만큼 누적에 저장
  running = false;
  clockEl.classList.remove('is-running');
  updateFocusStatus();
}

// ── 재개 (돌아왔을 때 자동 호출) ──
function resumeTimer() {
  if (!active || running) return;
  running = true;
  segmentStart = Date.now();
  clockEl.classList.add('is-running');
  updateFocusStatus();
}

// ── 정지 & 저장 ──
function stopTimer() {
  const total = elapsedMs(); // 멈추기 전에 총 시간 먼저 계산
  clearInterval(timerId);
  timerId = null;
  running = false;
  active  = false;

  const subject = subjectInput.value.trim() || '기타';

  // 너무 짧은(2초 미만) 기록은 무시
  if (total >= 2000) {
    sessions.unshift({ subject, ms: total, date: new Date().toISOString() });
    save(KEY.sessions, sessions);
    renderTimer();
  }

  // UI 초기화 + 탭 잠금 해제
  clockEl.textContent = '00:00:00';
  clockEl.classList.remove('is-running');
  startBtn.disabled = false;
  stopBtn.disabled  = true;
  subjectInput.disabled = false;
  lockTabs(false);
  focusStatus.hidden = true;
}

startBtn.addEventListener('click', startTimer);
stopBtn.addEventListener('click', stopTimer);

// ── 이탈 감지: 브라우저 탭 전환/창 최소화 시 자동 일시정지 ──
// document.hidden 이 true 가 되면 화면이 안 보이는 상태(딴 곳을 봄)
document.addEventListener('visibilitychange', () => {
  if (!active) return;                // 세션 중일 때만 작동
  if (document.hidden) {
    leaveCount++;
    pauseTimer();                     // 자리 비움 → 멈춤 (그 시간은 안 셈)
  } else {
    resumeTimer();                    // 돌아옴 → 이어서 셈
  }
});

// ── 창 닫기/새로고침 경고 ──
// 세션이 진행 중이면 브라우저 기본 확인창을 띄움 (실수로 닫는 것 방지)
window.addEventListener('beforeunload', (e) => {
  if (active) { e.preventDefault(); e.returnValue = ''; }
});

// ms -> "1시간 23분" 같은 사람이 읽기 좋은 문자열
function humanDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// 오늘 날짜인지 확인
function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

// 타이머 탭 전체(통계 + 목록) 다시 그리기
function renderTimer() {
  // 1) 오늘 총합
  const todayMs = sessions
    .filter(s => isToday(s.date))
    .reduce((sum, s) => sum + s.ms, 0);
  document.getElementById('today-total').textContent =
    todayMs ? humanDuration(todayMs) : '0분';

  // 2) 과목별 총합 (오늘 기준)
  const bySubject = {};
  sessions.filter(s => isToday(s.date)).forEach(s => {
    bySubject[s.subject] = (bySubject[s.subject] || 0) + s.ms;
  });
  const statsEl = document.getElementById('subject-stats');
  statsEl.innerHTML = '';
  Object.entries(bySubject)
    .sort((a, b) => b[1] - a[1]) // 시간 많은 순으로 정렬
    .forEach(([subject, ms]) => {
      const row = document.createElement('div');
      row.className = 'subject-row';
      row.innerHTML = `<span>${escapeHtml(subject)}</span><span>${humanDuration(ms)}</span>`;
      statsEl.appendChild(row);
    });

  // 3) 최근 기록 목록 (최대 20개)
  const listEl = document.getElementById('session-list');
  listEl.innerHTML = '';
  if (sessions.length === 0) {
    listEl.innerHTML = '<li class="empty">아직 기록이 없어요. 타이머를 시작해 보세요.</li>';
    return;
  }
  sessions.slice(0, 20).forEach(s => {
    const li = document.createElement('li');
    const when = new Date(s.date);
    const timeLabel = when.toLocaleString('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(s.subject)}</strong>
        <div class="session-meta">${timeLabel}</div>
      </div>
      <span>${humanDuration(s.ms)}</span>`;
    listEl.appendChild(li);
  });
}

// 기록 전체 삭제
document.getElementById('clear-sessions').addEventListener('click', () => {
  if (confirm('모든 공부 기록을 지울까요?')) {
    sessions = [];
    save(KEY.sessions, sessions);
    renderTimer();
  }
});


/* =========================================================
   (D) 노트 (만들기 / 수정 / 삭제)
   ========================================================= */
const noteTitle   = document.getElementById('note-title');
const noteBody    = document.getElementById('note-body');
const saveNoteBtn = document.getElementById('save-note');
const cancelBtn   = document.getElementById('cancel-edit');
const formTitle   = document.getElementById('note-form-title');

let editingId = null; // 수정 중인 노트 id (null 이면 새 노트)

saveNoteBtn.addEventListener('click', () => {
  const title = noteTitle.value.trim();
  const body  = noteBody.value.trim();
  if (!title && !body) return; // 둘 다 비면 무시

  if (editingId) {
    // 기존 노트 수정
    const note = notes.find(n => n.id === editingId);
    note.title = title;
    note.body  = body;
  } else {
    // 새 노트 추가 (id 는 현재 시각으로 간단히 생성)
    notes.unshift({ id: Date.now(), title, body });
  }
  save(KEY.notes, notes);
  resetNoteForm();
  renderNotes();
});

cancelBtn.addEventListener('click', resetNoteForm);

function resetNoteForm() {
  editingId = null;
  noteTitle.value = '';
  noteBody.value  = '';
  formTitle.textContent = '새 노트';
  cancelBtn.hidden = true;
}

function startEditNote(id) {
  const note = notes.find(n => n.id === id);
  editingId = id;
  noteTitle.value = note.title;
  noteBody.value  = note.body;
  formTitle.textContent = '노트 수정';
  cancelBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteNote(id) {
  if (!confirm('이 노트를 삭제할까요?')) return;
  notes = notes.filter(n => n.id !== id);
  save(KEY.notes, notes);
  renderNotes();
}

function renderNotes() {
  const listEl = document.getElementById('note-list');
  listEl.innerHTML = '';
  if (notes.length === 0) {
    listEl.innerHTML = '<li class="empty">노트가 없어요. 위에서 첫 노트를 작성해 보세요.</li>';
    return;
  }
  notes.forEach(note => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="note-item-head">
        <strong>${escapeHtml(note.title || '(제목 없음)')}</strong>
        <div class="note-actions">
          <button class="icon-btn" data-edit="${note.id}">수정</button>
          <button class="icon-btn" data-del="${note.id}">삭제</button>
        </div>
      </div>
      <p class="note-preview">${escapeHtml(note.body)}</p>`;
    listEl.appendChild(li);
  });

  // 버튼 이벤트 연결
  listEl.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => startEditNote(Number(b.dataset.edit))));
  listEl.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => deleteNote(Number(b.dataset.del))));
}


/* =========================================================
   (E) 문제 출제 — 노트 내용으로 문제를 자동 생성
   두 가지 방식:
     1) 플래시카드: '질문 :: 답' 형식의 줄을 찾아 만든다
     2) 빈칸 채우기: 일반 문장에서 핵심어 하나를 가린다
   ========================================================= */

// 문제 탭 드롭다운에 노트 목록 채우기
function fillQuizSourceOptions() {
  const sel = document.getElementById('quiz-source');
  sel.innerHTML = '<option value="all">전체 노트</option>';
  notes.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = n.title || '(제목 없음)';
    sel.appendChild(opt);
  });
}

// 선택한 노트들의 본문을 하나로 합쳐 가져오기
function getSourceText() {
  const sel = document.getElementById('quiz-source');
  if (sel.value === 'all') {
    return notes.map(n => n.body).join('\n');
  }
  const note = notes.find(n => n.id === Number(sel.value));
  return note ? note.body : '';
}

/* --- 방식 1: 플래시카드 만들기 ---
   '질문 :: 답' 형식의 줄을 골라 {q, a} 객체로 변환 */
function makeFlashcards(text) {
  return text.split('\n')
    .filter(line => line.includes('::'))
    .map(line => {
      const [q, a] = line.split('::');
      return { q: q.trim(), a: a.trim() };
    })
    .filter(card => card.q && card.a); // 질문/답 둘 다 있어야 함
}

/* --- 방식 2: 빈칸 채우기 만들기 ---
   문장을 나누고, 각 문장에서 '가장 핵심어 같은 단어'를 가린다.
   여기서 핵심어 선정 규칙은 단순 휴리스틱:
     - 어절(공백 기준 단어) 중 길이가 가장 긴 것을 핵심어로 본다
     - 길이 2 미만이거나 숫자뿐인 어절은 제외
   ★ 이 규칙을 개선하는 게 좋은 알고리즘 연습이 됩니다.
     (예: 조사 제거, 명사 추출, 사용자가 *별표*로 표시한 단어 우선 등) */
function makeClozeQuestions(text) {
  // 줄바꿈 또는 마침표/물음표/느낌표 뒤에서 문장 분리
  // '::' 가 든 줄은 플래시카드용이니 빈칸 문제에서는 제외
  const sentences = text
    .split(/\n+|(?<=[.!?。])\s+|·/)
    .map(s => s.trim())
    .filter(s => s.length >= 8 && !s.includes('::'));

  const questions = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);

    // 후보 단어들: 길이 2 이상, 순수 숫자/기호 제외
    const candidates = words.filter(w => {
      const clean = w.replace(/[^\w가-힣]/g, ''); // 양끝 문장부호 제거 후 길이 확인
      return clean.length >= 2 && /[가-힣A-Za-z]/.test(clean);
    });
    if (candidates.length === 0) continue;

    // 가장 긴 단어를 정답으로 선택
    const answer = candidates.reduce((a, b) => (b.length > a.length ? b : a));

    // 문장에서 그 단어를 빈칸(_____)으로 교체
    const blanked = sentence.replace(answer, '_____');

    questions.push({ sentence: blanked, answer: answer.replace(/[^\w가-힣]/g, '') });
  }
  return questions;
}

// 배열을 무작위로 섞기 (Fisher–Yates 셔플)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* --- 퀴즈 진행 상태 --- */
let quiz = { items: [], index: 0, score: 0 };

document.getElementById('generate-quiz').addEventListener('click', () => {
  const type = document.querySelector('input[name="quiz-type"]:checked').value;
  const text = getSourceText();

  let items;
  if (type === 'flashcard') {
    items = makeFlashcards(text).map(c => ({ q: c.q, a: c.a }));
  } else {
    items = makeClozeQuestions(text).map(c => ({ q: c.sentence, a: c.answer }));
  }

  if (items.length === 0) {
    alert(type === 'flashcard'
      ? "'질문 :: 답' 형식의 줄이 노트에 없어요.\n노트에 예) 이진 탐색의 시간복잡도는? :: O(log n)  처럼 적어보세요."
      : '빈칸으로 만들 만한 문장이 부족해요. 노트에 일반 문장을 더 적어보세요.');
    return;
  }

  quiz = { items: shuffle(items).slice(0, 10), index: 0, score: 0 };
  showQuestion();
});

const quizArea     = document.getElementById('quiz-area');
const quizResult   = document.getElementById('quiz-result');
const questionEl   = document.getElementById('quiz-question');
const answerEl     = document.getElementById('quiz-answer');
const revealBtn    = document.getElementById('reveal-btn');
const gradeButtons = document.getElementById('grade-buttons');

function showQuestion() {
  quizArea.hidden = false;
  quizResult.hidden = true;

  const item = quiz.items[quiz.index];
  questionEl.textContent = item.q;

  // 답/채점 영역 초기화
  answerEl.hidden = true;
  answerEl.textContent = item.a;
  revealBtn.hidden = false;
  gradeButtons.hidden = true;

  document.getElementById('quiz-counter').textContent =
    `${quiz.index + 1} / ${quiz.items.length}`;
  document.getElementById('quiz-score').textContent = `맞춤 ${quiz.score}`;
}

// '정답 확인' -> 답을 보여주고 채점 버튼 노출
revealBtn.addEventListener('click', () => {
  answerEl.hidden = false;
  revealBtn.hidden = true;
  gradeButtons.hidden = false;
});

// 채점: 맞췄으면 점수 +1, 다음 문제로
function grade(correct) {
  if (correct) quiz.score++;
  quiz.index++;
  if (quiz.index < quiz.items.length) {
    showQuestion();
  } else {
    showResult();
  }
}
document.getElementById('mark-right').addEventListener('click', () => grade(true));
document.getElementById('mark-wrong').addEventListener('click', () => grade(false));

function showResult() {
  quizArea.hidden = true;
  quizResult.hidden = false;
  const total = quiz.items.length;
  const pct = Math.round((quiz.score / total) * 100);
  document.getElementById('result-text').textContent =
    `${total}문제 중 ${quiz.score}개 정답 (${pct}점)`;
}

document.getElementById('retry-quiz').addEventListener('click', () => {
  quizResult.hidden = true;
  quiz.index = 0;
  quiz.score = 0;
  quiz.items = shuffle(quiz.items);
  showQuestion();
});


/* =========================================================
   유틸: HTML 특수문자 escape (XSS/깨짐 방지)
   사용자가 입력한 글자를 화면에 안전하게 넣기 위함
   ========================================================= */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* =========================================================
   첫 화면 그리기
   ========================================================= */
renderTimer();
renderNotes();
fillQuizSourceOptions();
