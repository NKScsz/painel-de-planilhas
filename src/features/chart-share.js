import { chartImage, chartLabels, describeChart } from '../charts/draw-and-pdf.js';
import { downloads } from '../app/init.js';
import { icon } from '../app/render.js';
import { el, toast } from '../core/utils.ts';
import { brand } from './brand.js';
import { popMenu } from '../easy/simple-mode.js';

/* ----- Gráfico como imagem (para mandar no WhatsApp) -----
   Monta uma imagem em fundo branco com a marca, o título, o gráfico e a explicação.
   No celular abre o "Compartilhar" do sistema (WhatsApp aparece ali); no computador, copia ou baixa. */
const W = 1080, PAD = 56;
const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line);
  }
  return out;
}

async function chartPicture(meta, spec, res) {
  const { title, sub, yLabel } = chartLabels(spec, res);
  const b = brand(), inner = W - PAD * 2;
  const chartH = spec.type === 'pie' ? 560 : 520;
  const [chartImg, logo] = await Promise.all([loadImg(chartImage(spec, res, yLabel, { w: inner, h: chartH, font: 15 })), loadImg(b.logo)]);
  const note = describeChart(meta, spec, res);
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const font = (w, s) => `${w} ${s}px Inter, "Segoe UI", Arial, sans-serif`;
  // mede a explicação antes de definir a altura
  ctx.font = font(400, 24); const noteLines = wrap(ctx, note, inner).slice(0, 7);
  ctx.font = font(600, 40); const titleLines = wrap(ctx, title, inner).slice(0, 2);
  const H = PAD + 44 + 28 + titleLines.length * 50 + 40 + 24 + chartH + 32 + 34 + noteLines.length * 34 + 40 + 40 + PAD;
  cv.width = W; cv.height = H;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  let y = PAD;
  // marca (logo ou nome) e data
  if (logo) { const h = 44, w = Math.min(260, logo.width * (h / logo.height)); ctx.drawImage(logo, PAD, y, w, h); }
  else { ctx.fillStyle = b.custom ? b.color : '#1f1f22'; ctx.font = font(600, 26); ctx.textBaseline = 'middle'; ctx.fillText(b.name || 'Painel de Planilhas', PAD, y + 22); }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = '#6b6b72'; ctx.font = font(400, 22);
  ctx.fillText(new Date().toLocaleDateString('pt-BR'), W - PAD, y + 22); ctx.textAlign = 'left';
  y += 44 + 28;
  ctx.strokeStyle = '#e6e6ea'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y - 14); ctx.lineTo(W - PAD, y - 14); ctx.stroke();
  // título e subtítulo
  ctx.textBaseline = 'top'; ctx.fillStyle = '#141415'; ctx.font = font(600, 40);
  for (const l of titleLines) { ctx.fillText(l, PAD, y); y += 50; }
  ctx.fillStyle = '#6b6b72'; ctx.font = font(400, 24); ctx.fillText(`${sub} · ${meta.name}`.slice(0, 90), PAD, y + 4); y += 40 + 24;
  if (chartImg) ctx.drawImage(chartImg, PAD, y, inner, chartH);
  y += chartH + 32;
  // explicação
  ctx.fillStyle = '#6b6b72'; ctx.font = font(600, 22); ctx.fillText('Sobre este gráfico', PAD, y); y += 34;
  ctx.fillStyle = '#2a2a2e'; ctx.font = font(400, 24);
  for (const l of noteLines) { ctx.fillText(l, PAD, y); y += 34; }
  y += 40;
  ctx.fillStyle = '#9a9aa2'; ctx.font = font(400, 20); ctx.fillText('Feito com o Painel de Planilhas', PAD, y);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const name = `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim() || 'grafico'}.png`;
  return { blob, name, title };
}

/** Botão de imagem: compartilha no celular; no computador, oferece copiar (para colar no WhatsApp Web) ou baixar. */
async function chartImageAction(anchor, meta, spec, res) {
  if (!res || !res.labels || !res.labels.length) { toast('Este gráfico está sem dados com os filtros atuais.', true); return; }
  const t = toast('Preparando a imagem…', false, 30000);
  let pic;
  try { pic = await chartPicture(meta, spec, res); } catch (e) { console.error(e); t.remove(); toast('Não foi possível gerar a imagem deste gráfico.', true); return; }
  t.remove();
  const file = new File([pic.blob], pic.name, { type: 'image/png' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: pic.title }); } catch (e) { if (e && e.name !== 'AbortError') save(pic); }
    return;
  }
  const canCopy = !!(navigator.clipboard && window.ClipboardItem);
  popMenu(anchor, [
    canCopy ? { icon: 'copy', label: 'Copiar imagem', hint: 'Depois é só colar (Ctrl+V) na conversa do WhatsApp Web', onclick: async () => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': pic.blob })]); toast('Imagem copiada. Cole na conversa do WhatsApp com Ctrl+V.'); } catch { save(pic); }
    } } : null,
    { icon: 'download', label: 'Baixar imagem', hint: 'Salva o arquivo PNG para anexar no WhatsApp ou em outro lugar', onclick: () => save(pic) },
  ], 'Imagem do gráfico');
}
async function save(pic) {
  try { await downloads.save({ filename: pic.name, data: pic.blob }); toast('Imagem baixada. No WhatsApp, anexe pela opção de foto ou documento.'); }
  catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('Download não concluído.', true); }
}
const imageButton = (meta, spec, getRes) => el('button', { class: 'icon-btn', title: 'Imagem para WhatsApp', 'aria-label': 'Imagem do gráfico para WhatsApp', onclick: e => chartImageAction(e.currentTarget, meta, spec, getRes()) }, icon('image'));

export { chartImageAction, chartPicture, imageButton };
