import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCENES, ROOT_SCENE_ID, getScene, type SceneNode } from '../../lib/anatomyScenes';
import { fetchSceneLabels } from '../../data/anatomy';
import { Scene, type SceneLabels } from './Scene';
import { WordDetailCard } from './WordDetailCard';

interface Crumb { sceneId: string; labelKey?: string; entryId?: string; nodeName?: string }

// All entryIds referenced anywhere in the config — fetched once for hover labels.
const ALL_ENTRY_IDS = Array.from(new Set(
  Object.values(SCENES).flatMap((s) => s.nodes.map((n) => n.entryId).filter((x): x is string => !!x)),
));

export function AnatomyExplorer() {
  const { t } = useTranslation();
  const [stack, setStack] = useState<Crumb[]>([{ sceneId: ROOT_SCENE_ID }]);
  const [labels, setLabels] = useState<SceneLabels>({});
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  useEffect(() => { fetchSceneLabels(ALL_ENTRY_IDS).then(setLabels); }, []);

  const current = stack[stack.length - 1];
  const scene = getScene(current.sceneId);

  const crumbLabel = (c: Crumb): string => {
    if (c.sceneId === ROOT_SCENE_ID) return t('anatomy.rootCrumb');
    return (c.entryId && labels[c.entryId]?.en) || c.sceneId;
  };

  const onActivate = (node: SceneNode) => {
    if (node.childScene && getScene(node.childScene)) {
      setStack((s) => [...s, { sceneId: node.childScene!, entryId: node.entryId, nodeName: node.node }]);
    } else if (node.entryId) {
      setOpenEntryId(node.entryId);
    }
  };

  const popTo = (index: number) => setStack((s) => s.slice(0, index + 1));

  // The current scene's parent word (if we drilled in via a node that also has an
  // entryId) — reachable from the breadcrumb tail per the design.
  const parentWordId = useMemo(
    () => (stack.length > 1 ? current.entryId ?? null : null),
    [stack, current],
  );

  if (!scene) {
    return <p className="mt-6 text-ink-muted">{t('anatomy.explorerUnavailable')}</p>;
  }

  return (
    <div className="mt-3">
      <nav aria-label={t('anatomy.breadcrumbLabel')} className="flex flex-wrap items-center gap-1 text-sm">
        {stack.map((c, i) => (
          <span key={`${c.sceneId}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-ink-subtle">›</span>}
            <button type="button" onClick={() => popTo(i)}
              className={i === stack.length - 1 ? 'font-bold text-ink' : 'text-primary'}>
              {crumbLabel(c)}
            </button>
          </span>
        ))}
        {parentWordId && (
          <button type="button" onClick={() => setOpenEntryId(parentWordId)}
            className="ms-2 rounded-full border border-border px-2 py-0.5 text-xs text-primary">
            {t('anatomy.openThisCard')}
          </button>
        )}
      </nav>

      <div className="mt-3">
        <Scene key={scene.id} scene={scene} labels={labels} onActivate={onActivate} />
      </div>

      {openEntryId && <WordDetailCard entryId={openEntryId} onClose={() => setOpenEntryId(null)} />}
    </div>
  );
}
