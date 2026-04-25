
// ── State ──────────────────────────────────────────────────────────────────────
let bizId = null;
let bizName = '';

// ── Auth elements ──────────────────────────────────────────────────────────────
const authOverlay  = document.getElementById('authOverlay');
const dashboard    = document.getElementById('dashboard');
const loginForm    = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginEmail   = document.getElementById('loginEmail');
const loginPass    = document.getElementById('loginPassword');
const loginErr     = document.getElementById('loginError');
const loginBtn     = document.getElementById('loginBtn');
const regName      = document.getElementById('regName');
const regCat       = document.getElementById('regCategory');
const regEmail     = document.getElementById('regEmail');
const regPass      = document.getElementById('regPassword');
const regErr       = document.getElementById('regError');
const registerBtn  = document.getElementById('registerBtn');
const goRegister   = document.getElementById('goRegister');
const goLogin      = document.getElementById('goLogin');
const logoutBtn    = document.getElementById('logoutBtn');

// ── Dashboard elements ─────────────────────────────────────────────────────────
const dashBizName    = document.getElementById('dashBizName');
const overviewTitle  = document.getElementById('overviewTitle');
const statViews      = document.getElementById('statViews');
const statInquiries  = document.getElementById('statInquiries');
const statConversions= document.getElementById('statConversions');
const statConvRate   = document.getElementById('statConvRate');
const overviewLeads  = document.getElementById('overviewLeads');
const leadsFullList  = document.getElementById('leadsFullList');
const bookingsList   = document.getElementById('bookingsList');
const leadsBadge     = document.getElementById('leadsBadge');
const agentStatusDot = document.getElementById('agentStatusDot');
const agentStatusText= document.getElementById('agentStatusText');
const agentStatusSub = document.getElementById('agentStatusSub');
const saveContextBtn = document.getElementById('saveContextBtn');
const contextBanner  = document.getElementById('contextSaveBanner');
const testInput      = document.getElementById('testInput');
const testSendBtn    = document.getElementById('testSendBtn');
const testMessages   = document.getElementById('testChatMessages');

// ── Auth: toggle forms ─────────────────────────────────────────────────────────
goRegister.addEventListener('click', (e) => { e.preventDefault(); loginForm.style.display='none'; registerForm.style.display='block'; });
goLogin.addEventListener('click',    (e) => { e.preventDefault(); registerForm.style.display='none'; loginForm.style.display='block'; });

// ── Auth: Login ────────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const pass  = loginPass.value;
  if (!email || !pass) { showErr(loginErr, 'Please fill all fields'); return; }
  loginBtn.textContent = 'Signing in...';
  loginBtn.disabled = true;
  try {
    const res = await fetch('/api/business/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { showErr(loginErr, data.error || 'Login failed'); return; }
    enterDashboard(data.businessId, data.name);
  } catch { showErr(loginErr, 'Network error'); }
  finally { loginBtn.textContent = 'Sign In'; loginBtn.disabled = false; }
});

// ── Auth: Register ─────────────────────────────────────────────────────────────
registerBtn.addEventListener('click', async () => {
  const name  = regName.value.trim();
  const email = regEmail.value.trim();
  const pass  = regPass.value;
  const cat   = regCat.value;
  if (!name || !email || !pass) { showErr(regErr, 'Please fill all fields'); return; }
  if (pass.length < 6) { showErr(regErr, 'Password must be at least 6 characters'); return; }
  registerBtn.textContent = 'Creating account...';
  registerBtn.disabled = true;
  try {
    const res = await fetch('/api/business/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass, category: cat })
    });
    const data = await res.json();
    if (!res.ok) { showErr(regErr, data.error || 'Registration failed'); return; }
    enterDashboard(data.businessId, data.name);
  } catch { showErr(regErr, 'Network error'); }
  finally { registerBtn.textContent = 'Create Account'; registerBtn.disabled = false; }
});

// ── Logout ─────────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  bizId = null; bizName = '';
  sessionStorage.removeItem('bizId');
  sessionStorage.removeItem('bizName');
  dashboard.style.display = 'none';
  authOverlay.style.display = 'flex';
});

// ── Enter dashboard ────────────────────────────────────────────────────────────
function enterDashboard(id, name) {
  bizId = id; bizName = name;
  sessionStorage.setItem('bizId', id);
  sessionStorage.setItem('bizName', name);
  authOverlay.style.display = 'none';
  dashboard.style.display = 'flex';
  dashBizName.textContent = name;
  overviewTitle.textContent = `Welcome back, ${name} 👋`;
  loadDashboard();
  setInterval(loadDashboard, 30000); // refresh every 30s
}

// ── Load dashboard data ────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res  = await fetch(`/api/business/${bizId}/dashboard`);
    const data = await res.json();
    if (!res.ok) return;

    // Stats
    statViews.textContent       = data.analytics.views.toLocaleString();
    statInquiries.textContent   = data.analytics.inquiries.toLocaleString();
    statConversions.textContent = data.analytics.conversions.toLocaleString();
    const rate = data.analytics.inquiries > 0
      ? Math.round((data.analytics.conversions / data.analytics.inquiries) * 100) : 0;
    statConvRate.textContent = rate + '%';
    leadsBadge.textContent   = data.leads.length;

    // Agent status
    if (data.contextFilled) {
      agentStatusDot.className  = 'agent-status-dot';
      agentStatusText.textContent = '✅ AI Agent is Active';
      agentStatusSub.textContent  = 'Responding to tourists with your business data';
    } else {
      agentStatusDot.className  = 'agent-status-dot warning';
      agentStatusText.textContent = '⚠️ Context Not Configured';
      agentStatusSub.textContent  = 'Add your business info to activate the AI agent';
    }

    // Overview leads (last 3)
    overviewLeads.innerHTML = '';
    if (data.leads.length === 0) {
      overviewLeads.innerHTML = '<p style="color:var(--text2);font-size:.85rem">No leads yet. Share the chat link with tourists!</p>';
    } else {
      data.leads.slice(0, 3).forEach(l => {
        overviewLeads.appendChild(buildLeadItem(l, true));
      });
    }

    // Full leads list
    leadsFullList.innerHTML = '';
    if (data.leads.length === 0) {
      leadsFullList.innerHTML = '<p style="color:var(--text2);font-size:.9rem">No leads yet.</p>';
    } else {
      data.leads.forEach(l => leadsFullList.appendChild(buildLeadItem(l, false)));
    }

    // Bookings
    bookingsList.innerHTML = '';
    if (data.bookings.length === 0) {
      bookingsList.innerHTML = '<p style="color:var(--text2);font-size:.9rem">No bookings yet.</p>';
    } else {
      data.bookings.forEach(b => {
        const el = document.createElement('div');
        el.className = 'booking-item';
        el.innerHTML = `
          <div class="booking-item-icon">🛎️</div>
          <div class="booking-item-body">
            <div class="booking-item-name">${esc(b.guestName || 'Guest')}</div>
            <div class="booking-item-detail">${esc(b.dates || '')} · ${esc(b.room || b.service || '')}</div>
            <div class="booking-item-detail" style="margin-top:.2rem;color:var(--accent)">${esc(b.total || '')}</div>
          </div>
          <div class="booking-status">${esc(b.status)}</div>
        `;
        bookingsList.appendChild(el);
      });
    }

    // Prefill context form
    const ctxFields = ['Description','Services','Prices','Locations','Features'];
    ctxFields.forEach(f => {
      const el = document.getElementById('ctx' + f);
      if (el && data[f.toLowerCase()] !== undefined) el.value = data[f.toLowerCase()] || '';
    });

  } catch (err) { console.error('Dashboard load error', err); }
}

function buildLeadItem(l, compact) {
  const el = document.createElement('div');
  el.className = compact ? 'lead-item' : 'lead-full-item';
  el.innerHTML = `
    <div class="lead-item-top">
      <span class="lead-id">#${esc(l.id)}</span>
      <span class="lead-time">${formatTime(l.timestamp)}</span>
    </div>
    <div class="lead-text">${esc(l.conversation || '')}</div>
    <div class="lead-status ${l.status === 'confirmed' ? 'confirmed' : ''}">${esc(l.status || 'pending')}</div>
  `;
  return el;
}

// ── Tab navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll('.dash-nav-item, [data-tab]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    if (!tab) return;
    document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.dash-nav-item[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById('tab-' + tab)?.classList.add('active');
    if (tab === 'context') prefillContext();
  });
});

// ── Prefill context form ───────────────────────────────────────────────────────
async function prefillContext() {
  try {
    const res  = await fetch(`/api/business/${bizId}/dashboard`);
    const data = await res.json();
    if (!res.ok) return;
    const map = { Description: 'description', Services: 'services', Prices: 'prices', Locations: 'locations', Features: 'features' };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById('ctx' + id);
      if (el) el.value = data[key] || '';
    });
  } catch {}
}

// ── Save context ───────────────────────────────────────────────────────────────
saveContextBtn.addEventListener('click', async () => {
  saveContextBtn.textContent = 'Saving...';
  saveContextBtn.disabled = true;
  try {
    const body = {
      description: document.getElementById('ctxDescription').value,
      services:    document.getElementById('ctxServices').value,
      prices:      document.getElementById('ctxPrices').value,
      locations:   document.getElementById('ctxLocations').value,
      features:    document.getElementById('ctxFeatures').value,
    };
    const res = await fetch(`/api/business/${bizId}/context`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      contextBanner.style.display = 'flex';
      setTimeout(() => { contextBanner.style.display = 'none'; }, 3000);
    }
  } catch {}
  saveContextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save & Train AI Agent`;
  saveContextBtn.disabled = false;
});

// ── Test AI chat ───────────────────────────────────────────────────────────────
testSendBtn.addEventListener('click', sendTestMsg);
testInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTestMsg(); });

async function sendTestMsg() {
  const text = testInput.value.trim();
  if (!text || !bizId) return;

  // Clear intro
  const intro = testMessages.querySelector('.test-chat-intro');
  if (intro) intro.remove();

  appendTestMsg('user', text);
  testInput.value = '';
  testSendBtn.disabled = true;

  const typingEl = appendTestTyping();

  try {
    const res = await fetch(`/api/business/${bizId}/test-chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';
    let aiBubble = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            if (!aiBubble) { typingEl.remove(); aiBubble = appendTestMsg('ai', ''); }
            aiText += parsed.content;
            aiBubble.querySelector('.msg-bubble').innerHTML = renderMd(aiText);
            testMessages.scrollTop = testMessages.scrollHeight;
          }
        } catch {}
      }
    }
  } catch {
    typingEl.remove();
  }
  testSendBtn.disabled = false;
}

function appendTestMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '<svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M40,20 L25,40 C10,60 15,75 25,80 L20,95 L35,85 C45,88 60,70 55,40 Z" fill="var(--bg, #ffffff)" stroke="#0047FF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><path d="M60,10 L75,30 C90,50 90,75 60,95 C35,75 35,50 45,30 Z" fill="var(--bg, #ffffff)" stroke="#0047FF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/></svg>' : '👤'}</div>
    <div class="msg-bubble">${role === 'ai' ? renderMd(text) : esc(text)}</div>
  `;
  testMessages.appendChild(div);
  testMessages.scrollTop = testMessages.scrollHeight;
  return div;
}

function appendTestTyping() {
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `<div class="msg-avatar"><svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M40,20 L25,40 C10,60 15,75 25,80 L20,95 L35,85 C45,88 60,70 55,40 Z" fill="var(--bg, #ffffff)" stroke="#0047FF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><path d="M60,10 L75,30 C90,50 90,75 60,95 C35,75 35,50 45,30 Z" fill="var(--bg, #ffffff)" stroke="#0047FF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/></svg></div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  testMessages.appendChild(div);
  return div;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function renderMd(text) {
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Session restore ────────────────────────────────────────────────────────────
const savedId   = sessionStorage.getItem('bizId');
const savedName = sessionStorage.getItem('bizName');
if (savedId && savedName) {
  enterDashboard(savedId, savedName);
}
