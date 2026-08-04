// Static node-map for the interactive anatomy explorer. Each Scene is one inline
// SVG; each SceneNode is a clickable region (matches a data-node="..." in the SVG)
// that is either a leaf (opens the entryId's dictionary card) or a parent (zooms
// into childScene), or both (click drills; the word is reachable from the breadcrumb).
//
// The entryId values below are PLACEHOLDERS — swap for real dictionary_entries.id
// values tagged topic='anatomy' before the pilot shows real data. Tests mock the
// data layer, so they do not depend on these being real ids.
import bodySvg from '../anatomy/scenes/body.svg?raw';
import eyeSvg from '../anatomy/scenes/eye.svg?raw';

export interface SceneNode {
  node: string;        // matches data-node="..." in the SVG
  entryId?: string;    // dictionary word this region opens
  childScene?: string; // if set, clicking zooms into this scene id
  labelKey?: string;   // optional i18n label for a pure grouping node with no word
}

export interface Scene {
  id: string;
  svg: string;         // raw inline SVG markup
  nodes: SceneNode[];
}

export const ROOT_SCENE_ID = 'body';

export const SCENES: Record<string, Scene> = {
  body: {
    id: 'body',
    svg: bodySvg,
    nodes: [
      { node: 'eye', entryId: 'eye', childScene: 'eye' },
      { node: 'heart', entryId: 'heart' },
      { node: 'stomach', entryId: 'stomach' },
    ],
  },
  eye: {
    id: 'eye',
    svg: eyeSvg,
    nodes: [
      { node: 'conjunctiva', entryId: 'conjunctiva' },
      { node: 'iris', entryId: 'iris' },
      { node: 'pupil', entryId: 'pupil' },
    ],
  },
};

export function getScene(id: string): Scene | undefined {
  return SCENES[id];
}

export function nodeFor(scene: Scene, nodeName: string): SceneNode | undefined {
  return scene.nodes.find((n) => n.node === nodeName);
}

// Extract every data-node="..." value from a raw SVG string.
export function parseNodeIds(svg: string): string[] {
  const ids: string[] = [];
  const re = /data-node="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) ids.push(m[1]);
  return ids;
}

// Structural validation (offline, no DB). Returns a list of problems; empty = valid.
// NOTE: whether each entryId resolves to a real topic='anatomy' word is a content
// concern verified when real ids are wired in, not here.
export function validateScenes(scenes: Record<string, Scene>): string[] {
  const problems: string[] = [];
  for (const scene of Object.values(scenes)) {
    const svgNodes = new Set(parseNodeIds(scene.svg));
    const configNodes = new Set(scene.nodes.map((n) => n.node));
    for (const id of svgNodes) {
      if (!configNodes.has(id)) problems.push(`scene "${scene.id}": SVG data-node "${id}" has no config node`);
    }
    for (const n of scene.nodes) {
      if (!svgNodes.has(n.node)) problems.push(`scene "${scene.id}": config node "${n.node}" is absent from the SVG`);
      if (n.childScene && !scenes[n.childScene]) {
        problems.push(`scene "${scene.id}": node "${n.node}" references missing childScene "${n.childScene}"`);
      }
      if (!n.entryId && !n.childScene) {
        problems.push(`scene "${scene.id}": node "${n.node}" is neither a leaf (entryId) nor a parent (childScene)`);
      }
    }
  }
  return problems;
}
