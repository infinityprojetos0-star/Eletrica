/**
 * Store VoltES — cache + sync multi-dispositivo (plano Spark)
 *
 * - Cache: memória → localStorage → IndexedDB
 * - Firebase: só diffs por path (item A e item B não se sobrescrevem)
 * - Conflito no MESMO item: last-write-wins por updatedAt (+ deviceId)
 * - Listeners child_* (não puxa a árvore inteira a cada mudança)
 * - Fila de patches pendentes (offline / falha de rede)
 */
const Store = (() => {
  const OLD_KEYS = ["voltes-data-v1"];
  const ROOT = "voltes";
  const FLUSH_MS = 500;

  const USER_LIST_KEYS = ["clientes", "orcamentos", "contratos", "lancamentos", "despesasFixas"];
  const CATALOG_KEYS = ["servicos", "produtos"];
  const CATALOG_FIELDS = [
    "nome",
    "categoria",
    "tipo",
    "unidade",
    "preco",
    "precoMin",
    "precoMax",
    "tempo",
    "descricao",
    "marca",
    "custo"
  ];

  const defaultState = () => ({
    version: 2,
    catalogVersion: 3,
    precoModo: "medio",
    empresa: { ...SEED_EMPRESA, updatedAt: 0 },
    clientes: [
      {
        id: "cli-demo-1",
        tipo: "pf",
        nome: "Maria Silva",
        documento: "123.456.789-00",
        telefone: "(27) 98888-1111",
        email: "maria@email.com",
        endereco: "Praia do Canto, Vitória - ES",
        status: "ativo",
        criadoEm: todayISO(),
        updatedAt: 0
      },
      {
        id: "cli-demo-2",
        tipo: "pj",
        nome: "Comércio Capixaba Ltda",
        documento: "12.345.678/0001-90",
        telefone: "(27) 3333-2222",
        email: "contato@capixaba.com",
        endereco: "Centro, Vila Velha - ES",
        status: "ativo",
        criadoEm: todayISO(),
        updatedAt: 0
      }
    ],
    servicos: SEED_SERVICOS.map((s) => ({ ...s, updatedAt: 0 })),
    produtos: SEED_PRODUTOS.map((p) => ({ ...p, updatedAt: 0 })),
    orcamentos: [],
    contratos: [],
    lancamentos: [],
    despesasFixas: [
      { id: "df-1", nome: "Internet", categoria: "Internet", valor: 99.9, updatedAt: 0 },
      { id: "df-2", nome: "Combustível", categoria: "Transporte", valor: 280, updatedAt: 0 },
      { id: "df-3", nome: "Consumíveis / ferramentas", categoria: "Material", valor: 60, updatedAt: 0 }
    ]
  });

  let DEVICE_ID = "dev-unknown";
  let state = defaultState();
  let cloudStatus = "local";
  let flushTimer = null;
  let flushing = false;
  let listeners = [];
  let cloudReady = false;
  let applyingRemote = false;

  function listToMap(arr) {
    const map = {};
    (arr || []).forEach((item) => {
      if (!item || !item.id) return;
      map[item.id] = item;
    });
    return map;
  }

  function mapToList(map) {
    if (!map) return [];
    if (Array.isArray(map)) return map.filter(Boolean);
    return Object.values(map).filter(Boolean);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function now() {
    return Date.now();
  }

  function contentOf(item) {
    if (!item || typeof item !== "object") return item;
    const { updatedAt, deviceId, ...rest } = item;
    return rest;
  }

  function slimItem(item) {
    if (!item || typeof item !== "object") return item;
    const out = {};
    Object.keys(item).forEach((k) => {
      const v = item[k];
      if (v == null) return;
      if (typeof v === "string" && v.startsWith("data:")) return;
      if (typeof v === "string" && v.length > 4000) return;
      if (typeof v === "object") {
        const nested = slimItem(v);
        if (nested && (Array.isArray(nested) || Object.keys(nested).length)) out[k] = nested;
        return;
      }
      out[k] = v;
    });
    return DataCache.sanitizeFirebase(out);
  }

  function stamp(item, ts = now()) {
    return { ...item, updatedAt: ts, deviceId: DEVICE_ID };
  }

  function isNewer(remote, local) {
    const r = remote?.updatedAt || 0;
    const l = local?.updatedAt || 0;
    if (r !== l) return r > l;
    // empate: prioriza o outro dispositivo só se for diferente (evita eco local)
    if (remote?.deviceId && local?.deviceId && remote.deviceId !== local.deviceId) {
      return String(remote.deviceId) > String(local.deviceId);
    }
    return false;
  }

  function seedFor(key) {
    return key === "servicos" ? SEED_SERVICOS : SEED_PRODUTOS;
  }

  function buildCatalogPatchEntry(item, seedMap) {
    const base = seedMap[item.id];
    if (!base) return slimItem(stamp(item));
    const diff = { id: item.id, updatedAt: item.updatedAt || now(), deviceId: item.deviceId || DEVICE_ID };
    let changed = false;
    CATALOG_FIELDS.forEach((f) => {
      if (item[f] !== undefined && !same(item[f], base[f])) {
        diff[f] = item[f];
        changed = true;
      }
    });
    return changed ? slimItem(diff) : null;
  }

  function buildCatalogPatch(items, seed) {
    const seedMap = listToMap(seed);
    const itemMap = listToMap(items);
    const patch = {};
    Object.values(itemMap).forEach((item) => {
      const entry = buildCatalogPatchEntry(item, seedMap);
      if (entry) patch[item.id] = entry;
    });
    Object.keys(seedMap).forEach((id) => {
      if (!itemMap[id]) {
        patch[id] = { id, _deleted: true, updatedAt: now(), deviceId: DEVICE_ID };
      }
    });
    return patch;
  }

  function applyCatalogPatch(seed, patchMap) {
    const patch = patchMap || {};
    const map = {};
    seed.forEach((s) => {
      map[s.id] = { ...s, updatedAt: 0 };
    });
    Object.entries(patch).forEach(([id, val]) => {
      if (!val) return;
      if (val._deleted) {
        delete map[id];
        return;
      }
      map[id] = map[id] ? { ...map[id], ...val, id } : { ...val, id };
    });
    return Object.values(map);
  }

  function migrateFromOld() {
    for (const k of OLD_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const old = JSON.parse(raw);
        const next = defaultState();
        next.empresa = { ...next.empresa, ...(old.empresa || {}) };
        next.clientes = old.clientes?.length ? old.clientes : next.clientes;
        next.orcamentos = old.orcamentos || [];
        next.contratos = old.contratos || [];
        next.lancamentos = old.lancamentos || [];
        next.despesasFixas = old.despesasFixas || next.despesasFixas;
        localStorage.removeItem(k);
        return next;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function emit(stateChanged = true) {
    window.dispatchEvent(
      new CustomEvent("voltes:store", {
        detail: { status: cloudStatus, state, stateChanged }
      })
    );
  }

  function setStatus(status) {
    if (cloudStatus === status) return;
    cloudStatus = status;
    // Só atualiza o chip — evita re-render da página a cada sync
    emit(false);
  }

  function persistCache() {
    DataCache.setState(state);
  }

  function get() {
    return state;
  }

  function getStatus() {
    return cloudStatus;
  }

  /** Marca só entidades que mudaram de conteúdo */
  function stampDiff(prev, next) {
    const ts = now();
    const out = { ...next };

    if (!same(contentOf(prev.empresa), contentOf(next.empresa))) {
      out.empresa = stamp({ ...next.empresa }, ts);
    }

    if (prev.precoModo !== next.precoModo) {
      out._precoModoTs = ts;
    }

    USER_LIST_KEYS.forEach((key) => {
      if (prev[key] === next[key]) return;
      const prevMap = listToMap(prev[key]);
      const nextMap = listToMap(next[key]);
      out[key] = Object.values(nextMap).map((item) => {
        const old = prevMap[item.id];
        if (!old || !same(contentOf(old), contentOf(item))) return stamp(item, ts);
        return item;
      });
      out[`_deleted_${key}`] = Object.keys(prevMap).filter((id) => !nextMap[id]);
    });

    CATALOG_KEYS.forEach((key) => {
      if (prev[key] === next[key]) return;
      const prevMap = listToMap(prev[key]);
      const nextMap = listToMap(next[key]);
      out[key] = Object.values(nextMap).map((item) => {
        const old = prevMap[item.id];
        if (!old || !same(contentOf(old), contentOf(item))) return stamp(item, ts);
        return item;
      });
      out[`_deleted_${key}`] = Object.keys(prevMap).filter((id) => !nextMap[id]);
    });

    return out;
  }

  function enqueueFromDiff(prev, next) {
    if (next.empresa && !same(contentOf(prev.empresa), contentOf(next.empresa))) {
      DataCache.queuePatch("empresa", slimItem(next.empresa));
    }

    if (prev.precoModo !== next.precoModo) {
      const modo = ["minimo", "medio", "maximo"].includes(next.precoModo)
        ? next.precoModo
        : "medio";
      DataCache.queuePatch("meta/precoModo", modo);
      DataCache.queuePatch("meta/precoModoTs", next._precoModoTs || now());
      DataCache.queuePatch("meta/precoModoDevice", DEVICE_ID || "unknown");
    }

    if (prev.version !== next.version && next.version != null) {
      DataCache.queuePatch("meta/version", next.version);
    }
    if (prev.catalogVersion !== next.catalogVersion && next.catalogVersion != null) {
      DataCache.queuePatch("meta/catalogVersion", next.catalogVersion);
    }

    USER_LIST_KEYS.forEach((key) => {
      const prevMap = listToMap(prev[key]);
      const nextMap = listToMap(next[key]);
      Object.keys(nextMap).forEach((id) => {
        if (!same(contentOf(prevMap[id]), contentOf(nextMap[id])) || !prevMap[id]) {
          DataCache.queuePatch(`${key}/${id}`, slimItem(nextMap[id]));
        }
      });
      (next[`_deleted_${key}`] || []).forEach((id) => {
        DataCache.queuePatch(`${key}/${id}`, null);
      });
    });

    CATALOG_KEYS.forEach((key) => {
      const patchKey = key === "servicos" ? "servicosPatch" : "produtosPatch";
      const seedMap = listToMap(seedFor(key));
      const prevMap = listToMap(prev[key]);
      const nextMap = listToMap(next[key]);

      Object.keys(nextMap).forEach((id) => {
        if (!same(contentOf(prevMap[id]), contentOf(nextMap[id])) || !prevMap[id]) {
          const entry = buildCatalogPatchEntry(nextMap[id], seedMap);
          if (entry) DataCache.queuePatch(`${patchKey}/${id}`, entry);
          else DataCache.queuePatch(`${patchKey}/${id}`, null);
        }
      });
      (next[`_deleted_${key}`] || []).forEach((id) => {
        if (seedMap[id]) {
          DataCache.queuePatch(`${patchKey}/${id}`, {
            id,
            _deleted: true,
            updatedAt: now(),
            deviceId: DEVICE_ID
          });
        } else {
          DataCache.queuePatch(`${patchKey}/${id}`, null);
        }
      });
    });
  }

  function stripInternal(next) {
    const out = { ...next };
    Object.keys(out).forEach((k) => {
      if (k.startsWith("_deleted_") || k === "_precoModoTs") delete out[k];
    });
    return out;
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushPending();
    }, FLUSH_MS);
  }

  let flushFailures = 0;

  async function flushPending() {
    if (!cloudReady || !FirebaseApp.isReady() || flushing) return;
    DataCache.scrubPending();
    const pending = DataCache.getPending();
    const paths = Object.keys(pending);
    if (!paths.length) {
      flushFailures = 0;
      setStatus("online");
      return;
    }

    const root = FirebaseApp.ref(ROOT);
    if (!root) return;

    flushing = true;
    setStatus("syncing");

    const updates = {};
    const validPaths = [];
    paths.forEach((path) => {
      const raw = pending[path]?.value;
      if (raw === undefined) return;
      const clean = raw === null ? null : DataCache.sanitizeFirebase(raw);
      if (clean === undefined) return;
      updates[path] = clean;
      validPaths.push(path);
    });

    if (!validPaths.length) {
      DataCache.clearPatches(paths);
      flushing = false;
      flushFailures = 0;
      setStatus("online");
      return;
    }

    updates["meta/updatedAt"] = new Date().toISOString();
    updates["meta/rev"] = now();

    // Garante meta/precoModo válido se estiver no pacote
    if ("meta/precoModo" in updates) {
      const modo = updates["meta/precoModo"];
      if (!["minimo", "medio", "maximo"].includes(modo)) {
        updates["meta/precoModo"] = state.precoModo || "medio";
      }
    }

    try {
      await root.update(updates);
      DataCache.clearPatches(validPaths);
      flushFailures = 0;
      setStatus(Object.keys(DataCache.getPending()).length ? "syncing" : "online");
    } catch (err) {
      console.error("Firebase flush:", err);
      flushFailures += 1;
      // Remove patches inválidos que travam o loop (ex.: undefined antigo no cache)
      if (String(err?.message || err).includes("undefined")) {
        DataCache.scrubPending();
        DataCache.clearPatches(validPaths.filter((p) => pending[p]?.value === undefined));
        // descarta fila corrompida após várias falhas
        if (flushFailures >= 3) {
          console.warn("Firebase: limpando fila pendente corrompida");
          DataCache.setPending({});
          flushFailures = 0;
        }
      }
      setStatus("error");
    } finally {
      flushing = false;
      const left = Object.keys(DataCache.getPending()).length;
      if (left && flushFailures < 5) {
        flushTimer = setTimeout(() => flushPending(), Math.min(8000, 800 * 2 ** flushFailures));
      }
    }
  }

  function upsertListItem(key, item) {
    if (!item || !item.id) return;
    const list = state[key] || [];
    const idx = list.findIndex((x) => x.id === item.id);
    const local = idx >= 0 ? list[idx] : null;
    const pending = DataCache.getPending()[`${key}/${item.id}`];

    // Se temos escrita local pendente mais nova, mantém local
    if (pending && (pending.ts || 0) >= (item.updatedAt || 0)) return;

    if (local && !isNewer(item, local)) return;

    const nextList = list.slice();
    if (idx >= 0) nextList[idx] = item;
    else nextList.push(item);

    applyingRemote = true;
    state = { ...state, [key]: nextList };
    persistCache();
    applyingRemote = false;
    emit();
  }

  function removeListItem(key, id) {
    const pending = DataCache.getPending()[`${key}/${id}`];
    // Pendência de recriação/edição: não remove
    if (pending && pending.value != null) return;

    const list = state[key] || [];
    if (!list.some((x) => x.id === id)) return;

    applyingRemote = true;
    state = { ...state, [key]: list.filter((x) => x.id !== id) };
    persistCache();
    applyingRemote = false;
    emit();
  }

  function upsertCatalogPatch(catalogKey, patchEntry) {
    if (!patchEntry || !patchEntry.id) return;
    const id = patchEntry.id;
    const patchPath = catalogKey === "servicos" ? "servicosPatch" : "produtosPatch";
    const pending = DataCache.getPending()[`${patchPath}/${id}`];
    if (pending && (pending.ts || 0) >= (patchEntry.updatedAt || 0)) return;

    const seed = seedFor(catalogKey);
    const seedMap = listToMap(seed);
    let list = (state[catalogKey] || []).slice();
    const idx = list.findIndex((x) => x.id === id);
    const local = idx >= 0 ? list[idx] : null;

    if (patchEntry._deleted) {
      if (pending && pending.value && !pending.value._deleted) return;
      if (local && !isNewer(patchEntry, local)) return;
      list = list.filter((x) => x.id !== id);
    } else {
      const merged = local
        ? { ...local, ...patchEntry, id }
        : { ...(seedMap[id] || {}), ...patchEntry, id };
      if (local && !isNewer(merged, local) && same(contentOf(local), contentOf(merged))) return;
      if (local && !isNewer(patchEntry, local) && (local.updatedAt || 0) > 0) return;
      if (idx >= 0) list[idx] = merged;
      else list.push(merged);
    }

    applyingRemote = true;
    state = { ...state, [catalogKey]: list };
    persistCache();
    applyingRemote = false;
    emit();
  }

  function applyEmpresaRemote(remote) {
    if (!remote) return;
    const pending = DataCache.getPending().empresa;
    if (pending && (pending.ts || 0) >= (remote.updatedAt || 0)) return;
    if (!isNewer(remote, state.empresa) && same(contentOf(remote), contentOf(state.empresa))) return;
    if (state.empresa && !isNewer(remote, state.empresa) && (state.empresa.updatedAt || 0) > 0) return;

    applyingRemote = true;
    state = { ...state, empresa: { ...state.empresa, ...remote } };
    persistCache();
    applyingRemote = false;
    emit();
  }

  function applyMetaRemote(meta) {
    if (!meta) return;
    let changed = false;
    const next = { ...state };

    const pendingModo = DataCache.getPending()["meta/precoModo"];
    const remoteTs = meta.precoModoTs || 0;
    if (meta.precoModo && meta.precoModo !== state.precoModo) {
      if (!pendingModo || remoteTs > (pendingModo.ts || 0)) {
        next.precoModo = meta.precoModo;
        changed = true;
      }
    }
    if (meta.version != null && meta.version !== state.version) {
      next.version = meta.version;
      changed = true;
    }
    if (meta.catalogVersion != null && meta.catalogVersion !== state.catalogVersion) {
      next.catalogVersion = meta.catalogVersion;
      changed = true;
    }

    if (!changed) return;
    applyingRemote = true;
    state = next;
    persistCache();
    applyingRemote = false;
    emit();
  }

  function mergeInitialRemote(raw) {
    if (!raw) return state;

    // Migra legado: catálogo completo → patches + apaga nós pesados
    const cleanup = {};
    if (raw.servicos && !raw.servicosPatch) {
      cleanup.servicosPatch = buildCatalogPatch(mapToList(raw.servicos), SEED_SERVICOS);
    }
    if (raw.produtos && !raw.produtosPatch) {
      cleanup.produtosPatch = buildCatalogPatch(mapToList(raw.produtos), SEED_PRODUTOS);
    }
    if (raw.servicos) cleanup.servicos = null;
    if (raw.produtos) cleanup.produtos = null;

    const data = { ...raw, ...cleanup };
    if (cleanup.servicosPatch) data.servicosPatch = cleanup.servicosPatch;
    if (cleanup.produtosPatch) data.produtosPatch = cleanup.produtosPatch;

    const remoteState = {
      ...state,
      version: data.meta?.version ?? data.version ?? state.version,
      catalogVersion: data.meta?.catalogVersion ?? data.catalogVersion ?? state.catalogVersion,
      precoModo: data.meta?.precoModo || data.precoModo || state.precoModo,
      empresa: mergeEntity(state.empresa, data.empresa),
      servicos: mergeCatalog(state.servicos, SEED_SERVICOS, data.servicosPatch, data.servicos),
      produtos: mergeCatalog(state.produtos, SEED_PRODUTOS, data.produtosPatch, data.produtos)
    };

    USER_LIST_KEYS.forEach((key) => {
      remoteState[key] = mergeLists(state[key], mapToList(data[key]));
    });

    // Reaplica pendências locais por cima (não perde edição offline)
    const pending = DataCache.getPending();
    Object.entries(pending).forEach(([path, op]) => {
      applyPendingOnto(remoteState, path, op.value);
    });

    if (Object.keys(cleanup).length && FirebaseApp.ref(ROOT)) {
      FirebaseApp.ref(ROOT).update(cleanup).catch(() => {});
    }

    return remoteState;
  }

  function mergeEntity(local, remote) {
    if (!remote) return local || {};
    if (!local) return remote;
    return isNewer(remote, local) ? { ...local, ...remote } : local;
  }

  function mergeLists(localList, remoteList) {
    const map = listToMap(localList);
    (remoteList || []).forEach((item) => {
      if (!item?.id) return;
      const local = map[item.id];
      if (!local) map[item.id] = item;
      else if (isNewer(item, local)) map[item.id] = { ...local, ...item };
    });
    // Itens só locais (ainda não na nuvem) permanecem
    return Object.values(map);
  }

  function mergeCatalog(localList, seed, patchMap, legacyMap) {
    let base = applyCatalogPatch(seed, patchMap || {});
    if ((!patchMap || !Object.keys(patchMap).length) && legacyMap) {
      base = mapToList(legacyMap);
    }
    return mergeLists(localList, base);
  }

  function applyPendingOnto(target, path, value) {
    if (path === "empresa" && value) {
      target.empresa = { ...target.empresa, ...value };
      return;
    }
    if (path === "meta/precoModo" && value != null) {
      target.precoModo = value;
      return;
    }
    const m = path.match(/^(clientes|orcamentos|contratos|lancamentos|despesasFixas)\/(.+)$/);
    if (m) {
      const [, key, id] = m;
      if (value == null) target[key] = (target[key] || []).filter((x) => x.id !== id);
      else {
        const list = (target[key] || []).slice();
        const idx = list.findIndex((x) => x.id === id);
        if (idx >= 0) list[idx] = value;
        else list.push(value);
        target[key] = list;
      }
      return;
    }
    const c = path.match(/^(servicosPatch|produtosPatch)\/(.+)$/);
    if (c) {
      const catalogKey = c[1] === "servicosPatch" ? "servicos" : "produtos";
      const id = c[2];
      if (value && value._deleted) {
        target[catalogKey] = (target[catalogKey] || []).filter((x) => x.id !== id);
      } else if (value) {
        const seedMap = listToMap(seedFor(catalogKey));
        const list = (target[catalogKey] || []).slice();
        const idx = list.findIndex((x) => x.id === id);
        const merged = { ...(seedMap[id] || {}), ...(idx >= 0 ? list[idx] : {}), ...value, id };
        if (idx >= 0) list[idx] = merged;
        else list.push(merged);
        target[catalogKey] = list;
      }
    }
  }

  function bindChildList(key) {
    const ref = FirebaseApp.ref(`${ROOT}/${key}`);
    if (!ref) return;

    const onAdd = ref.on("child_added", (snap) => {
      if (applyingRemote) return;
      upsertListItem(key, snap.val());
    });
    const onChange = ref.on("child_changed", (snap) => {
      upsertListItem(key, snap.val());
    });
    const onRemove = ref.on("child_removed", (snap) => {
      removeListItem(key, snap.key);
    });

    listeners.push(() => {
      ref.off("child_added", onAdd);
      ref.off("child_changed", onChange);
      ref.off("child_removed", onRemove);
    });
  }

  function bindCatalogPatches(catalogKey) {
    const patchKey = catalogKey === "servicos" ? "servicosPatch" : "produtosPatch";
    const ref = FirebaseApp.ref(`${ROOT}/${patchKey}`);
    if (!ref) return;

    const handler = (snap) => upsertCatalogPatch(catalogKey, snap.val());
    const onAdd = ref.on("child_added", handler);
    const onChange = ref.on("child_changed", handler);
    const onRemove = ref.on("child_removed", (snap) => {
      // remoção do patch: volta ao seed se existir
      const id = snap.key;
      const pending = DataCache.getPending()[`${patchKey}/${id}`];
      if (pending) return;
      const seedMap = listToMap(seedFor(catalogKey));
      applyingRemote = true;
      if (seedMap[id]) {
        const list = (state[catalogKey] || []).slice();
        const idx = list.findIndex((x) => x.id === id);
        if (idx >= 0) list[idx] = { ...seedMap[id], updatedAt: 0 };
        else list.push({ ...seedMap[id], updatedAt: 0 });
        state = { ...state, [catalogKey]: list };
      } else {
        state = { ...state, [catalogKey]: (state[catalogKey] || []).filter((x) => x.id !== id) };
      }
      persistCache();
      applyingRemote = false;
      emit();
    });

    listeners.push(() => {
      ref.off("child_added", onAdd);
      ref.off("child_changed", onChange);
      ref.off("child_removed", onRemove);
    });
  }

  function bindEmpresa() {
    const ref = FirebaseApp.ref(`${ROOT}/empresa`);
    if (!ref) return;
    const cb = ref.on("value", (snap) => applyEmpresaRemote(snap.val()));
    listeners.push(() => ref.off("value", cb));
  }

  function bindMeta() {
    const ref = FirebaseApp.ref(`${ROOT}/meta`);
    if (!ref) return;
    const cb = ref.on("value", (snap) => applyMetaRemote(snap.val()));
    listeners.push(() => ref.off("value", cb));
  }

  function set(next) {
    if (applyingRemote) {
      state = typeof next === "function" ? next(state) : next;
      persistCache();
      emit();
      return state;
    }

    const prev = state;
    let incoming = typeof next === "function" ? next(state) : next;
    incoming = stampDiff(prev, incoming);
    enqueueFromDiff(prev, incoming);
    state = stripInternal(incoming);
    persistCache();
    emit();
    scheduleFlush();
    return state;
  }

  function update(partial) {
    return set({ ...state, ...partial });
  }

  function reset() {
    const prev = state;
    const next = stampDiff(prev, defaultState());
    enqueueFromDiff(prev, next);
    // força reenvio de listas (reset completo)
    USER_LIST_KEYS.forEach((key) => {
      listToMap(prev[key]).forEach((_, id) => {
        if (!listToMap(next[key])[id]) DataCache.queuePatch(`${key}/${id}`, null);
      });
    });
    state = stripInternal(next);
    persistCache();
    emit();
    scheduleFlush();
    return state;
  }

  function refreshCatalog() {
    return update({
      servicos: SEED_SERVICOS.map((s) => ({ ...s, updatedAt: now(), deviceId: DEVICE_ID })),
      produtos: SEED_PRODUTOS.map((p) => ({ ...p, updatedAt: now(), deviceId: DEVICE_ID })),
      catalogVersion: 3
    });
  }

  async function initCloud() {
    const hydrated = await DataCache.hydrate(migrateFromOld() || defaultState());
    DEVICE_ID = hydrated.deviceId;
    state = hydrated.state || defaultState();

    if ((state.catalogVersion || 0) < 3) {
      state = {
        ...state,
        servicos: SEED_SERVICOS.map((s) => ({ ...s, updatedAt: 0 })),
        produtos: SEED_PRODUTOS.map((p) => ({ ...p, updatedAt: 0 })),
        catalogVersion: 3
      };
      persistCache();
    }

    emit();

    FirebaseApp.init();
    if (!FirebaseApp.isReady()) {
      setStatus("offline");
      return state;
    }

    const root = FirebaseApp.ref(ROOT);
    if (!root) {
      setStatus("error");
      return state;
    }

    setStatus("syncing");

    try {
      const snap = await root.once("value");
      const remote = snap.val();

      if (!remote) {
        // Primeira carga: envia estado local por paths (sem catálogo completo)
        USER_LIST_KEYS.forEach((key) => {
          (state[key] || []).forEach((item) => {
            DataCache.queuePatch(`${key}/${item.id}`, slimItem(stamp(item)));
          });
        });
        DataCache.queuePatch("empresa", slimItem(stamp(state.empresa || {})));
        DataCache.queuePatch("meta/precoModo", state.precoModo || "medio");
        DataCache.queuePatch("meta/precoModoTs", now());
        DataCache.queuePatch("meta/precoModoDevice", DEVICE_ID || "unknown");
        DataCache.queuePatch("meta/version", state.version ?? 2);
        DataCache.queuePatch("meta/catalogVersion", state.catalogVersion ?? 3);
      } else {
        applyingRemote = true;
        state = mergeInitialRemote(remote);
        persistCache();
        applyingRemote = false;
        emit();
      }

      listeners.forEach((off) => off());
      listeners = [];
      USER_LIST_KEYS.forEach(bindChildList);
      CATALOG_KEYS.forEach(bindCatalogPatches);
      bindEmpresa();
      bindMeta();

      cloudReady = true;
      await flushPending();
      setStatus(Object.keys(DataCache.getPending()).length ? "syncing" : "online");
    } catch (err) {
      console.error("Firebase load:", err);
      setStatus("offline");
      // tenta flush depois se voltar
      cloudReady = FirebaseApp.isReady();
      scheduleFlush();
    }

    window.addEventListener("online", () => {
      setStatus("syncing");
      flushPending();
    });

    return state;
  }

  return {
    get,
    set,
    update,
    reset,
    refreshCatalog,
    initCloud,
    getStatus
  };
})();
