import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Scene } from './Scene';
import type { Scene as SceneType } from '../../lib/anatomyScenes';

const SCENE: SceneType = {
  id: 'body',
  svg: '<svg><circle data-node="eye"/><rect data-node="heart"/><rect data-node="untagged_inert" class="deco"/></svg>',
  nodes: [
    { node: 'eye', entryId: 'eye', childScene: 'eye' },
    { node: 'heart', entryId: 'heart' },
  ],
};
const LABELS = { eye: { he: 'עַיִן', en: 'eye' }, heart: { he: 'לֵב', en: 'heart' } };

function renderScene(onActivate = vi.fn()) {
  render(<Scene scene={SCENE} labels={LABELS} onActivate={onActivate} />);
  return onActivate;
}

describe('Scene', () => {
  it('marks configured regions as focusable buttons with an english aria-label', () => {
    renderScene();
    const eye = document.querySelector('[data-node="eye"]')!;
    expect(eye.getAttribute('role')).toBe('button');
    expect(eye.getAttribute('tabindex')).toBe('0');
    expect(eye.getAttribute('aria-label')).toBe('eye');
  });

  it('leaves an SVG region with no config node inert (not focusable)', () => {
    renderScene();
    const inert = document.querySelector('[data-node="untagged_inert"]')!;
    expect(inert.getAttribute('role')).toBeNull();
    expect(inert.getAttribute('tabindex')).toBeNull();
  });

  it('activates the node on click', async () => {
    const onActivate = renderScene();
    await userEvent.click(document.querySelector('[data-node="heart"]')!);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ node: 'heart', entryId: 'heart' }));
  });

  it('activates the node on Enter', async () => {
    const onActivate = renderScene();
    const eye = document.querySelector('[data-node="eye"]') as HTMLElement;
    eye.focus();
    await userEvent.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ node: 'eye' }));
  });
});
