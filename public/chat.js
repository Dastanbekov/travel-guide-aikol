
// ── State ──────────────────────────────────────────────────────────────────────
let sessionId = null;
let currentMode = 'info';
let isStreaming = false;

// ── Elements ──────────────────────────────────────────────────────────────────
const chatMessages    = document.getElementById('chatMessages');
const chatInput       = document.getElementById('chatInput');
const sendBtn         = document.getElementById('sendBtn');
const modeIndicator   = document.getElementById('modeIndicator');
const modeLabel       = document.getElementById('modeLabel');
const modeDot         = modeIndicator.querySelector('.mode-dot');
const bookingBanner   = document.getElementById('bookingBanner');
const bookingTrigger  = document.getElementById('bookingTriggerBtn');
const exitBookingBtn  = document.getElementById('exitBookingBtn');
const bookingModal    = document.getElementById('bookingModal');
const modalClose      = document.getElementById('modalClose');
const modalBookingId  = document.getElementById('modalBookingId');
const welcomeScreen   = document.getElementById('welcomeScreen');
const menuBtn         = document.getElementById('menuBtn');
const chatSidebar     = document.getElementById('chatSidebar');
const sidebarClose    = document.getElementById('sidebarClose');
const newChatBtn      = document.getElementById('newChatBtn');

// ── Input auto-resize + enable send ───────────────────────────────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '' || isStreaming;
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// ── Sidebar toggle ─────────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => chatSidebar.classList.add('open'));
sidebarClose.addEventListener('click', () => chatSidebar.classList.remove('open'));

// ── New Chat ───────────────────────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  sessionId = null;
  currentMode = 'info';
  chatMessages.innerHTML = '';
  chatMessages.appendChild(createWelcome());
  setMode('info');
  chatSidebar.classList.remove('open');
});

// ── Send ───────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);

// ── Quick topics / suggestions ─────────────────────────────────────────────────
document.querySelectorAll('.topic-btn, .suggestion-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const msg = btn.dataset.msg;
    if (msg) {
      chatInput.value = msg;
      chatInput.dispatchEvent(new Event('input'));
      sendMessage();
      chatSidebar.classList.remove('open');
    }
  });
});

// ── Booking mode toggle ────────────────────────────────────────────────────────
bookingTrigger.addEventListener('click', () => {
  setMode('booking');
  addSystemMsg('🎯 Booking Manager Mode activated! I\'m now your personal booking agent. Tell me what you\'d like to book — hotel, tour, transfer, or any other service!');
});

exitBookingBtn.addEventListener('click', () => {
  setMode('info');
  addSystemMsg('👋 Switched back to Travel Guide mode. Feel free to ask anything about Kyrgyzstan!');
});

modalClose.addEventListener('click', () => bookingModal.style.display = 'none');
bookingModal.addEventListener('click', (e) => { if (e.target === bookingModal) bookingModal.style.display = 'none'; });

// ── Core: set mode ─────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  if (mode === 'booking') {
    modeDot.className = 'mode-dot mode-dot--booking';
    modeLabel.textContent = 'Booking Manager Mode';
    bookingBanner.style.display = 'block';
    bookingTrigger.style.display = 'none';
  } else {
    modeDot.className = 'mode-dot mode-dot--info';
    modeLabel.textContent = 'Travel Guide Mode';
    bookingBanner.style.display = 'none';
    bookingTrigger.style.display = '';
  }
  // Sync with server if we have a session
  if (sessionId) {
    fetch(`/api/session/${sessionId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    }).catch(() => {});
  }
}

// ── Core: send message ─────────────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  // Remove welcome screen
  const ws = document.getElementById('welcomeScreen');
  if (ws) ws.remove();

  // Add user message
  appendMsg('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  isStreaming = true;

  // Add AI typing indicator
  const typingEl = appendTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, mode: currentMode })
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';
    let aiBubble = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'session') {
            sessionId = parsed.sessionId;
          } else if (parsed.type === 'token') {
            if (!aiBubble) {
              typingEl.remove();
              aiBubble = appendMsg('ai', '');
            }
            aiText += parsed.content;
            aiBubble.querySelector('.msg-bubble').innerHTML = renderMarkdown(aiText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else if (parsed.type === 'booking') {
            modalBookingId.textContent = 'Booking ID: ' + parsed.bookingId;
            bookingModal.style.display = 'flex';
          } else if (parsed.type === 'error') {
            if (!aiBubble) typingEl.remove();
            addSystemMsg('❌ Error: ' + parsed.message);
          }
        } catch {}
      }
    }
  } catch (err) {
    typingEl.remove();
    addSystemMsg('❌ Connection error. Please try again.');
    console.error(err);
  }

  isStreaming = false;
  sendBtn.disabled = chatInput.value.trim() === '';
}

// ── DOM helpers ────────────────────────────────────────────────────────────────
function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? `
      <img src="/logo.png" style="width: 20px; height: 20px; object-fit: contain; border-radius: 50%;">` : '👤'}</div>
    <div class="msg-bubble">${role === 'ai' ? renderMarkdown(text) : escHtml(text)}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-avatar">
      <img src="/logo.png" style="width: 20px; height: 20px; object-fit: contain; border-radius: 50%;">
    </div>
    <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;font-size:.82rem;color:var(--text2);padding:.5rem';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createWelcome() {
  const div = document.createElement('div');
  div.id = 'welcomeScreen';
  div.className = 'welcome-screen';
  div.innerHTML = `
    <div class="welcome-icon"><img src="/logo.png" style="width: 48px; height: 48px; object-fit: contain;"></div>
    <h2>Привет! I'm AIKol</h2>
    <p>Your personal guide to beautiful Kyrgyzstan.<br/>Ask me anything — I speak your language!</p>
    <div class="welcome-suggestions">
      <button class="suggestion-pill" data-msg="What are the most beautiful places in Kyrgyzstan?">Most beautiful places?</button>
      <button class="suggestion-pill" data-msg="How much does a week trip to Kyrgyzstan cost?">Trip budget estimate</button>
      <button class="suggestion-pill" data-msg="What visa do I need for Kyrgyzstan?">Visa requirements</button>
      <button class="suggestion-pill" data-msg="Recommend a 7-day Kyrgyzstan itinerary">7-day itinerary</button>
    </div>
  `;
  div.querySelectorAll('.suggestion-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.msg;
      chatInput.dispatchEvent(new Event('input'));
      sendMessage();
    });
  });
  return div;
}

// ── Markdown renderer (minimal) ────────────────────────────────────────────────
function renderMarkdown(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--bg3);padding:.1rem .3rem;border-radius:3px;font-size:.85em">$1</code>')
    .replace(/\n/g, '<br>');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
