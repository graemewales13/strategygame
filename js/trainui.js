// Auld World - the "AI training" box in the menu: switch recording on or off, see how well trained the rivals are, export/import/clear recordings.
import { TRAINED_AT } from './learn.js';
const $ = (id) => document.getElementById(id);

export function initTrainPanel({ recorder, getPlaybook, getSeedCount }) {
  const box = $('trainBox'); if (!box) return { refresh() {} };
  const refresh = () => {
    const pb = getPlaybook(), mine = recorder.records().filter((r) => r.result !== 'live').length, seed = getSeedCount();
    $('trRec').checked = recorder.on;
    const conf = pb ? pb.conf : 0;
    $('trFill').style.width = Math.round((conf / 0.85) * 100) + '%';
    $('trStat').textContent = !recorder.on ? 'Recording is off: the rivals play by their built-in habits.'
      : !pb ? `No usable matches yet (${mine} saved, need a match of 2.5+ minutes with a few buildings). Play a match and the rivals start copying you.`
      : `${pb.matches} match${pb.matches === 1 ? '' : 'es'} learned (${pb.wins} won${seed ? ', ' + seed + ' shipped' : ''}). Rivals follow your play ${Math.round(conf * 100)}%` + (conf >= TRAINED_AT ? ' - well trained.' : ' - keep playing to train them further.');
  };
  $('trRec').onchange = (e) => { recorder.setEnabled(e.target.checked); refresh(); };
  $('trExport').onclick = () => {
    const blob = new Blob([recorder.exportJSON()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'auld-recordings-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('trImport').onclick = () => $('trFile').click();
  $('trFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const res = recorder.importJSON(await f.text());
    $('trStat').textContent = res.ok ? `Imported ${res.added} new recording${res.added === 1 ? '' : 's'}.` : 'Could not import: ' + res.error;
    if (res.ok) setTimeout(refresh, 2500);
  };
  $('trClear').onclick = () => { if (confirm('Delete every recorded match? The rivals go back to their built-in habits.')) recorder.clear(); };
  refresh();
  return { refresh };
}
