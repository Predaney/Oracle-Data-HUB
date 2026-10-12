'use strict';
const rows = document.getElementById('rows');
let orders = [];

function td(text, cls) { const c = document.createElement('td'); c.textContent = text == null ? '' : text; if (cls) c.className = cls; return c; }

function render() {
  const onlyPaid = document.getElementById('onlyPaid').checked;
  const onlyOpen = document.getElementById('onlyOpen').checked;
  const list = orders.filter(o => (!onlyPaid || o.status === 'paid') && (!onlyOpen || (o.status === 'paid' && !o.fulfilled)));
  document.getElementById('count').textContent = list.length + ' order(s)';
  rows.textContent = '';
  for (const o of list) {
    const tr = document.createElement('tr');
    tr.append(td(o.created_at), td(o.reference, 'mono'), td(o.service + ' · ' + o.description), td('GHS ' + (o.amount / 100).toFixed(2)),
              td(o.phone), td(o.email),
              td(o.details ? Object.entries(o.details).map(([k, v]) => k + ': ' + v).join('\n') : ''),
              td(o.status, o.status));
    const last = document.createElement('td');
    if (o.status === 'paid') {
      const b = document.createElement('button');
      b.textContent = o.fulfilled ? 'Delivered ✓ (undo)' : 'Mark delivered';
      if (o.fulfilled) b.className = 'ghost';
      b.addEventListener('click', async () => {
        await fetch('/admin/api/orders/' + o.reference + '/fulfilled', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'oracle-admin' },
          body: JSON.stringify({ fulfilled: !o.fulfilled })
        });
        load();
      });
      last.append(b);
    }
    tr.append(last);
    rows.append(tr);
  }
}

async function load() {
  const res = await fetch('/admin/api/orders');
  orders = res.ok ? await res.json() : [];
  render();
}
['onlyPaid', 'onlyOpen'].forEach(id => document.getElementById(id).addEventListener('change', render));
document.getElementById('refresh').addEventListener('click', load);
load();
