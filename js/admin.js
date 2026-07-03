/**
 * admin.js — Painel de administração para importar questões no Firestore.
 * Acessível apenas para o UID autorizado.
 */

export const ADMIN_UID = 'wyUsM2mZDCdlJfhfxo61qtnKGNW2';

export function isAdmin(usuario) {
  return usuario?.uid === ADMIN_UID;
}

/* ── Firebase dinâmico ──────────────────────────────── */
let _fb = null;

async function _firebase() {
  if (_fb) return _fb;
  try {
    const [{ db }, fsdk] = await Promise.all([
      import('./firebase.js'),
      import('firebase/firestore'),
    ]);
    const { collection, doc, setDoc, addDoc, getDocs, deleteDoc,
            serverTimestamp, query, orderBy, limit } = fsdk;
    _fb = { db, collection, doc, setDoc, addDoc, getDocs, deleteDoc,
            serverTimestamp, query, orderBy, limit };
  } catch (e) {
    console.error('Firebase indisponível no admin:', e);
  }
  return _fb;
}

/* ── Entrada pública ────────────────────────────────── */
export async function iniciarAdmin() {
  const el = document.getElementById('painel-admin');
  if (!el) return;

  el.innerHTML = _htmlAdmin();
  _bindAdmin(el);
  _carregarLista(el);
}

/* ── HTML do painel ─────────────────────────────────── */
function _htmlAdmin() {
  return `
    <div class="painel-header" data-emoji="🔧">
      <div class="painel-header-label">Administração</div>
      <div class="painel-header-titulo">Importar Questão</div>
    </div>

    <form id="admin-form" style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;">

      <div class="admin-campo">
        <label class="admin-label">Enunciado *</label>
        <textarea id="adm-enunciado" class="admin-input" rows="4" placeholder="Texto da questão..." required></textarea>
      </div>

      <div class="admin-grupo-alts">
        ${['A','B','C','D','E'].map(l => `
        <div class="admin-campo">
          <label class="admin-label">Alternativa ${l}</label>
          <input id="adm-alt-${l}" class="admin-input" type="text" placeholder="Alternativa ${l}">
        </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="admin-campo">
          <label class="admin-label">Gabarito *</label>
          <select id="adm-gabarito" class="admin-input" required>
            <option value="">Selecionar</option>
            ${['A','B','C','D','E'].map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>

        <div class="admin-campo">
          <label class="admin-label">Bloco *</label>
          <select id="adm-bloco" class="admin-input" required>
            <option value="">Selecionar</option>
            <option value="basicos">Básicos (CB)</option>
            <option value="complementares">Complementares (CC)</option>
            <option value="especificos">Específicos (CE)</option>
          </select>
        </div>

        <div class="admin-campo">
          <label class="admin-label">Incidência *</label>
          <select id="adm-incidencia" class="admin-input" required>
            <option value="">Selecionar</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>

        <div class="admin-campo">
          <label class="admin-label">Ano</label>
          <input id="adm-ano" class="admin-input" type="number" placeholder="2024" min="2000" max="2099">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="admin-campo">
          <label class="admin-label">Banca</label>
          <input id="adm-banca" class="admin-input" type="text" placeholder="ex: quadrix-2025">
        </div>

        <div class="admin-campo">
          <label class="admin-label">Tópico</label>
          <input id="adm-topico" class="admin-input" type="text" placeholder="ex: LDB-art22">
        </div>
      </div>

      <div class="admin-campo">
        <label class="admin-label">Origem</label>
        <input id="adm-origem" class="admin-input" type="text" placeholder="ex: Quadrix 2025 — Prova objetiva">
      </div>

      <div class="admin-campo">
        <label class="admin-label">Explicação do gabarito</label>
        <textarea id="adm-explicacao" class="admin-input" rows="3" placeholder="Justificativa da resposta correta..."></textarea>
      </div>

      <div id="admin-feedback" style="font-size:13px;min-height:20px;"></div>

      <button type="submit" class="btn btn-primario btn-full" id="adm-btn-salvar">
        ✚ Salvar no Firestore
      </button>
    </form>

    <div style="padding:0 16px 8px;">
      <div class="secao-header"><h3 class="secao-titulo">Últimas 10 questões importadas</h3></div>
    </div>
    <div id="admin-lista" style="padding:0 16px 32px;">
      <div class="painel-carregando"><div class="spinner" style="border-color:var(--cor-borda);border-top-color:var(--cor-secundaria);"></div></div>
    </div>
  `;
}

/* ── Bind do formulário ─────────────────────────────── */
function _bindAdmin(el) {
  const form = el.querySelector('#admin-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('#adm-btn-salvar');
    const feedback = el.querySelector('#admin-feedback');

    const dados = _coletarFormulario(el);
    if (!dados) {
      feedback.innerHTML = '<span style="color:var(--cor-erro);">Preencha os campos obrigatórios (*).</span>';
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Salvando…';
    feedback.innerHTML = '';

    const ok = await _salvarQuestao(dados);

    if (ok) {
      feedback.innerHTML = '<span style="color:var(--cor-sucesso);">✓ Questão salva com sucesso!</span>';
      form.reset();
      _carregarLista(el);
    } else {
      feedback.innerHTML = '<span style="color:var(--cor-erro);">Erro ao salvar. Verifique o console.</span>';
    }

    btn.disabled = false;
    btn.textContent = '✚ Salvar no Firestore';
  });
}

/* ── Coleta e valida os campos ──────────────────────── */
function _coletarFormulario(el) {
  const v = (id) => el.querySelector(`#${id}`)?.value.trim() ?? '';

  const enunciado  = v('adm-enunciado');
  const gabarito   = v('adm-gabarito');
  const bloco      = v('adm-bloco');
  const incidencia = v('adm-incidencia');

  if (!enunciado || !gabarito || !bloco || !incidencia) return null;

  const alternativas = {};
  for (const l of ['A','B','C','D','E']) {
    const txt = v(`adm-alt-${l}`);
    if (txt) alternativas[l] = txt;
  }

  return {
    enunciado,
    alternativas,
    gabarito,
    explicacao:  v('adm-explicacao') || '',
    bloco,
    topico:      v('adm-topico')      || '',
    banca:       v('adm-banca')       || '',
    ano:         parseInt(v('adm-ano')) || null,
    incidencia,
    origem:      v('adm-origem')      || '',
  };
}

/* ── Salva no Firestore ─────────────────────────────── */
async function _salvarQuestao(dados) {
  const fb = await _firebase();
  if (!fb) return false;

  const { db, collection, doc, setDoc, serverTimestamp } = fb;

  try {
    const ref = doc(collection(db, 'questoes'));
    await setDoc(ref, {
      id: ref.id,
      ...dados,
      criadoEm: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.error('Erro ao salvar questão:', e);
    return false;
  }
}

/* ── Lista últimas 10 questões ──────────────────────── */
async function _carregarLista(el) {
  const listaEl = el.querySelector('#admin-lista');
  if (!listaEl) return;

  listaEl.innerHTML = '<div class="painel-carregando"><div class="spinner" style="border-color:var(--cor-borda);border-top-color:var(--cor-secundaria);"></div></div>';

  const fb = await _firebase();
  if (!fb) {
    listaEl.innerHTML = '<p style="color:var(--cor-erro);font-size:13px;padding:8px 0;">Firebase indisponível.</p>';
    return;
  }

  const { db, collection, query, orderBy, limit, getDocs } = fb;

  try {
    const snap = await getDocs(
      query(collection(db, 'questoes'), orderBy('criadoEm', 'desc'), limit(10))
    );

    if (snap.empty) {
      listaEl.innerHTML = '<p style="color:var(--cor-texto-leve);font-size:13px;padding:8px 0;">Nenhuma questão importada ainda.</p>';
      return;
    }

    const itens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    listaEl.innerHTML = itens.map(q => _htmlItemLista(q)).join('');

    listaEl.querySelectorAll('[data-excluir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta questão do Firestore?')) return;
        btn.disabled = true;
        btn.textContent = '…';
        const ok = await _excluirQuestao(btn.dataset.excluir);
        if (ok) btn.closest('.admin-item').remove();
        else { btn.disabled = false; btn.textContent = '🗑️'; }
      });
    });
  } catch (e) {
    console.error('Erro ao listar questões:', e);
    listaEl.innerHTML = '<p style="color:var(--cor-erro);font-size:13px;padding:8px 0;">Erro ao carregar lista.</p>';
  }
}

function _htmlItemLista(q) {
  const blocoLabel = { basicos: 'CB', complementares: 'CC', especificos: 'CE' }[q.bloco] || q.bloco;
  const enunciado = _esc(q.enunciado?.slice(0, 80) ?? '');
  return `
    <div class="admin-item card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--cor-texto-leve);margin-bottom:4px;">
          <span class="tag" style="font-size:10px;">${_esc(blocoLabel)}</span>
          <span style="margin-left:4px;">${_esc(q.banca || '')} ${q.ano || ''} · Gab: <strong>${_esc(q.gabarito || '')}</strong></span>
        </div>
        <div style="font-size:13px;color:var(--cor-texto);line-height:1.4;">${enunciado}…</div>
      </div>
      <button class="btn btn-sm" style="color:var(--cor-erro);border-color:var(--cor-erro);flex-shrink:0;"
        data-excluir="${_esc(q.id)}" title="Excluir">🗑️</button>
    </div>`;
}

async function _excluirQuestao(id) {
  const fb = await _firebase();
  if (!fb) return false;
  const { db, doc, deleteDoc, collection } = fb;
  try {
    await deleteDoc(doc(collection(db, 'questoes'), id));
    return true;
  } catch (e) {
    console.error('Erro ao excluir:', e);
    return false;
  }
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
