const Store = (() => {
  const KEY = "voltes-data-v2";
  const OLD_KEYS = ["voltes-data-v1"];
  const ROOT = "voltes";

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

  const LIST_KEYS = [
    "clientes",
    "servicos",
    "produtos",
    "orcamentos",
    "contratos",
    "lancamentos",
    "despesasFixas"
  ];

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

  function stateToFirebase(data) {
    const payload = {
      version: data.version,
      catalogVersion: data.catalogVersion,
      precoModo: data.precoModo,
      empresa: data.empresa || {},
      updatedAt: new Date().toISOString()
    };
    LIST_KEYS.forEach((key) => {
      payload[key] = listToMap(data[key]);
    });
    return payload;
  }

  function firebaseToState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;

    const next = {
      ...base,
      version: raw.version ?? base.version,
      catalogVersion: raw.catalogVersion ?? base.catalogVersion,
      precoModo: raw.precoModo || base.precoModo,
      empresa: { ...base.empresa, ...(raw.empresa || {}) }
    };

    LIST_KEYS.forEach((key) => {
      if (raw[key] != null) next[key] = mapToList(raw[key]);
      else next[key] = base[key];
    });

    if ((next.catalogVersion || 0) < 3) {
      next.servicos = SEED_SERVICOS.map((s) => ({ ...s }));
      next.produtos = SEED_PRODUTOS.map((p) => ({ ...p }));
      next.catalogVersion = 3;
    }

    return next;
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
  let syncing = false;
  let cloudStatus = "local"; // local | syncing | online | offline | error
  let unsubscribe = null;
  let writeTimer = null;

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

  function persistCloud(data) {
    if (!FirebaseApp.isReady()) return;
    const root = FirebaseApp.ref(ROOT);
    if (!root) return;
    setStatus("syncing");
    root
      .set(stateToFirebase(data))
      .then(() => setStatus("online"))
      .catch((err) => {
        console.error("Firebase save:", err);
        setStatus("error");
      });
  }

  function scheduleCloudSave(data) {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => persistCloud(data), 350);
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
      const snap = await root.once("value");
      const remote = snap.val();

      if (!remote) {
        await root.set(stateToFirebase(state));
        setStatus("online");
      } else {
        syncing = true;
        state = firebaseToState(remote);
        saveLocal(state);
        syncing = false;
        setStatus("online");
      }

      if (unsubscribe) unsubscribe();
      const listener = root.on(
        "value",
        (s) => {
          if (syncing) return;
          const val = s.val();
          if (!val) return;
          const incoming = firebaseToState(val);
          const same = JSON.stringify(incoming) === JSON.stringify(state);
          if (same) {
            setStatus("online");
            return;
          }
          state = incoming;
          saveLocal(state);
          setStatus("online");
          emit();
        },
        (err) => {
          console.error("Firebase listener:", err);
          setStatus("error");
        }
      );
      unsubscribe = () => root.off("value", listener);
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
