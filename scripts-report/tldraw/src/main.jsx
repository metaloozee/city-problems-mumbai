import React from 'react';
import { createRoot } from 'react-dom/client';
import { Tldraw, toRichText, createShapeId } from 'tldraw';
import { getAssetUrls } from '@tldraw/assets/selfHosted';
import 'tldraw/tldraw.css';
import { DIAGRAMS } from './diagrams.js';

const assetUrls = getAssetUrls({ baseUrl: '/tl' });
const name = new URLSearchParams(location.search).get('d');

function build(editor, spec) {
  const id = (k) => createShapeId(k);
  for (const f of spec.frames ?? []) {
    editor.createShape({ id: id(f.id), type: 'geo', x: f.x, y: f.y, props: { geo: 'rectangle', w: f.w, h: f.h, color: f.color, fill: 'none', dash: 'dashed', size: 's', font: 'sans', align: 'start', verticalAlign: 'start', richText: toRichText(f.text), labelColor: f.color } });
  }
  for (const b of spec.boxes) {
    editor.createShape({ id: id(b.id), type: 'geo', x: b.x, y: b.y, props: { geo: 'rectangle', w: b.w, h: b.h, color: b.color, fill: 'semi', dash: 'solid', size: 's', font: b.align === 'start' ? 'mono' : 'sans', align: b.align ?? 'middle', verticalAlign: b.align === 'start' ? 'start' : 'middle', richText: toRichText(b.text), labelColor: 'black' } });
  }
  spec.arrows.forEach((a, i) => {
    const aid = id('arrow_' + i);
    editor.createShape({ id: aid, type: 'arrow', x: 0, y: 0, props: { kind: a.kind ?? 'arc', bend: a.bend ?? 0, color: 'black', size: 's', font: 'sans', text: a.text ?? '', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } });
    for (const [terminal, target] of [['start', a.from], ['end', a.to]]) {
      editor.createBinding({ type: 'arrow', fromId: aid, toId: id(target), props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } });
    }
  });
}

function App() {
  return <div style={{ position: 'fixed', inset: 0 }}>
    <Tldraw assetUrls={assetUrls} onMount={(editor) => {
      build(editor, DIAGRAMS[name]);
      editor.zoomToFit();
      window.exportPng = async () => {
        const ids = [...editor.getCurrentPageShapeIds()];
        const { blob } = await editor.toImage(ids, { format: 'png', scale: 1, background: true, padding: 32, darkMode: false });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      };
      window.exportTldr = () => JSON.stringify(editor.store.getStoreSnapshot());
      window.ready = true;
    }} />
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
