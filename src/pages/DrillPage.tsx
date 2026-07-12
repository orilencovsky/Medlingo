import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { He } from '../components/He';
import {
  streamDrill, applyDrillVerdicts, DrillQuotaError, type DrillMessage,
} from '../data/drill';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

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
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('drill.title')} />
        <Card className="mt-4 text-center">
          <p className="text-ink">{t('drill.intro')}</p>
          <p className="mt-2 text-sm text-ink-subtle">{t('drill.disclaimer')}</p>
          <Button onClick={start} className="mt-4 w-full">
            {t('drill.start')}
          </Button>
        </Card>
      </div>
    );
  }
  if (phase === 'quota') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('drill.title')} />
        <p className="mt-4 text-ink">{t('drill.quota')} <Link className="text-primary underline" to="/">{t('common.back')}</Link></p>
      </div>
    );
  }
  if (phase === 'unavailable') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('drill.title')} />
        <p role="alert" className="mt-4 text-ink">{t('drill.unavailable')} <Link className="text-primary underline" to="/">{t('common.back')}</Link></p>
      </div>
    );
  }
  if (phase === 'summary') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('drill.title')} />
        <Card data-testid="drill-summary" className="mt-4">
          <h1 className="text-2xl font-semibold text-ink">{t('drill.summaryTitle')}</h1>
          <ul className="mt-4 flex flex-col gap-1 text-ink">
            {verdicts.filter((v) => v.verdict !== 'not_attempted').map((v) => (
              <li key={v.entryId}>
                {v.verdict === 'used_correctly' ? '✅' : '✍️'}{' '}
                <He>{v.hebrew}</He>{' ('}{v.en}{') — '}
                {v.verdict === 'used_correctly' ? t('drill.usedCorrectly') : t('drill.usedIncorrectly')}
              </li>
            ))}
          </ul>
          <p className="mt-4"><Link to="/" className="text-primary underline">{t('common.back')}</Link></p>
        </Card>
      </div>
    );
  }

  const lastFeedback = feedbacks[feedbacks.length - 1];
  return (
    <div className="mx-auto flex max-w-2xl lg:mx-0 lg:max-w-none flex-col gap-3 p-4">
      <PageHeader title={t('drill.title')} />
      <p className="text-xs text-ink-subtle">{t('drill.disclaimer')}</p>
      <div className="flex flex-col gap-2">
        {messages.filter((m) => m.content !== '').map((m, i) => (
          <div
            key={i}
            className={m.role === 'assistant'
              ? 'self-start rounded-lg border border-border bg-surface p-3 text-ink shadow-card'
              : 'self-end rounded-lg bg-primary-tint p-3 text-ink'}
          >
            <He>{m.content}</He>
          </div>
        ))}
      </div>
      {lastFeedback && (
        <Card data-testid="drill-feedback" className="border-amber text-sm">
          <p className="font-semibold text-ink">{lastFeedback.right}</p>
          {lastFeedback.correction && <p className="text-ink"><He>{lastFeedback.correction}</He></p>}
          {lastFeedback.tip && <p className="text-ink-subtle">{lastFeedback.tip}</p>}
        </Card>
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
          className="flex-1 rounded-md border border-border p-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button data-testid="drill-send" onClick={send} disabled={busy} className="px-4">
          {t('drill.send')}
        </Button>
      </div>
    </div>
  );
}
