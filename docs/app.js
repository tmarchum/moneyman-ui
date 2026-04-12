// Moneyman UI - GitHub-backed multi-account scraper manager

const LS_KEY = 'moneyman-ui-auth';

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

// Minimal BLAKE2b (24-byte output only, for sealed box nonce)
const BLAKE2B_IV = new Uint32Array([
  0xF3BCC908,0x6A09E667,0x84CAA73B,0xBB67AE85,0xFE94F82B,0x3C6EF372,0x5F1D36F1,0xA54FF53A,
  0xADE682D1,0x510E527F,0x2B3E6C1F,0x9B05688C,0xFB41BD6B,0x1F83D9AB,0x137E2179,0x5BE0CD19
]);
const SIGMA = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
  [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
  [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3]
];
function ADD64(v,a,b){const o0=v[a]+v[b];const o1=v[a+1]+v[b+1];if(o0>=0x100000000)v[a+1]=o1+1;else v[a+1]=o1;v[a]=o0}
function B2B_G(v,a,b,c,d,ix,iy){ADD64(v,a,b);v[a]+=ix;if(v[a]<ix)v[a+1]++;v[d]^=v[a];v[d+1]^=v[a+1];let xh=v[d]>>>16|v[d+1]<<16;let xl=v[d+1]>>>16|v[d]<<16;v[d]=xh;v[d+1]=xl;ADD64(v,c,d);v[b]^=v[c];v[b+1]^=v[c+1];xh=v[b]>>>24|v[b+1]<<8;xl=v[b+1]>>>24|v[b]<<8;v[b]=xh;v[b+1]=xl;ADD64(v,a,b);v[a]+=iy;if(v[a]<iy)v[a+1]++;v[d]^=v[a];v[d+1]^=v[a+1];xh=v[d+1]>>>16|v[d]<<16;xl=v[d]>>>16|v[d+1]<<16;v[d]=xh;v[d+1]=xl;ADD64(v,c,d);v[b]^=v[c];v[b+1]^=v[c+1];xh=v[b+1]>>>1|v[b]<<31;xl=v[b]>>>1|v[b+1]<<31;v[b]=xh;v[b+1]=xl}
function blake2b(input,outlen){
  const h=new Uint32Array(BLAKE2B_IV);h[0]^=0x01010000^outlen;
  const c=new Uint32Array(2);const b=new Uint8Array(128);let p=0;
  function compress(last){
    const v=new Uint32Array(32);for(let i=0;i<16;i++)v[i]=h[i];for(let i=0;i<16;i++)v[i+16]=BLAKE2B_IV[i];
    v[24]^=c[0];v[25]^=c[1];if(last){v[28]=~v[28];v[29]=~v[29]}
    const m=new Uint32Array(32);for(let i=0;i<32;i++)m[i]=b[i*4]|(b[i*4+1]<<8)|(b[i*4+2]<<16)|(b[i*4+3]<<24);
    for(let i=0;i<12;i++){const s=SIGMA[i];B2B_G(v,0,8,16,24,m[s[0]*2],m[s[0]*2+1]);B2B_G(v,2,10,18,26,m[s[1]*2],m[s[1]*2+1]);B2B_G(v,4,12,20,28,m[s[2]*2],m[s[2]*2+1]);B2B_G(v,6,14,22,30,m[s[3]*2],m[s[3]*2+1]);B2B_G(v,0,10,20,30,m[s[4]*2],m[s[4]*2+1]);B2B_G(v,2,12,22,24,m[s[5]*2],m[s[5]*2+1]);B2B_G(v,4,14,16,26,m[s[6]*2],m[s[6]*2+1]);B2B_G(v,6,8,18,28,m[s[7]*2],m[s[7]*2+1])}
    for(let i=0;i<16;i++)h[i]^=v[i]^v[i+16];
  }
  for(let i=0;i<input.length;i++){if(p===128){c[0]+=128;if(c[0]<128)c[1]++;compress(false);p=0}b[p++]=input[i]}
  c[0]+=p;if(c[0]<p)c[1]++;while(p<128)b[p++]=0;compress(true);
  const out=new Uint8Array(outlen);for(let i=0;i<outlen;i++)out[i]=(h[i>>2]>>((i&3)*8))&0xFF;return out;
}

// Sealed box encryption using tweetnacl + BLAKE2b (compatible with libsodium crypto_box_seal)
function encryptSecret(publicKeyB64, value) {
  const publicKey = base64ToUint8Array(publicKeyB64);
  const msgBytes = nacl.util.decodeUTF8(value);
  const ephemeralKeypair = nacl.box.keyPair();
  // Nonce = BLAKE2b(ephemeral_pk || recipient_pk, 24 bytes)
  const nonceInput = new Uint8Array(64);
  nonceInput.set(ephemeralKeypair.publicKey, 0);
  nonceInput.set(publicKey, 32);
  const nonce = blake2b(nonceInput, 24);
  const encrypted = nacl.box(msgBytes, nonce, publicKey, ephemeralKeypair.secretKey);
  const sealed = new Uint8Array(32 + encrypted.length);
  sealed.set(ephemeralKeypair.publicKey, 0);
  sealed.set(encrypted, 32);
  return Promise.resolve(uint8ArrayToBase64(sealed));
}

function base64ToUint8Array(b64) {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
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
