// Moneyman UI - GitHub-backed multi-account scraper manager

const LS_KEY = 'moneyman-ui-auth';
let sodium = null;

function sodium_ready() {
  return new Promise(resolve => {
    const check = () => {
      if (window.sodium) {
        sodium = window.sodium;
        resolve();
      } else setTimeout(check, 50);
    };
    check();
  });
}
sodium_ready();

function getAuth() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}
function setAuth(a) { localStorage.setItem(LS_KEY, JSON.stringify(a)); }

function loadAuthUI() {
  const a = getAuth();
  if (a.owner) document.getElementById('owner').value = a.owner;
  if (a.repo) document.getElementById('repo').value = a.repo;
  if (a.pat) {
    document.getElementById('pat').value = a.pat;
    document.getElementById('auth-status').textContent = '✓ נשמר';
    document.getElementById('auth-status').className = 'status ok';
  }
}

document.getElementById('save-auth').onclick = async () => {
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const pat = document.getElementById('pat').value.trim();
  if (!owner || !repo || !pat) {
    return setStatus('auth-status', 'חסרים שדות', false);
  }
  try {
    const r = await gh('GET', `/repos/${owner}/${repo}`, null, pat);
    setAuth({ owner, repo, pat });
    setStatus('auth-status', `✓ מחובר ל-${r.full_name}`, true);
    refreshAccounts();
    refreshRuns();
  } catch (e) {
    setStatus('auth-status', `✗ ${e.message}`, false);
  }
};

async function gh(method, path, body, token) {
  const a = getAuth();
  const t = token || a.pat;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${t}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`https://api.github.com${path}`, opts);
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const j = await r.json(); msg = j.message || msg; } catch {}
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

function setStatus(id, msg, ok) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `status ${ok ? 'ok' : 'err'}`;
}

async function encryptSecret(publicKeyB64, value) {
  if (!sodium) await sodium_ready();
  const msgBytes = sodium.from_string(value);
  const keyBytes = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const enc = sodium.crypto_box_seal(msgBytes, keyBytes);
  return sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
}

async function setSecret(name, value) {
  const a = getAuth();
  const pk = await gh('GET', `/repos/${a.owner}/${a.repo}/actions/secrets/public-key`);
  const encrypted = await encryptSecret(pk.key, value);
  await gh('PUT', `/repos/${a.owner}/${a.repo}/actions/secrets/${name}`, {
    encrypted_value: encrypted,
    key_id: pk.key_id,
  });
}

document.getElementById('save-mail').onclick = async () => {
  const u = document.getElementById('mail-user').value.trim();
  const p = document.getElementById('mail-pass').value.trim();
  if (!u || !p) return setStatus('mail-status', 'חסרים שדות', false);
  try {
    await setSecret('MAIL_USERNAME', u);
    await setSecret('MAIL_PASSWORD', p);
    setStatus('mail-status', '✓ נשמרו ב-GitHub Secrets', true);
    document.getElementById('mail-pass').value = '';
  } catch (e) {
    setStatus('mail-status', `✗ ${e.message}`, false);
  }
};

async function readAccountsFile() {
  const a = getAuth();
  const r = await gh('GET', `/repos/${a.owner}/${a.repo}/contents/accounts.json`);
  const bytes = Uint8Array.from(atob(r.content.replace(/\n/g, '')), c => c.charCodeAt(0));
  const content = new TextDecoder('utf-8').decode(bytes);
  return { sha: r.sha, data: JSON.parse(content) };
}

async function writeAccountsFile(data, sha, message) {
  const a = getAuth();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + '\n')));
  return gh('PUT', `/repos/${a.owner}/${a.repo}/contents/accounts.json`, {
    message: message || 'Update accounts.json',
    content,
    sha,
  });
}

async function refreshAccounts() {
  const list = document.getElementById('accounts-list');
  list.innerHTML = '<p class="muted">טוען...</p>';
  try {
    const { data } = await readAccountsFile();
    if (!data.accounts || data.accounts.length === 0) {
      list.innerHTML = '<p class="muted">אין חשבונות מוגדרים.</p>';
      return;
    }
    list.innerHTML = '';
    data.accounts.forEach(acc => {
      const row = document.createElement('div');
      row.className = 'account-row';
      const bankNames = {hapoalim:'בנק הפועלים',leumi:'בנק לאומי',discount:'בנק דיסקונט',mercantile:'מרכנתיל',mizrahi:'מזרחי טפחות',otsarHahayal:'אוצר החייל',union:'הבנק הבינלאומי',pagi:'פאג״י (בינלאומי)',beinleumi:'בינלאומי',massad:'מסד',yahav:'יהב',visaCal:'ויזה כאל',max:'מקס',isracard:'ישראכרט',amex:'אמריקן אקספרס',behatsdaa:'בהצדעה',oneZero:'וואן זירו'};
      const freqNames = {daily:'יומי',weekly:'שבועי',monthly:'חודשי'};
      const bankDisplay = bankNames[acc.companyId] || acc.companyId;
      const freqDisplay = freqNames[acc.frequency] || acc.frequency;
      const hoursDisplay = (acc.hours || []).map(h => String(h).padStart(2,'0') + ':00').join(', ');
      row.innerHTML = `
        <div class="info">
          <div class="label">${escapeHtml(acc.label)} ${acc.enabled === false ? '<span class="disabled-tag">מושבת</span>' : '<span class="enabled-tag">פעיל</span>'}</div>
          <div class="meta">
            ${escapeHtml(bankDisplay)} · ${escapeHtml(acc.email)}
          </div>
          <div class="details" id="details-${escapeHtml(acc.id)}" style="display:none;">
            <table class="detail-table">
              <tr><td class="dt-label">מזהה:</td><td>${escapeHtml(acc.id)}</td></tr>
              <tr><td class="dt-label">בנק:</td><td>${escapeHtml(bankDisplay)}</td></tr>
              <tr><td class="dt-label">מייל יעד:</td><td>${escapeHtml(acc.email)}</td></tr>
              <tr><td class="dt-label">שעות שליחה:</td><td>${hoursDisplay} (שעון ישראל)</td></tr>
              <tr><td class="dt-label">תדירות:</td><td>${escapeHtml(freqDisplay)}</td></tr>
              <tr><td class="dt-label">ימים אחורה:</td><td>${acc.daysBack || 30}</td></tr>
              <tr><td class="dt-label">Secret משתמש:</td><td><code>${escapeHtml(acc.userSecret)}</code></td></tr>
              <tr><td class="dt-label">Secret סיסמה:</td><td><code>${escapeHtml(acc.passSecret)}</code></td></tr>
            </table>
          </div>
        </div>
        <div class="actions">
          <button data-id="${escapeHtml(acc.id)}" class="view-details">פרטים</button>
          <button data-id="${escapeHtml(acc.id)}" class="run-now">הרץ עכשיו</button>
          <button data-id="${escapeHtml(acc.id)}" class="edit-acc secondary">ערוך</button>
          <button data-id="${escapeHtml(acc.id)}" class="toggle secondary">${acc.enabled === false ? 'הפעל' : 'השבת'}</button>
          <button data-id="${escapeHtml(acc.id)}" class="delete danger">מחק</button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.view-details').forEach(b => b.onclick = () => {
      const el = document.getElementById('details-' + b.dataset.id);
      if (el) {
        const showing = el.style.display !== 'none';
        el.style.display = showing ? 'none' : '';
        b.textContent = showing ? 'פרטים' : 'הסתר';
      }
    });
    list.querySelectorAll('.run-now').forEach(b => b.onclick = () => runAccount(b.dataset.id));
    list.querySelectorAll('.edit-acc').forEach(b => b.onclick = () => editAccount(b.dataset.id));
    list.querySelectorAll('.toggle').forEach(b => b.onclick = () => toggleAccount(b.dataset.id));
    list.querySelectorAll('.delete').forEach(b => b.onclick = () => deleteAccount(b.dataset.id));
  } catch (e) {
    list.innerHTML = `<p class="status err">שגיאה: ${escapeHtml(e.message)}</p>`;
  }
}

document.getElementById('refresh-accounts').onclick = refreshAccounts;

async function runAccount(id) {
  const a = getAuth();
  try {
    await gh('POST', `/repos/${a.owner}/${a.repo}/actions/workflows/scrape.yml/dispatches`, {
      ref: 'main',
      inputs: { account_id: id, force: 'true' },
    });
    alert(`הרצה נשלחה לחשבון ${id}.`);
    setTimeout(refreshRuns, 2000);
  } catch (e) {
    alert(`שגיאה: ${e.message}`);
  }
}

async function toggleAccount(id) {
  const { data, sha } = await readAccountsFile();
  const acc = data.accounts.find(x => x.id === id);
  if (!acc) return;
  acc.enabled = acc.enabled === false;
  await writeAccountsFile(data, sha, `Toggle account ${id}`);
  refreshAccounts();
}

async function editAccount(id) {
  const { data } = await readAccountsFile();
  const acc = data.accounts.find(x => x.id === id);
  if (!acc) return;
  // Fill the form with existing values
  document.getElementById('acc-id').value = acc.id;
  document.getElementById('acc-label').value = acc.label;
  document.getElementById('acc-company').value = acc.companyId;
  document.getElementById('acc-email').value = acc.email;
  document.getElementById('acc-hours').value = (acc.hours || []).join(',');
  document.getElementById('acc-frequency').value = acc.frequency || 'daily';
  document.getElementById('acc-days').value = acc.daysBack || 30;
  document.getElementById('acc-user').value = '';
  document.getElementById('acc-pass').value = '';
  // Mark form as edit mode
  document.getElementById('acc-id').dataset.editMode = id;
  document.getElementById('acc-id').readOnly = true;
  document.getElementById('add-account').textContent = 'עדכן חשבון';
  // Show cancel button
  let cancelBtn = document.getElementById('cancel-edit');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-edit';
    cancelBtn.className = 'secondary';
    cancelBtn.textContent = 'בטל עריכה';
    cancelBtn.style.marginRight = '8px';
    document.getElementById('add-account').parentNode.insertBefore(cancelBtn, document.getElementById('add-account'));
  }
  cancelBtn.style.display = '';
  cancelBtn.onclick = () => {
    clearEditMode();
    refreshAccounts();
  };
  // Scroll to form
  document.getElementById('add-account-section').scrollIntoView({ behavior: 'smooth' });
  setStatus('add-status', `עורך: ${acc.label}. השאר שם משתמש וסיסמה ריקים אם לא רוצה לשנות אותם.`, true);
}

function clearEditMode() {
  document.getElementById('acc-id').dataset.editMode = '';
  document.getElementById('acc-id').readOnly = false;
  document.getElementById('add-account').textContent = 'הוסף חשבון';
  ['acc-id','acc-label','acc-user','acc-pass','acc-email'].forEach(k => document.getElementById(k).value = '');
  document.getElementById('acc-hours').value = '13,1';
  document.getElementById('acc-frequency').value = 'daily';
  document.getElementById('acc-days').value = '30';
  const cancelBtn = document.getElementById('cancel-edit');
  if (cancelBtn) cancelBtn.style.display = 'none';
  setStatus('add-status', '', true);
}

async function deleteAccount(id) {
  if (!confirm(`למחוק חשבון ${id}?`)) return;
  const { data, sha } = await readAccountsFile();
  data.accounts = data.accounts.filter(x => x.id !== id);
  await writeAccountsFile(data, sha, `Delete account ${id}`);
  refreshAccounts();
}

document.getElementById('add-account').onclick = async () => {
  const editMode = document.getElementById('acc-id').dataset.editMode;
  const id = document.getElementById('acc-id').value.trim();
  const label = document.getElementById('acc-label').value.trim();
  const companyId = document.getElementById('acc-company').value;
  const user = document.getElementById('acc-user').value.trim();
  const pass = document.getElementById('acc-pass').value.trim();
  const email = document.getElementById('acc-email').value.trim();
  const hours = document.getElementById('acc-hours').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  const frequency = document.getElementById('acc-frequency').value;
  const daysBack = parseInt(document.getElementById('acc-days').value) || 30;

  if (!id || !label || !email || hours.length === 0) {
    return setStatus('add-status', 'חסרים שדות', false);
  }
  if (!editMode && (!user || !pass)) {
    return setStatus('add-status', 'חסרים שם משתמש וסיסמה', false);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return setStatus('add-status', 'מזהה: רק אותיות אנגלית קטנות, ספרות ומקפים', false);
  }

  setStatus('add-status', editMode ? 'מעדכן...' : 'מעלה...', true);
  try {
    const upper = id.toUpperCase().replace(/-/g, '_');
    const userSecret = `BANK_USER_${upper}`;
    const passSecret = `BANK_PASS_${upper}`;

    // Update secrets only if provided
    if (user) await setSecret(userSecret, user);
    if (pass) await setSecret(passSecret, pass);

    const { data, sha } = await readAccountsFile();

    if (editMode) {
      // Update existing account
      const idx = data.accounts.findIndex(x => x.id === id);
      if (idx === -1) return setStatus('add-status', `חשבון ${id} לא נמצא`, false);
      data.accounts[idx] = {
        ...data.accounts[idx],
        label, companyId, email, hours, frequency, daysBack,
        userSecret, passSecret,
      };
      await writeAccountsFile(data, sha, `Update account ${id}`);
      setStatus('add-status', `✓ חשבון ${label} עודכן`, true);
      clearEditMode();
    } else {
      // Add new account
      if (data.accounts.find(x => x.id === id)) {
        return setStatus('add-status', `מזהה ${id} כבר קיים`, false);
      }
      data.accounts.push({
        id, label, companyId, email, hours, frequency, daysBack,
        userSecret, passSecret, enabled: true,
      });
      await writeAccountsFile(data, sha, `Add account ${id}`);
      setStatus('add-status', `✓ חשבון ${label} נוסף`, true);
      ['acc-id','acc-label','acc-user','acc-pass','acc-email'].forEach(k => document.getElementById(k).value = '');
    }
    refreshAccounts();
  } catch (e) {
    setStatus('add-status', `✗ ${e.message}`, false);
  }
};

async function refreshRuns() {
  const list = document.getElementById('runs-list');
  list.innerHTML = '<p class="muted">טוען...</p>';
  try {
    const a = getAuth();
    const r = await gh('GET', `/repos/${a.owner}/${a.repo}/actions/workflows/scrape.yml/runs?per_page=10`);
    if (!r.workflow_runs || r.workflow_runs.length === 0) {
      list.innerHTML = '<p class="muted">אין הרצות עדיין.</p>';
      return;
    }
    list.innerHTML = '';
    r.workflow_runs.forEach(run => {
      const row = document.createElement('div');
      const cls = run.conclusion || run.status;
      row.className = `run-row ${cls}`;
      const date = new Date(run.created_at).toLocaleString('he-IL');
      row.innerHTML = `
        <span>${date} · ${escapeHtml(run.event)} · ${escapeHtml(run.status)}${run.conclusion ? ' / ' + escapeHtml(run.conclusion) : ''}</span>
        <a href="${run.html_url}" target="_blank">פרטים</a>
      `;
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<p class="status err">שגיאה: ${escapeHtml(e.message)}</p>`;
  }
}

document.getElementById('refresh-runs').onclick = refreshRuns;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

loadAuthUI();
if (getAuth().pat) {
  refreshAccounts();
  refreshRuns();
}
