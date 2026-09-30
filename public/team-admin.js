// The team tabs: who has access, who is doing what, and a staff-only thread.
//
// Two roles, and the difference is deliberate and visible in the UI. The chief
// (the address in ADMIN_EMAIL) appoints admins, blocks accounts and assigns
// work. An admin runs the store and joins the chat but sees no controls for
// managing people -- and the server enforces that independently, so hiding a
// button here is a courtesy, never the protection.

const e = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const day = value => value ? new Date(value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '—';
const when = value => {
  if (!value) return '';
  const at = new Date(value), today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return at.toLocaleString('en-GB', sameDay
    ? {hour: '2-digit', minute: '2-digit'}
    : {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
};
const firstName = person => String(person?.name || person?.email || 'Someone').split(/[\s@]/)[0];
const roleLabel = {chief: 'Chief', owner: 'Chief', admin: 'Admin', customer: 'Customer'};

function heading(title, copy = '', action = '') {
  return `<div class="work-heading"><div><h1>${title}</h1>${copy ? `<p>${copy}</p>` : ''}</div>${action ? `<div class="actions">${action}</div>` : ''}</div>`;
}

// ------------------------------------------------------------------- people

export function teamView(users = [], {chief = false, youId = '', query = ''} = {}) {
  const staff = users.filter(u => u.role !== 'customer');
  const search = query.trim().toLowerCase();
  const shown = search
    ? users.filter(u => `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(search))
    : users;
  return heading(
    'THE PEOPLE<br>YOU TRUST.',
    chief
      ? 'Everyone with a Lyverne account. Give someone admin access, or take it back.'
      : 'Everyone with a Lyverne account. Only the chief can change who has access.',
  ) + `
  <div class="stats">${[
    ['Admins', staff.filter(u => u.role === 'admin').length, 'Can run the store with you'],
    ['Customers', users.filter(u => u.role === 'customer').length, 'People shopping with Lyverne'],
    ['Blocked', users.filter(u => Number(u.blocked)).length, 'Refused everywhere until you lift it'],
    ['Everyone', users.length, 'Accounts in total'],
  ].map(([label, value, note]) => `<div class="stat"><span class="stat-label">${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>
  ${chief ? `<p class="metric-note">To make someone an admin, ask them to create their own Lyverne account first. Their name will appear in this list, and you can give them access here. You are the chief, so your own access is set by the store's configuration and cannot be changed from this page.</p>` : ''}
  <div class="toolbar"><label class="sr-only" for="team-search">Search people</label><input id="team-search" data-team-search type="search" placeholder="Search a name or email…" value="${e(query)}"></div>
  <div id="team-results" aria-live="polite">${teamRows(shown, {chief, youId})}</div>`;
}

export function teamRows(users = [], {chief = false, youId = ''} = {}) {
  if (!users.length) return `<div class="empty"><p class="eyebrow">A LITTLE ROOM FOR WHAT’S NEXT</p><h2>NOBODY HERE YET.</h2><p>Try another name, or clear the search.</p></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>PERSON</th><th>ACCESS</th><th>LOCATION</th><th>JOINED</th>${chief ? '<th></th>' : ''}</tr></thead><tbody>${users.map(u => {
    const you = u.id === youId, blocked = !!Number(u.blocked);
    const isChief = u.role === 'chief' || u.role === 'owner';
    return `<tr${blocked ? ' class="is-blocked"' : ''}>
      <td><strong>${e(u.name) || 'No name yet'}${you ? ' <span class="status active">YOU</span>' : ''}</strong><small>${e(u.email)}</small></td>
      <td><span class="status ${isChief ? 'active' : u.role === 'admin' ? 'packing' : 'draft'}">${e(roleLabel[u.role] || u.role)}</span>${blocked ? '<small>Blocked</small>' : ''}</td>
      <td>${e(u.city) || 'Not provided'}</td>
      <td>${day(u.created_at)}</td>
      ${chief ? `<td>${you || isChief
        ? '<span class="muted small">Set by configuration</span>'
        : `<button class="text-btn" data-person="${e(u.id)}">Manage ↗︎</button>`}</td>` : ''}
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

// The chief's editor for one person. Role and blocking are separate controls
// because they answer separate questions: what may they do, and may they in.
export function personForm(person) {
  const blocked = !!Number(person.blocked);
  return `<p class="eyebrow">LYVERNE / ACCESS</p><h2>${e(person.name) || e(person.email)}</h2>
  <p class="small muted">${e(person.email)} · joined ${day(person.created_at)}</p>
  <form id="person-form" data-id="${e(person.id)}">
   <fieldset class="role-choice"><legend>What can they do?</legend>
    <label><input type="radio" name="role" value="admin" ${person.role === 'admin' ? 'checked' : ''}><span><strong>Admin</strong>Runs the store with you: orders, pieces, stock, promo codes and the team chat. Cannot add or block people.</span></label>
    <label><input type="radio" name="role" value="customer" ${person.role !== 'admin' ? 'checked' : ''}><span><strong>Customer</strong>Their own orders and saved pieces only. No access to the store admin.</span></label>
   </fieldset>
   <label class="switch-row"><input type="checkbox" name="blocked" ${blocked ? 'checked' : ''}><span><strong>Block this account</strong>They will not be able to sign in or order until you lift this. Their orders and details are kept.</span></label>
   <p class="error" role="alert"></p>
   <div class="actions"><button type="button" class="btn ghost" data-action="close-editor">Cancel</button><button class="btn orange">SAVE ACCESS</button></div>
  </form>`;
}

// -------------------------------------------------------------------- work

const statusLabel = {open: 'To do', doing: 'In progress', done: 'Done'};
const statusClass = {open: 'draft', doing: 'packing', done: 'active'};

export function tasksView(tasks = [], team = [], {chief = false, youId = ''} = {}) {
  const mine = tasks.filter(t => t.assignee_id === youId);
  const open = tasks.filter(t => t.status !== 'done');
  return heading(
    chief ? 'WHO IS DOING<br>WHAT.' : 'YOUR WORK.',
    chief
      ? 'Give your admins something to pick up. You will see it move along.'
      : 'What the chief has asked you to pick up. Mark it as you go.',
  ) + `
  <div class="stats">${[
    ['Still to do', open.filter(t => t.status === 'open').length, chief ? 'Nobody has started these' : 'Waiting on you'],
    ['In progress', tasks.filter(t => t.status === 'doing').length, 'Being worked on now'],
    ['Done', tasks.filter(t => t.status === 'done').length, 'Finished'],
    [chief ? 'On your plate' : 'All yours', chief ? open.filter(t => !t.assignee_id).length : mine.length, chief ? 'Assigned to nobody yet' : 'Tasks with your name on them'],
  ].map(([label, value, note]) => `<div class="stat"><span class="stat-label">${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>
  <div class="lower-grid">
   <section class="panel"><div class="panel-head"><h2>${chief ? 'THE BOARD' : 'YOUR TASKS'}</h2></div>${taskList(tasks, {chief, youId})}</section>
   ${chief ? `<section class="panel"><div class="panel-head"><h2>ASSIGN SOMETHING</h2></div>
    <form id="task-form">
     <label>What needs doing<input name="title" maxlength="140" required placeholder="Photograph the cream tee"></label>
     <label>Anything they should know<textarea name="detail" rows="3" maxlength="1000" placeholder="Daylight, no flash. Front and back."></textarea></label>
     <label>Who is picking it up<select name="assignee_id"><option value="">Nobody yet</option>${team.map(p => `<option value="${e(p.id)}">${e(p.name) || e(p.email)}</option>`).join('')}</select></label>
     <label>By when<input name="due_date" type="date"></label>
     <p class="error" role="alert"></p>
     <button class="btn orange">ASSIGN THIS ＋</button>
    </form>
    <p class="metric-note">Only people with admin access appear here. Add someone on the People tab first.</p></section>`
   : `<section class="panel orange-panel"><p class="eyebrow">ONE THING AT A TIME</p><h2>PICK IT UP.<br>MARK IT.<br>MOVE ON.</h2><p class="small">The chief sees your progress as you mark it, so nothing needs chasing.</p></section>`}
  </div>`;
}

export function taskList(tasks = [], {chief = false, youId = ''} = {}) {
  if (!tasks.length) return `<div class="empty"><p class="eyebrow">A LITTLE ROOM FOR WHAT’S NEXT</p><h2>${chief ? 'NOTHING ASSIGNED YET.' : 'NOTHING ON YOUR PLATE.'}</h2><p>${chief ? 'Assign the first task and it will appear here.' : 'When the chief assigns you something, it will show up here.'}</p></div>`;
  const today = new Date().toISOString().slice(0, 10);
  return `<ul class="task-list">${tasks.map(t => {
    const late = t.due_date && t.due_date < today && t.status !== 'done';
    const mine = t.assignee_id === youId;
    return `<li class="task ${e(t.status)}">
     <div class="task-top"><strong>${e(t.title)}</strong><span class="status ${statusClass[t.status]}">${statusLabel[t.status] || e(t.status)}</span></div>
     ${t.detail ? `<p>${e(t.detail)}</p>` : ''}
     <p class="task-meta">${t.assignee_id
       ? `${mine ? 'Yours' : e(t.assignee_name) || e(t.assignee_email)}`
       : 'Nobody yet'}${t.due_date ? ` · due ${day(t.due_date)}${late ? ' <span class="status cancelled">Overdue</span>' : ''}` : ''}</p>
     <div class="task-actions">${['open', 'doing', 'done']
       .filter(s => s !== t.status)
       .map(s => (chief || mine) ? `<button class="text-btn" data-task="${e(t.id)}" data-status="${s}">Mark ${statusLabel[s].toLowerCase()} ↗︎</button>` : '').join('')}
      ${chief ? `<button class="text-btn danger" data-task-remove="${e(t.id)}">Remove</button>` : ''}</div>
    </li>`;
  }).join('')}</ul>`;
}

// -------------------------------------------------------------------- chat

export function chatView(messages = [], {youId = '', you = null} = {}) {
  return heading('THE TEAM<br>THREAD.', 'A quiet place for the people running Lyverne. Customers never see this.')
  + `<section class="panel chat-panel">
   <div class="chat-thread" id="chat-thread" aria-live="polite" aria-label="Team messages">${chatMessages(messages, youId)}</div>
   <form id="chat-form" class="chat-composer">
    <label class="sr-only" for="chat-body">Your message</label>
    <textarea id="chat-body" name="body" rows="2" maxlength="1000" required placeholder="Say something to the team…"></textarea>
    <button class="btn orange" type="submit">SEND ↗︎</button>
    <p class="error" role="alert"></p>
   </form>
  </section>
  <p class="metric-note">The last 100 messages are kept. This thread is only readable by people with admin access${you ? `, and you are signed in as ${e(firstName(you))}` : ''}.</p>`;
}

export function chatMessages(messages = [], youId = '') {
  if (!messages.length) return `<p class="chat-empty">No messages yet. Say hello.</p>`;
  let lastDay = '';
  return messages.map(m => {
    const at = new Date(m.created_at), stamp = at.toDateString();
    const divider = stamp !== lastDay ? `<p class="chat-day">${at.toLocaleDateString('en-GB', {day: 'numeric', month: 'long'})}</p>` : '';
    lastDay = stamp;
    const mine = m.author_id === youId;
    return `${divider}<article class="chat-message${mine ? ' is-mine' : ''}">
     <p class="chat-who">${mine ? 'You' : e(m.author_name) || 'Someone'}${m.author_role === 'chief' || m.author_role === 'owner' ? '<span class="status active">CHIEF</span>' : ''}<time datetime="${e(m.created_at)}">${when(m.created_at)}</time></p>
     <p class="chat-body">${e(m.body)}</p>
    </article>`;
  }).join('');
}
