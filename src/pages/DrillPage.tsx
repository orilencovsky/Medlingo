import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { He } from '../components/He';
import {
  streamDrill, applyDrillVerdicts, DrillQuotaError, type DrillMessage,
} from '../data/drill';

type Feedback = { right: string; correction: string; tip: string };
type Verdict = { entryId: string; verdict: string; hebrew: string; en: string };
type Phase = 'intro' | 'running' | 'summary' | 'quota' | 'unavailable';

export function DrillPage() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('intro');
  const [messages, setMessages] = useState<DrillMessage[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(crypto.randomUUID());

  async function exchange(history: DrillMessage[]) {
    setBusy(true);
    let reply = '';
    try {
      for await (const ev of streamDrill(sessionId.current, history)) {
        if (ev.type === 'delta') {
          reply += (ev.payload as { text: string }).text;
          setMessages([...history, { role: 'assistant', content: reply }]);
        } else if (ev.type === 'feedback') {
          setFeedbacks((f) => [...f, ev.payload as Feedback]);
        } else if (ev.type === 'verdicts') {
          const v = ev.payload as Verdict[];
          setVerdicts(v);
          await applyDrillVerdicts(v);
          setPhase('summary');
        } else if (ev.type === 'error') {
          setPhase('unavailable');
        }
      }
      if (reply) setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (e) {
      setPhase(e instanceof DrillQuotaError ? 'quota' : 'unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setPhase('running');
    await exchange([{ role: 'user', content: '' }]);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const history: DrillMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    await exchange(history);
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-semibold">{t('drill.title')}</h1>
        <p className="mt-2">{t('drill.intro')}</p>
        <p className="mt-2 text-sm text-gray-600">{t('drill.disclaimer')}</p>
        <button onClick={start} className="mt-4 w-full rounded bg-blue-700 p-3 text-white">
          {t('drill.start')}
        </button>
      </div>
    );
  }
  if (phase === 'quota') {
    return <p className="p-6 text-center">{t('drill.quota')} <Link className="underline" to="/">{t('common.back')}</Link></p>;
  }
  if (phase === 'unavailable') {
    return <p className="p-6 text-center" role="alert">{t('drill.unavailable')} <Link className="underline" to="/">{t('common.back')}</Link></p>;
  }
  if (phase === 'summary') {
    return (
      <div data-testid="drill-summary" className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-semibold">{t('drill.summaryTitle')}</h1>
        <ul className="mt-4 flex flex-col gap-1">
          {verdicts.filter((v) => v.verdict !== 'not_attempted').map((v) => (
            <li key={v.entryId}>
              {v.verdict === 'used_correctly' ? '✅' : '✍️'}{' '}
              <He>{v.hebrew}</He>{' ('}{v.en}{') — '}
              {v.verdict === 'used_correctly' ? t('drill.usedCorrectly') : t('drill.usedIncorrectly')}
            </li>
          ))}
        </ul>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
      </div>
    );
  }

  const lastFeedback = feedbacks[feedbacks.length - 1];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <p className="text-xs text-gray-500">{t('drill.disclaimer')}</p>
      <div className="flex flex-col gap-2">
        {messages.filter((m) => m.content !== '').map((m, i) => (
          <div
            key={i}
            className={m.role === 'assistant'
              ? 'self-start rounded-lg bg-gray-100 p-3'
              : 'self-end rounded-lg bg-blue-100 p-3'}
          >
            <He>{m.content}</He>
          </div>
        ))}
      </div>
      {lastFeedback && (
        <div data-testid="drill-feedback" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold">{lastFeedback.right}</p>
          {lastFeedback.correction && <p><He>{lastFeedback.correction}</He></p>}
          {lastFeedback.tip && <p className="text-gray-700">{lastFeedback.tip}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          data-testid="drill-input"
          dir="rtl"
          lang="he"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('drill.placeholder')}
          className="flex-1 rounded border p-2"
        />
        <button
          data-testid="drill-send"
          onClick={send}
          disabled={busy}
          className="rounded bg-blue-700 px-4 text-white disabled:opacity-50"
        >
          {t('drill.send')}
        </button>
      </div>
    </div>
  );
}
