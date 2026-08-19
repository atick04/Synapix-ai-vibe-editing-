/**
 * Graphics are authored on a 1080×1920 / 1920×1080 canvas.
 * Preview iframes are much smaller. transform:scale leaves a 1080px layout
 * box and the iframe cuts the right half. zoom on <html> shrinks LAYOUT
 * so the plate stays fully inside the iframe.
 */

export const GRAPHIC_CANVAS_FIT_CSS = `
html, body {
  width: var(--design-w, 1080px) !important;
  height: var(--design-h, 1920px) !important;
  margin: 0 !important;
  overflow: visible !important;
  background: transparent !important;
  background-color: transparent !important;
}
#root, .clip {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: var(--design-w, 1080px) !important;
  height: var(--design-h, 1920px) !important;
  max-width: none !important;
  max-height: none !important;
  overflow: visible !important;
  box-sizing: border-box !important;
  container-type: size;
}
`;

export const GRAPHIC_PLATE_UNCLIP_CSS = `
.clip .glass-card, .clip .card, .clip .plate, .clip .lower-third,
.clip [data-plate], .clip [data-synapix-plate],
.clip .abs-copy, .plate-bg, .plate-content,
.clip [data-plate-bg], .clip [data-plate-content] {
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
  max-height: none !important;
  box-sizing: border-box !important;
  text-overflow: unset !important;
}
.plate-bg, [data-plate-bg] {
  position: absolute !important;
  inset: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  border-radius: inherit !important;
}
.plate-content, [data-plate-content] {
  position: relative !important;
  z-index: 1 !important;
  width: max-content !important;
  max-width: none !important;
  flex: 0 0 auto !important;
  transform: none !important;
  overflow: visible !important;
}
.clip .headline, .clip .key, .clip h1, .clip h2, .clip h3,
.plate-content .headline, .plate-content .key {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
`;

export const GRAPHIC_ANTI_CLIP_CSS = `${GRAPHIC_CANVAS_FIT_CSS}${GRAPHIC_PLATE_UNCLIP_CSS}`;

export const GRAPHIC_FIT_ROOT_SCRIPT = `
function designSize(){
  var w = window.__DESIGN_W || 1080;
  var h = window.__DESIGN_H || 1920;
  return { w: w, h: h };
}
function unlockOverflow(){
  var sel = 'html,body,#root,.clip,.glass-card,.card,.plate,.lower-third,.abs-copy,.plate-bg,.plate-content,[data-plate],[data-synapix-plate],[data-plate-content],.headline,.key,h1,h2,h3';
  var nodes = document.querySelectorAll(sel);
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].style.setProperty('overflow', 'visible', 'important');
    nodes[i].style.setProperty('overflow-x', 'visible', 'important');
    nodes[i].style.setProperty('overflow-y', 'visible', 'important');
    nodes[i].classList.remove('overflow-hidden', 'overflow-x-hidden', 'overflow-y-hidden', 'truncate', 'text-ellipsis');
  }
}
function scaleRoot(){
  var d = designSize();
  var r = document.getElementById('root');
  if (r) {
    r.style.width = d.w + 'px';
    r.style.height = d.h + 'px';
    r.style.left = '0px';
    r.style.top = '0px';
    r.style.right = 'auto';
    r.style.bottom = 'auto';
    r.style.transform = 'none';
    r.style.zoom = '';
    r.style.overflow = 'visible';
  }
  if (document.body) {
    document.body.style.width = d.w + 'px';
    document.body.style.height = d.h + 'px';
    document.body.style.overflow = 'visible';
    document.body.style.zoom = '';
  }
  var html = document.documentElement;
  html.style.width = d.w + 'px';
  html.style.height = d.h + 'px';
  html.style.overflow = 'visible';
  var vw = window.innerWidth || d.w;
  var vh = window.innerHeight || d.h;
  var s = Math.min(vw / d.w, vh / d.h);
  if (!isFinite(s) || s <= 0) s = 1;
  html.style.zoom = String(s);
  unlockOverflow();
}
function findPlate(){
  return document.querySelector('[data-plate], [data-synapix-plate], .glass-card, .abs-copy, .plate, .lower-third');
}
function ensurePlateLayers(plate){
  if (!plate || plate.getAttribute('data-layered') === '1') return plate;
  if (plate.querySelector(':scope > .plate-content, :scope > [data-plate-content]')) {
    plate.setAttribute('data-layered', '1');
    return plate;
  }
  var content = document.createElement('div');
  content.className = 'plate-content';
  content.setAttribute('data-plate-content', '1');
  while (plate.firstChild) content.appendChild(plate.firstChild);
  var bg = document.createElement('div');
  bg.className = 'plate-bg';
  bg.setAttribute('data-plate-bg', '1');
  var cs = window.getComputedStyle(plate);
  bg.style.background = cs.background;
  bg.style.backgroundColor = cs.backgroundColor;
  bg.style.border = cs.border;
  bg.style.borderRadius = cs.borderRadius;
  bg.style.boxShadow = cs.boxShadow;
  bg.style.backdropFilter = cs.backdropFilter;
  bg.style.webkitBackdropFilter = cs.webkitBackdropFilter;
  plate.style.background = 'transparent';
  plate.style.backgroundColor = 'transparent';
  plate.style.border = 'none';
  plate.style.boxShadow = 'none';
  plate.style.backdropFilter = 'none';
  plate.appendChild(bg);
  plate.appendChild(content);
  plate.setAttribute('data-layered', '1');
  return plate;
}
function applyPlateBox(sx, sy){
  var plate = findPlate();
  if (!plate) return;
  ensurePlateLayers(plate);
  var d = designSize();
  var content = plate.querySelector('.plate-content, [data-plate-content]');
  if (!plate.dataset.baseW) {
    plate.style.width = 'max-content';
    plate.style.height = 'max-content';
    plate.dataset.baseW = String(Math.max(1, plate.offsetWidth));
    plate.dataset.baseH = String(Math.max(1, plate.offsetHeight));
  }
  var cw = content ? Math.max(content.scrollWidth, content.offsetWidth) : parseFloat(plate.dataset.baseW);
  var ch = content ? Math.max(content.scrollHeight, content.offsetHeight) : parseFloat(plate.dataset.baseH);
  var w = Math.max(cw, parseFloat(plate.dataset.baseW) * (sx || 1));
  var h = Math.max(ch, parseFloat(plate.dataset.baseH) * (sy || 1));
  w = Math.min(w, d.w * 0.96);
  h = Math.min(h, d.h * 0.96);
  plate.style.setProperty('width', Math.max(w, cw) + 'px', 'important');
  plate.style.setProperty('height', Math.max(h, ch) + 'px', 'important');
  plate.style.setProperty('max-width', 'none', 'important');
  plate.style.setProperty('max-height', 'none', 'important');
  plate.style.setProperty('overflow', 'visible', 'important');
  var zoom = parseFloat(document.documentElement.style.zoom) || 1;
  var box = plate.getBoundingClientRect();
  var left = box.left / zoom;
  var top = box.top / zoom;
  var pw = box.width / zoom;
  var ph = box.height / zoom;
  if (left + pw > d.w - 6) {
    plate.style.left = Math.max(6, d.w - 6 - pw) + 'px';
    plate.style.transform = 'none';
  }
  if (top + ph > d.h - 6) {
    plate.style.top = Math.max(6, d.h - 6 - ph) + 'px';
  }
  if (left < 0) {
    plate.style.left = '6px';
    plate.style.transform = 'none';
  }
  unlockOverflow();
}
window.__applyPlateBox = applyPlateBox;
window.addEventListener('message', function(ev){
  if (!ev.data || ev.data.type !== 'plate_layout') return;
  window.__plateSX = ev.data.scaleX || 1;
  window.__plateSY = ev.data.scaleY || 1;
  var plate = findPlate();
  if (ev.data.resetBase && plate) {
    delete plate.dataset.baseW;
    delete plate.dataset.baseH;
  }
  applyPlateBox(window.__plateSX, window.__plateSY);
});
window.addEventListener('resize', function(){
  scaleRoot();
  applyPlateBox(window.__plateSX || 1, window.__plateSY || 1);
});
scaleRoot();
applyPlateBox(window.__plateSX || 1, window.__plateSY || 1);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function(){
    scaleRoot();
    applyPlateBox(window.__plateSX || 1, window.__plateSY || 1);
  });
}
setTimeout(function(){ scaleRoot(); applyPlateBox(window.__plateSX || 1, window.__plateSY || 1); }, 40);
setTimeout(function(){ scaleRoot(); applyPlateBox(window.__plateSX || 1, window.__plateSY || 1); }, 280);
`;
