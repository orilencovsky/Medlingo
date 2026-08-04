import { describe, expect, it } from 'vitest';
import { SCENES, ROOT_SCENE_ID, getScene, nodeFor, parseNodeIds, validateScenes } from './anatomyScenes';

describe('anatomyScenes config', () => {
  it('has a valid root scene', () => {
    expect(getScene(ROOT_SCENE_ID)).toBeDefined();
  });

  it('parseNodeIds extracts every data-node from an SVG string', () => {
    const svg = '<svg><circle data-node="eye"/><rect data-node="heart"/><rect/></svg>';
    expect(parseNodeIds(svg).sort()).toEqual(['eye', 'heart']);
  });

  it('nodeFor finds a configured node by name', () => {
    const body = getScene('body')!;
    expect(nodeFor(body, 'eye')?.childScene).toBe('eye');
    expect(nodeFor(body, 'nonexistent')).toBeUndefined();
  });

  it('validateScenes reports no problems for the shipped config', () => {
    expect(validateScenes(SCENES)).toEqual([]);
  });

  it('validateScenes flags a data-node with no config node', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg><circle data-node="ghost"/></svg>', nodes: [] },
    };
    expect(validateScenes(broken).some((p) => p.includes('ghost'))).toBe(true);
  });

  it('validateScenes flags a config node missing from the SVG', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg></svg>', nodes: [{ node: 'phantom', entryId: 'w' }] },
    };
    expect(validateScenes(broken).some((p) => p.includes('phantom'))).toBe(true);
  });

  it('validateScenes flags a childScene that does not exist', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg><circle data-node="a"/></svg>', nodes: [{ node: 'a', childScene: 'missing' }] },
    };
    expect(validateScenes(broken).some((p) => p.includes('missing'))).toBe(true);
  });

  it('every node in the config is either a leaf (entryId) or a parent (childScene)', () => {
    for (const scene of Object.values(SCENES)) {
      for (const n of scene.nodes) {
        expect(Boolean(n.entryId) || Boolean(n.childScene)).toBe(true);
      }
    }
  });
});
