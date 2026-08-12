figma.showUI(__html__, {
  width: 620,
  height: 780,
  title: "Consolidar Duplicados",
});

// --- Lista de campos selecionáveis (cada um corresponde a uma propriedade do nó Figma) ---
// "type" é sempre comparado e não aparece como opção na UI.
var ALL_FIELDS = [
  { key: "name",                    label: "Nome (name)" },
  { key: "visible",                 label: "Visibilidade (visible)" },
  { key: "width",                   label: "Largura (width)" },
  { key: "height",                  label: "Altura (height)" },
  { key: "rotation",                label: "Rotação (rotation)" },
  { key: "layoutMode",              label: "Layout Mode" },
  { key: "layoutWrap",              label: "Layout Wrap" },
  { key: "primaryAxisAlignItems",   label: "Alinhamento eixo principal" },
  { key: "counterAxisAlignItems",   label: "Alinhamento eixo cruzado" },
  { key: "itemSpacing",             label: "Espaçamento (itemSpacing)" },
  { key: "counterAxisSpacing",      label: "Espaçamento eixo cruzado" },
  { key: "paddingTop",              label: "Padding Top" },
  { key: "paddingRight",            label: "Padding Right" },
  { key: "paddingBottom",           label: "Padding Bottom" },
  { key: "paddingLeft",             label: "Padding Left" },
  { key: "clipsContent",            label: "Clips Content" },
  { key: "opacity",                 label: "Opacidade (opacity)" },
  { key: "characters",              label: "Texto (characters)" },
  { key: "componentPropertyDefinitions", label: "Propriedades do componente" },
];

var ALL_FIELD_KEYS = ALL_FIELDS.map(function (f) { return f.key; });

// Critérios da última análise (para validar antes de simular/aplicar).
var lastAnalysisCriteriaKey = null;

// Envia a definição dos campos para a UI ao abrir o plugin.
figma.ui.postMessage({ type: "field-definitions", fields: ALL_FIELDS });

// --- Utilitários de critérios ---

function normalizeSelectedFields(input) {
  var result = {};
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    result[ALL_FIELD_KEYS[i]] = !!(input && input[ALL_FIELD_KEYS[i]]);
  }
  return result;
}

function selectedFieldsKey(sel) {
  return ALL_FIELD_KEYS.map(function (k) { return k + "=" + sel[k]; }).join("|");
}

function hasAnyField(sel) {
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    if (sel[ALL_FIELD_KEYS[i]]) return true;
  }
  return false;
}

function activeFieldsLabel(sel) {
  var active = [];
  for (var i = 0; i < ALL_FIELDS.length; i++) {
    if (sel[ALL_FIELDS[i].key]) active.push(ALL_FIELDS[i].label);
  }
  return active.join(", ");
}

// --- Traversal ---

function getAllNodes(root, predicate) {
  var result = [];

  function walk(node) {
    try {
      if (predicate(node)) result.push(node);

      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          walk(node.children[i]);
        }
      }
    } catch (e) {
      figma.ui.postMessage({
        type: "log",
        text: "Nó inacessível ignorado: " + e.message,
      });
    }
  }

  walk(root);
  return result;
}

// --- Assinatura de propriedades (parametrizada por selectedFields) ---

function val(v) {
  return v === undefined || v === null ? "" : String(v);
}

function propertiesSignature(node, sel) {
  // "type" é sempre incluído.
  var parts = ["type=" + val(node.type)];

  // Campos simples do var fields original.
  var simpleFields = [
    "name", "visible", "width", "height", "rotation",
    "layoutMode", "layoutWrap",
    "primaryAxisAlignItems", "counterAxisAlignItems",
    "itemSpacing", "counterAxisSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "clipsContent", "opacity",
  ];

  for (var i = 0; i < simpleFields.length; i++) {
    if (!sel[simpleFields[i]]) continue;
    try {
      parts.push(simpleFields[i] + "=" + val(node[simpleFields[i]]));
    } catch (e) {
      parts.push(simpleFields[i] + "=");
    }
  }

  // Campo especial: characters (só para nós TEXT).
  if (sel.characters) {
    try {
      if (node.type === "TEXT") {
        parts.push("characters=" + val(node.characters));
      }
    } catch (e) {}
  }

  // Campo especial: componentPropertyDefinitions.
  if (sel.componentPropertyDefinitions) {
    try {
      if (node.componentPropertyDefinitions) {
        parts.push(
          "properties=" +
            Object.keys(node.componentPropertyDefinitions).sort().join(",")
        );
      }
    } catch (e) {}
  }

  return parts.join(";");
}

// --- Assinatura estrutural (recursiva) ---

function structuralSignature(node, sel) {
  var children = [];

  try {
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        children.push(structuralSignature(node.children[i], sel));
      }
    }
  } catch (e) {
    children.push("<inacessível>");
  }

  return "[" + propertiesSignature(node, sel) + "{" + children.join("|") + "}]";
}

// --- Chave de agrupamento de ComponentSets ---

function setKey(componentSet, sel) {
  var variants = [];

  for (var i = 0; i < componentSet.children.length; i++) {
    variants.push(
      componentSet.children[i].name +
        "::" +
        structuralSignature(componentSet.children[i], sel)
    );
  }

  variants.sort();
  return componentSet.name + "||" + variants.join("|");
}

// --- Helpers de navegação ---

function pageName(node) {
  var current = node;

  while (current && current.type !== "PAGE") {
    current = current.parent;
  }

  return current ? current.name : "Página desconhecida";
}

function nodePath(node) {
  var names = [];
  var current = node;

  while (current && current.type !== "DOCUMENT") {
    names.unshift(current.name);
    current = current.parent;
  }

  return names.join(" / ");
}

// --- Agrupamento de duplicados ---

function duplicateGroups(index) {
  var groups = [];
  var keys = Object.keys(index);

  for (var i = 0; i < keys.length; i++) {
    if (index[keys[i]].length > 1) {
      groups.push(index[keys[i]]);
    }
  }

  return groups;
}

// --- Análise do documento ---

function analyzeDocument(sel) {
  var setsByKey = {};
  var looseByKey = {};

  var sets = getAllNodes(figma.root, function (n) {
    return n.type === "COMPONENT_SET";
  });

  for (var i = 0; i < sets.length; i++) {
    var setIdentity = setKey(sets[i], sel);

    if (!setsByKey[setIdentity]) {
      setsByKey[setIdentity] = [];
    }

    setsByKey[setIdentity].push(sets[i]);
  }

  var components = getAllNodes(figma.root, function (n) {
    return n.type === "COMPONENT";
  });

  for (var j = 0; j < components.length; j++) {
    var component = components[j];

    if (
      component.parent &&
      component.parent.type !== "COMPONENT_SET"
    ) {
      var identity =
        component.name + "||" + structuralSignature(component, sel);

      if (!looseByKey[identity]) {
        looseByKey[identity] = [];
      }

      looseByKey[identity].push(component);
    }
  }

  return {
    dupSets: duplicateGroups(setsByKey),
    dupLoose: duplicateGroups(looseByKey),
  };
}

// --- Índices ---

function componentNodeIndex() {
  var index = {};
  var nodes = getAllNodes(figma.root, function (n) {
    return n.type === "COMPONENT" || n.type === "COMPONENT_SET";
  });

  for (var i = 0; i < nodes.length; i++) {
    index[nodes[i].id] = nodes[i];
  }

  return index;
}

function instancesByMainComponent() {
  var index = {};
  var instances = figma.root.findAll(function (n) {
    return n.type === "INSTANCE";
  });

  for (var i = 0; i < instances.length; i++) {
    try {
      var main = instances[i].mainComponent;

      if (main) {
        if (!index[main.id]) {
          index[main.id] = [];
        }

        index[main.id].push(instances[i]);
      }
    } catch (e) {
      // Instância sem componente principal acessível.
    }
  }

  return {
    index: index,
    count: instances.length,
  };
}

// --- Comparadores ---

function sameSet(source, canonical, sel) {
  return (
    source &&
    canonical &&
    source.type === "COMPONENT_SET" &&
    canonical.type === "COMPONENT_SET" &&
    setKey(source, sel) === setKey(canonical, sel)
  );
}

function sameLoose(source, canonical, sel) {
  return (
    source &&
    canonical &&
    source.type === "COMPONENT" &&
    canonical.type === "COMPONENT" &&
    source.parent.type !== "COMPONENT_SET" &&
    canonical.parent.type !== "COMPONENT_SET" &&
    source.name === canonical.name &&
    structuralSignature(source, sel) === structuralSignature(canonical, sel)
  );
}

// --- Redirecionamento de instâncias ---

function redirect(instances, target, dryRun, log) {
  var result = { redirected: 0, failed: 0 };

  for (var i = 0; i < instances.length; i++) {
    if (dryRun) {
      result.redirected++;
      continue;
    }

    try {
      instances[i].swapComponent(target);
      result.redirected++;
    } catch (e) {
      result.failed++;
      log(
        "    ERRO ao trocar instância " +
          instances[i].id +
          ": " +
          e.message
      );
    }
  }

  return result;
}

// --- Consolidação ---

function consolidate(dryRun, plans, rawSelectedFields) {
  var sel = normalizeSelectedFields(rawSelectedFields);

  var log = function (text) {
    figma.ui.postMessage({ type: "log", text: text });
  };

  if (!hasAnyField(sel)) {
    figma.ui.postMessage({ type: "error", text: "Selecione ao menos uma propriedade antes de executar." });
    figma.ui.postMessage({ type: "done", dryRun: dryRun, removed: 0, redirected: 0, skipped: 0, protected: 0, invalidPlan: true });
    return;
  }

  if (lastAnalysisCriteriaKey !== selectedFieldsKey(sel)) {
    figma.ui.postMessage({ type: "error", text: "As propriedades selecionadas foram alteradas. Analise novamente antes de executar." });
    figma.ui.postMessage({ type: "done", dryRun: dryRun, removed: 0, redirected: 0, skipped: 0, protected: 0, invalidPlan: true });
    return;
  }

  var totals = {
    removed: 0,
    redirected: 0,
    skipped: 0,
    protected: 0,
  };

  if (!plans || !plans.length) {
    figma.ui.postMessage({
      type: "done",
      dryRun: dryRun,
      removed: 0,
      redirected: 0,
      skipped: 0,
      protected: 0,
    });
    return;
  }

  log("Critérios usados: " + activeFieldsLabel(sel));
  log(
    "Iniciando " +
      (dryRun ? "simulação" : "aplicação") +
      " de " +
      plans.length +
      " grupo(s)..."
  );

  var instances = instancesByMainComponent();
  var nodeById = componentNodeIndex();

  log("Instâncias mapeadas: " + instances.count);

  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    var canonical = nodeById[plan.canonicalId];
    var duplicates = plan.duplicateIds || [];
    var valid = !!canonical && duplicates.length > 0;

    for (var v = 0; v < duplicates.length; v++) {
      valid =
        valid &&
        (plan.type === "set"
          ? sameSet(nodeById[duplicates[v]], canonical, sel)
          : sameLoose(nodeById[duplicates[v]], canonical, sel));
    }

    if (!valid) {
      totals.protected++;
      log(
        "Grupo protegido: a análise está desatualizada ou uma cópia não é compatível."
      );
      continue;
    }

    if (plan.type === "set") {
      var targets = {};

      for (var c = 0; c < canonical.children.length; c++) {
        targets[canonical.children[c].name] = canonical.children[c];
      }

      log('SET "' + canonical.name + '": mantendo a cópia escolhida.');

      for (var d = 0; d < duplicates.length; d++) {
        var duplicateSet = nodeById[duplicates[d]];
        var canRemove = true;

        for (var sv = 0; sv < duplicateSet.children.length; sv++) {
          var sourceVariant = duplicateSet.children[sv];
          var target = targets[sourceVariant.name];

          if (!target) {
            canRemove = false;
            totals.skipped += (
              instances.index[sourceVariant.id] || []
            ).length;

            log(
              '    Protegido: variante sem correspondente ("' +
                sourceVariant.name +
                '").'
            );
            continue;
          }

          var swap = redirect(
            instances.index[sourceVariant.id] || [],
            target,
            dryRun,
            log
          );

          totals.redirected += swap.redirected;
          totals.skipped += swap.failed;

          if (swap.failed) {
            canRemove = false;
          }
        }

        if (!canRemove) {
          totals.protected++;
          log(
            "    Set mantido: existem instâncias que não puderam ser redirecionadas."
          );
        } else if (dryRun) {
          totals.removed++;
        } else {
          try {
            duplicateSet.remove();
            totals.removed++;
          } catch (e) {
            totals.protected++;
            log("    ERRO ao remover set: " + e.message);
          }
        }
      }
    } else {
      log('COMP "' + canonical.name + '": mantendo a cópia escolhida.');

      for (var l = 0; l < duplicates.length; l++) {
        var duplicate = nodeById[duplicates[l]];
        var looseSwap = redirect(
          instances.index[duplicate.id] || [],
          canonical,
          dryRun,
          log
        );

        totals.redirected += looseSwap.redirected;
        totals.skipped += looseSwap.failed;

        if (looseSwap.failed) {
          totals.protected++;
          log(
            "    Componente mantido: existem instâncias que não puderam ser redirecionadas."
          );
        } else if (dryRun) {
          totals.removed++;
        } else {
          try {
            duplicate.remove();
            totals.removed++;
          } catch (e) {
            totals.protected++;
            log("    ERRO ao remover componente: " + e.message);
          }
        }
      }
    }
  }

  if (!dryRun && totals.removed > 0) {
    figma.notify(
      "Consolidação concluída. Revise o resultado antes de compartilhar."
    );
  }

  figma.ui.postMessage({
    type: "done",
    dryRun: dryRun,
    removed: totals.removed,
    redirected: totals.redirected,
    skipped: totals.skipped,
    protected: totals.protected,
  });
}

// --- Resumo de grupos para a UI ---

function groupSummary(groups, type) {
  var summary = [];

  for (var i = 0; i < groups.length; i++) {
    var candidates = [];

    for (var j = 0; j < groups[i].length; j++) {
      candidates.push({
        id: groups[i][j].id,
        page: pageName(groups[i][j]),
        path: nodePath(groups[i][j]),
      });
    }

    summary.push({
      id: type + "-" + i,
      type: type,
      name: groups[i][0].name,
      candidates: candidates,
    });
  }

  return summary;
}

// --- Handler de mensagens da UI ---

figma.ui.onmessage = function (msg) {
  try {
    if (msg.type === "analyze") {
      var sel = normalizeSelectedFields(msg.selectedFields);

      if (!hasAnyField(sel)) {
        figma.ui.postMessage({
          type: "error",
          text: "Selecione ao menos uma propriedade para analisar.",
        });
        return;
      }

      lastAnalysisCriteriaKey = selectedFieldsKey(sel);

      figma.ui.postMessage({
        type: "log",
        text: "Analisando documento. Propriedades: " + activeFieldsLabel(sel),
      });

      var data = analyzeDocument(sel);

      figma.ui.postMessage({
        type: "analysis",
        data: {
          sets: groupSummary(data.dupSets, "set"),
          loose: groupSummary(data.dupLoose, "loose"),
        },
      });
    }

    if (msg.type === "simulate") {
      consolidate(true, msg.plans, msg.selectedFields);
    }

    if (msg.type === "apply") {
      consolidate(false, msg.plans, msg.selectedFields);
    }

    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (e) {
    figma.ui.postMessage({
      type: "error",
      text: "ERRO GLOBAL: " + e.message,
    });

    figma.notify("Erro: " + e.message);
  }
};