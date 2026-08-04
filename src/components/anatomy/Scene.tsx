import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nodeFor, type Scene as SceneType, type SceneNode } from '../../lib/anatomyScenes';

export interface SceneLabels { [entryId: string]: { he: string; en: string } }

// Renders one scene's SVG inline and wires interaction. Configured regions become
// focusable role="button" elements (English aria-label); regions with no config
// node stay inert. Desktop: hover highlights + shows the Hebrew label. Touch (no
// hover): first tap highlights + labels, second tap on the same region activates.
export function Scene({ scene, labels, onActivate }: {
  scene: SceneType; labels: SceneLabels; onActivate: (node: SceneNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // touch: first-tapped region

  // Memoized so the object identity is stable across re-renders (hover/armed state
  // changes shouldn't cause React to re-inject the SVG — that would replace the DOM
  // nodes mid-interaction and break event bubbling / node identity for listeners).
  const svgHtml = useMemo(() => ({ __html: scene.svg }), [scene.svg]);

  const isTouch = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: none)').matches;

  // After the SVG is injected, tag configured regions with a11y attributes.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<SVGElement>('[data-node]'))) {
      const name = el.getAttribute('data-node')!;
      const cfg = nodeFor(scene, name);
      if (!cfg) continue; // inert
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', labels[cfg.entryId ?? '']?.en ?? name);
      el.style.cursor = 'pointer';
    }
    setHovered(null);
    setArmed(null);
  }, [scene, labels]);

  const resolve = (target: EventTarget | null): SceneNode | undefined => {
    const el = (target as Element | null)?.closest?.('[data-node]');
    if (!el) return undefined;
    return nodeFor(scene, el.getAttribute('data-node')!);
  };

  const activate = useCallback((cfg: SceneNode) => {
    setHovered(null); setArmed(null);
    onActivate(cfg);
  }, [onActivate]);

  const onClick = (e: React.MouseEvent) => {
    const cfg = resolve(e.target);
    if (!cfg) return;
    if (isTouch && armed !== cfg.node) { setArmed(cfg.node); setHovered(cfg.node); return; }
    activate(cfg);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cfg = resolve(e.target);
    if (!cfg) return;
    e.preventDefault();
    activate(cfg);
  };

  const onMouseOver = (e: React.MouseEvent) => {
    const cfg = resolve(e.target);
    setHovered(cfg?.node ?? null);
  };

  const hoveredLabel = hovered
    ? labels[nodeFor(scene, hovered)?.entryId ?? '']?.he
    : undefined;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="anatomy-scene [&_[data-node]]:transition-opacity [&_[role=button]:hover]:opacity-70 [&_[role=button]:focus-visible]:outline [&_[role=button]:focus-visible]:outline-2 [&_[role=button]:focus-visible]:outline-primary"
        data-hovered={hovered ?? ''}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onMouseOver={onMouseOver}
        onMouseLeave={() => setHovered(null)}
        dangerouslySetInnerHTML={svgHtml}
      />
      {hoveredLabel && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-sm font-bold text-white">
          {hoveredLabel}
        </div>
      )}
    </div>
  );
}
