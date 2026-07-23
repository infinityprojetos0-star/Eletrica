/**
 * Store VoltES — sync otimizado para Firebase Spark (grátis)
 *
 * Estratégia:
 * - Catálogo base (SEED) fica no código / localStorage (não sobe o catálogo inteiro)
 * - Nuvem guarda só dados do usuário + patches de preço/itens alterados
 * - Escrita por diff (update em paths) em vez de set() da árvore inteira
 * - Sem listener na raiz (evita re-download gigante a cada save)
 * - Listener leve só em meta/rev para sync entre abas/dispositivos
 * - Debounce longo + goOffline com aba oculta
 */
const Store = (() => {
  const KEY = "voltes-data-v2";
  const OLD_KEYS = ["voltes-data-v1"];
  const ROOT = "voltes";
  const DEBOUNCE_MS = 1500;

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
    empresa: { ...SEED_EMPRESA },
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
        criadoEm: todayISO()
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
        criadoEm: todayISO()
      }
    ],
    servicos: SEED_SERVICOS.map((s) => ({ ...s })),
    produtos: SEED_PRODUTOS.map((p) => ({ ...p })),
    orcamentos: [],
    contratos: [],
    lancamentos: [],
    despesasFixas: [
      { id: "df-1", nome: "Internet", categoria: "Internet", valor: 99.9 },
      { id: "df-2", nome: "Combustível", categoria: "Transporte", valor: 280 },
      { id: "df-3", nome: "Consumíveis / ferramentas", categoria: "Material", valor: 60 }
    ]
  });

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

  function slimItem(item) {
    if (!item || typeof item !== "object") return item;
    const out = {};
    Object.keys(item).forEach((k) => {
      const v = item[k];
      if (v == null) return;
      // Nunca enviar base64/data-URI (estoura banda/storage do plano free)
      if (typeof v === "string" && v.startsWith("data:")) return;
      if (typeof v === "string" && v.length > 4000) return;
      out[k] = v;
    });
    return out;
  }

  function seedFor(key) {
    return key === "servicos" ? SEED_SERVICOS : SEED_PRODUTOS;
  }

  /** Só o que difere do catálogo seed (ou itens novos / removidos) */
  function buildCatalogPatch(items, seed) {
    const seedMap = listToMap(seed);
    const itemMap = listToMap(items);
    const patch = {};

    Object.values(itemMap).forEach((item) => {
      const base = seedMap[item.id];
      if (!base) {
        patch[item.id] = slimItem(item);
        return;
      }
      const diff = { id: item.id };
      let changed = false;
      CATALOG_FIELDS.forEach((f) => {
        if (item[f] !== undefined && !same(item[f], base[f])) {
          diff[f] = item[f];
          changed = true;
        }
      });
      if (changed) patch[item.id] = slimItem(diff);
    });

    Object.keys(seedMap).forEach((id) => {
      if (!itemMap[id]) patch[id] = { id, _deleted: true };
    });

    return patch;
  }

  function applyCatalogPatch(seed, patchMap) {
    const patch = patchMap || {};
    const deleted = new Set();
    Object.values(patch).forEach((p) => {
      if (p && p._deleted) deleted.add(p.id);
    });

    const map = {};
    seed.forEach((s) => {
      if (!deleted.has(s.id)) map[s.id] = { ...s };
    });

    Object.entries(patch).forEach(([id, val]) => {
      if (!val || val._deleted) return;
      map[id] = map[id] ? { ...map[id], ...val, id } : { ...val, id };
    });

    return Object.values(map);
  }

  function migrateLegacyCatalog(raw) {
    // Formato antigo: catálogo completo em servicos/produtos — usa 1x e depois só patches
    const next = { ...raw };
    if (raw.servicos && !raw.servicosPatch) {
      const list = mapToList(raw.servicos);
      next.servicosPatch = buildCatalogPatch(list, SEED_SERVICOS);
    }
    if (raw.produtos && !raw.produtosPatch) {
      const list = mapToList(raw.produtos);
      next.produtosPatch = buildCatalogPatch(list, SEED_PRODUTOS);
    }
    return next;
  }

  function remoteToState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;

    const data = migrateLegacyCatalog(raw);
    const meta = data.meta || {};

    const next = {
      ...base,
      version: meta.version ?? data.version ?? base.version,
      catalogVersion: meta.catalogVersion ?? data.catalogVersion ?? base.catalogVersion,
      precoModo: meta.precoModo || data.precoModo || base.precoModo,
      empresa: { ...base.empresa, ...(data.empresa || {}) }
    };

    USER_LIST_KEYS.forEach((key) => {
      if (data[key] != null) next[key] = mapToList(data[key]).map(slimItem);
    });

    next.servicos = applyCatalogPatch(SEED_SERVICOS, data.servicosPatch || {});
    next.produtos = applyCatalogPatch(SEED_PRODUTOS, data.produtosPatch || {});

    // Legacy full lists (se ainda existirem e patch vazio)
    if ((!data.servicosPatch || !Object.keys(data.servicosPatch).length) && data.servicos) {
      next.servicos = mapToList(data.servicos);
    }
    if ((!data.produtosPatch || !Object.keys(data.produtosPatch).length) && data.produtos) {
      next.produtos = mapToList(data.produtos);
    }

    if ((next.catalogVersion || 0) < 3) {
      next.servicos = applyCatalogPatch(SEED_SERVICOS, data.servicosPatch || {});
      next.produtos = applyCatalogPatch(SEED_PRODUTOS, data.produtosPatch || {});
      next.catalogVersion = 3;
    }

    return next;
  }

  function listDiffPaths(path, prevList, nextList) {
    const prev = listToMap(prevList);
    const next = listToMap(nextList);
    const updates = {};

    Object.keys(next).forEach((id) => {
      const slim = slimItem(next[id]);
      if (!same(prev[id], slim)) updates[`${path}/${id}`] = slim;
    });
    Object.keys(prev).forEach((id) => {
      if (!next[id]) updates[`${path}/${id}`] = null;
    });
    return updates;
  }

  function patchDiffPaths(path, prevPatch, nextPatch) {
    const prev = prevPatch || {};
    const next = nextPatch || {};
    const updates = {};
    const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
    ids.forEach((id) => {
      if (!same(prev[id], next[id])) {
        updates[`${path}/${id}`] = next[id] == null ? null : next[id];
      }
    });
    return updates;
  }

  function buildCloudUpdates(prevState, nextState) {
    const updates = {};
    const prev = prevState || {};

    if (!same(prev.empresa, nextState.empresa)) {
      updates.empresa = nextState.empresa || {};
    }

    USER_LIST_KEYS.forEach((key) => {
      Object.assign(updates, listDiffPaths(key, prev[key], nextState[key]));
    });

    CATALOG_KEYS.forEach((key) => {
      const patchKey = key === "servicos" ? "servicosPatch" : "produtosPatch";
      const prevPatch = buildCatalogPatch(prev[key] || seedFor(key), seedFor(key));
      const nextPatch = buildCatalogPatch(nextState[key], seedFor(key));
      Object.assign(updates, patchDiffPaths(patchKey, prevPatch, nextPatch));
    });

    const meta = {
      version: nextState.version,
      catalogVersion: nextState.catalogVersion,
      precoModo: nextState.precoModo,
      updatedAt: new Date().toISOString()
    };

    const prevMeta = {
      version: prev.version,
      catalogVersion: prev.catalogVersion,
      precoModo: prev.precoModo
    };

    if (!same(prevMeta, { version: meta.version, catalogVersion: meta.catalogVersion, precoModo: meta.precoModo })) {
      updates["meta/version"] = meta.version;
      updates["meta/catalogVersion"] = meta.catalogVersion;
      updates["meta/precoModo"] = meta.precoModo;
    }
    updates["meta/updatedAt"] = meta.updatedAt;

    return updates;
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
        next.servicos = SEED_SERVICOS.map((s) => ({ ...s }));
        next.produtos = SEED_PRODUTOS.map((p) => ({ ...p }));
        localStorage.removeItem(k);
        return next;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const migrated = migrateFromOld();
        return migrated || defaultState();
      }
      const parsed = JSON.parse(raw);
      if ((parsed.catalogVersion || 0) < 3) {
        parsed.servicos = SEED_SERVICOS.map((s) => ({ ...s }));
        parsed.produtos = SEED_PRODUTOS.map((p) => ({ ...p }));
        parsed.catalogVersion = 3;
      }
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function saveLocal(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  let state = loadLocal();
  let cloudMirror = null; // último estado conhecido na nuvem (para diff)
  let cloudStatus = "local";
  let localWrite = false;
  let unsubscribe = null;
  let writeTimer = null;
  let lastRev = null;
  let pulling = false;

  function emit() {
    window.dispatchEvent(
      new CustomEvent("voltes:store", {
        detail: { status: cloudStatus, state }
      })
    );
  }

  function setStatus(status) {
    cloudStatus = status;
    emit();
  }

  function get() {
    return state;
  }

  function getStatus() {
    return cloudStatus;
  }

  function applyRemoteState(remoteState) {
    state = remoteState;
    cloudMirror = clone(remoteState);
    saveLocal(state);
    setStatus("online");
    emit();
  }

  async function pullAll() {
    const root = FirebaseApp.ref(ROOT);
    if (!root) return null;
    const snap = await root.once("value");
    return snap.val();
  }

  async function persistCloud(data) {
    if (!FirebaseApp.isReady()) return;
    const root = FirebaseApp.ref(ROOT);
    if (!root) return;

    const updates = buildCloudUpdates(cloudMirror || {}, data);
    // Sempre que há write de conteúdo, bump rev (exceto se só updatedAt)
    const contentKeys = Object.keys(updates).filter((k) => k !== "meta/updatedAt");
    if (!contentKeys.length) return;

    const rev = Date.now();
    updates["meta/rev"] = rev;
    lastRev = rev;
    localWrite = true;
    setStatus("syncing");

    try {
      await root.update(updates);
      cloudMirror = clone(data);
      setStatus("online");
    } catch (err) {
      console.error("Firebase save:", err);
      setStatus("error");
    } finally {
      setTimeout(() => {
        localWrite = false;
      }, 400);
    }
  }

  function scheduleCloudSave(data) {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => persistCloud(data), DEBOUNCE_MS);
  }

  function set(next) {
    state = typeof next === "function" ? next(state) : next;
    saveLocal(state);
    scheduleCloudSave(state);
    emit();
    return state;
  }

  function update(partial) {
    return set({ ...state, ...partial });
  }

  function reset() {
    state = defaultState();
    saveLocal(state);
    scheduleCloudSave(state);
    emit();
    return state;
  }

  function refreshCatalog() {
    return update({
      servicos: SEED_SERVICOS.map((s) => ({ ...s })),
      produtos: SEED_PRODUTOS.map((p) => ({ ...p })),
      catalogVersion: 3
    });
  }

  async function bootstrapEmpty(root) {
    const seed = clone(state);
    const updates = buildCloudUpdates({}, seed);
    const rev = Date.now();
    updates["meta/rev"] = rev;
    updates["meta/version"] = seed.version;
    updates["meta/catalogVersion"] = seed.catalogVersion;
    updates["meta/precoModo"] = seed.precoModo;
    updates["meta/updatedAt"] = new Date().toISOString();
    // Remove legado pesado se alguém já tiver criado
    updates.servicos = null;
    updates.produtos = null;
    lastRev = rev;
    localWrite = true;
    await root.update(updates);
    cloudMirror = seed;
    localWrite = false;
  }

  async function initCloud() {
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
      const remote = await pullAll();

      if (!remote) {
        await bootstrapEmpty(root);
        setStatus("online");
      } else {
        // Limpa catálogo legado completo (1x) para economizar storage
        if (remote.servicos || remote.produtos) {
          const cleanup = {};
          if (remote.servicos) cleanup.servicos = null;
          if (remote.produtos) cleanup.produtos = null;
          if (!remote.servicosPatch && remote.servicos) {
            cleanup.servicosPatch = buildCatalogPatch(mapToList(remote.servicos), SEED_SERVICOS);
          }
          if (!remote.produtosPatch && remote.produtos) {
            cleanup.produtosPatch = buildCatalogPatch(mapToList(remote.produtos), SEED_PRODUTOS);
          }
          if (Object.keys(cleanup).length) {
            await root.update(cleanup);
            Object.assign(remote, cleanup);
            if (cleanup.servicos === null) delete remote.servicos;
            if (cleanup.produtos === null) delete remote.produtos;
          }
        }

        const remoteState = remoteToState(remote);
        lastRev = remote.meta?.rev || null;
        applyRemoteState(remoteState);
      }

      if (unsubscribe) unsubscribe();
      const metaRef = root.child("meta/rev");
      const onRev = metaRef.on(
        "value",
        async (snap) => {
          const rev = snap.val();
          if (rev == null) return;
          if (rev === lastRev) return;
          if (localWrite) {
            lastRev = rev;
            return;
          }
          if (pulling) return;
          pulling = true;
          lastRev = rev;
          try {
            setStatus("syncing");
            const fresh = await pullAll();
            if (fresh) applyRemoteState(remoteToState(fresh));
            else setStatus("online");
          } catch (err) {
            console.error("Firebase pull:", err);
            setStatus("error");
          } finally {
            pulling = false;
          }
        },
        (err) => {
          console.error("Firebase meta listener:", err);
          setStatus("error");
        }
      );
      unsubscribe = () => metaRef.off("value", onRev);
    } catch (err) {
      console.error("Firebase load:", err);
      setStatus("offline");
    }

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
