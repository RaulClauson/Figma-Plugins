//todo: ignorar elemntos de texto

figma.showUI(__html__, {
  width: 640,
  height: 860,
  title: "Organizar Componentes — Duplicatas e Similares",
});

var ALL_FIELDS = [
  { key: "name", label: "Nome (name)" },
  { key: "visible", label: "Visibilidade (visible)" },
  { key: "width", label: "Largura (width)" },
  { key: "height", label: "Altura (height)" },
  { key: "rotation", label: "Rotação (rotation)" },
  { key: "layoutMode", label: "Layout Mode" },
  { key: "layoutWrap", label: "Layout Wrap" },
  { key: "primaryAxisAlignItems", label: "Alinhamento eixo principal" },
  { key: "counterAxisAlignItems", label: "Alinhamento eixo cruzado" },
  { key: "itemSpacing", label: "Espaçamento (itemSpacing)" },
  { key: "counterAxisSpacing", label: "Espaçamento eixo cruzado" },
  { key: "paddingTop", label: "Padding Top" },
  { key: "paddingRight", label: "Padding Right" },
  { key: "paddingBottom", label: "Padding Bottom" },
  { key: "paddingLeft", label: "Padding Left" },
  { key: "clipsContent", label: "Clips Content" },
  { key: "opacity", label: "Opacidade (opacity)" },
  { key: "vectorNetwork", label: "Forma do vetor (vectorNetwork)" },
  { key: "fills", label: "Preenchimento (fills)" },
  { key: "strokes", label: "Traçado (strokes)" },
  { key: "effects", label: "Efeitos (effects)" },
  { key: "characters", label: "Texto (characters)" },
  { key: "componentPropertyDefinitions", label: "Propriedades do componente" },
];

var ALL_FIELD_KEYS = ALL_FIELDS.map(function (field) { return field.key; });
var lastAnalysisCriteriaKey = null;

// Presets ficam armazenados no DocumentNode para acompanharem o arquivo Figma.
// O índice e cada preset usam entradas separadas para evitar concentrar todos os
// presets no limite de 100 KB de uma única entrada de plugin data.
var PRESETS_INDEX_KEY = "fcdup.presets.index.v1";
var PRESET_DATA_PREFIX = "fcdup.preset.v1.";

function presetIndex() {
  var raw = figma.root.getPluginData(PRESETS_INDEX_KEY);
  if (!raw) return [];

  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function presetDataKey(id) {
  return PRESET_DATA_PREFIX + String(id);
}

function postPresets(selectedId) {
  var index = presetIndex();
  var presets = [];

  for (var i = 0; i < index.length; i++) {
    var item = index[i];
    if (!item || !item.id) continue;

    var raw = figma.root.getPluginData(presetDataKey(item.id));
    if (!raw) continue;

    try {
      var preset = JSON.parse(raw);
      if (preset && preset.id && preset.name && preset.state) presets.push(preset);
    } catch (error) {
      // Ignora apenas o preset corrompido e mantém os demais disponíveis.
    }
  }

  figma.ui.postMessage({
    type: "presets",
    presets: presets,
    selectedId: selectedId || null
  });
}

function savePreset(preset, update) {
  if (!preset || !String(preset.name || "").trim()) {
    throw new Error("Informe um nome para o preset.");
  }

  var index = presetIndex();
  var id = String(preset.id || (Date.now().toString(36) + Math.random().toString(36).slice(2)));
  var existingIndex = -1;

  for (var i = 0; i < index.length; i++) {
    if (index[i] && index[i].id === id) {
      existingIndex = i;
      break;
    }
  }

  if (update && existingIndex === -1) {
    throw new Error("O preset selecionado não foi encontrado neste arquivo.");
  }

  var now = new Date().toISOString();
  var existing = existingIndex >= 0 ? index[existingIndex] : null;
  var record = {
    id: id,
    name: String(preset.name).trim(),
    tab: preset.tab || "free",
    state: preset.state,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now
  };

  figma.root.setPluginData(presetDataKey(id), JSON.stringify(record));

  var indexItem = {
    id: record.id,
    name: record.name,
    tab: record.tab,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (existingIndex >= 0) index[existingIndex] = indexItem;
  else index.unshift(indexItem);

  figma.root.setPluginData(PRESETS_INDEX_KEY, JSON.stringify(index));
  postPresets(record.id);
}

function deletePreset(id) {
  id = String(id || "");
  if (!id) throw new Error("Nenhum preset selecionado.");

  var index = presetIndex();
  var nextIndex = index.filter(function (item) { return item && item.id !== id; });
  if (nextIndex.length === index.length) {
    throw new Error("O preset selecionado não foi encontrado neste arquivo.");
  }

  figma.root.setPluginData(presetDataKey(id), "");
  figma.root.setPluginData(PRESETS_INDEX_KEY, JSON.stringify(nextIndex));
  postPresets(null);
}

figma.ui.postMessage({ type: "field-definitions", fields: ALL_FIELDS });

function normalizeSelectedFields(input) {
  var result = {};
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    var key = ALL_FIELD_KEYS[i];
    result[key] = {
      element: !!(input && input[key] && input[key].element),
      children: !!(input && input[key] && input[key].children)
    };
  }
  return result;
}

function selectedFieldsKey(selected) {
  return ALL_FIELD_KEYS.map(function (key) { 
    var elementVal = selected[key] ? selected[key].element : false;
    var childrenVal = selected[key] ? selected[key].children : false;
    return key + "_el=" + elementVal + "|" + key + "_ch=" + childrenVal; 
  }).join("|");
}

function analysisCriteriaKey(selected, optionsConfig) {
  return selectedFieldsKey(selected) + "|validateRepeatsAcrossFrames=" +
    !!(optionsConfig && optionsConfig.validateRepeatsAcrossFrames);
}

function hasAnyField(selected) {
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    var key = ALL_FIELD_KEYS[i];
    if (selected[key] && (selected[key].element || selected[key].children)) return true;
  }
  return false;
}

function activeFieldsLabel(selected) {
  var labels = [];
  for (var i = 0; i < ALL_FIELDS.length; i++) {
    var key = ALL_FIELDS[i].key;
    var config = selected[key];
    if (config && (config.element || config.children)) {
      var parts = [];
      if (config.element) parts.push("Elemento");
      if (config.children) parts.push("Filhos");
      labels.push(ALL_FIELDS[i].label + " (" + parts.join("+") + ")");
    }
  }
  return labels.join(", ");
}

function getAllNodes(root, predicate) {
  var result = [];
  function walk(node) {
    try {
      if (predicate(node)) result.push(node);
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
      }
    } catch (error) {
      figma.ui.postMessage({ type: "log", text: "Nó inacessível ignorado: " + error.message });
    }
  }
  walk(root);
  return result;
}

function val(value) {
  return value === undefined || value === null ? "" : String(value);
}

function supportsAutoLayout(node) {
  return node.type === "FRAME" || node.type === "COMPONENT";
}

function supportsClipsContent(node) {
  return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "SECTION";
}

function isPrimaryAuto(node) {
  try { return node.primaryAxisSizingMode === "AUTO"; } catch (e) { return false; }
}

function isCounterAuto(node) {
  try { return node.counterAxisSizingMode === "AUTO"; } catch (e) { return false; }
}

function readSimpleField(node, field) {
  if (
    (field === "layoutMode" || field === "layoutWrap" ||
      field === "primaryAxisAlignItems" || field === "counterAxisAlignItems" ||
      field === "itemSpacing" || field === "counterAxisSpacing" ||
      field === "paddingTop" || field === "paddingRight" ||
      field === "paddingBottom" || field === "paddingLeft") &&
    !supportsAutoLayout(node)
  ) return "";

  if (
    (field === "layoutWrap" || field === "primaryAxisAlignItems" ||
      field === "counterAxisAlignItems" || field === "itemSpacing" ||
      field === "counterAxisSpacing" || field === "paddingTop" ||
      field === "paddingRight" || field === "paddingBottom" ||
      field === "paddingLeft") &&
    node.layoutMode !== "HORIZONTAL" && node.layoutMode !== "VERTICAL"
  ) return "";

  if (field === "clipsContent" && !supportsClipsContent(node)) return "";

  try { return val(node[field]); } catch (error) { return ""; }
}

function normalizeComparableValue(value) {
  try {
    if (value === figma.mixed) return "<mixed>";
  } catch (error) {}

  if (value === undefined) return "<undefined>";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalizeComparableValue);

  var result = {};
  var keys = Object.keys(value).sort();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    try { result[key] = normalizeComparableValue(value[key]); } catch (error) {}
  }
  return result;
}

function readComplexField(node, field) {
  // vectorNetwork só existe para nós VECTOR. Nos demais tipos, não participar
  // da assinatura evita diferenças artificiais pela ausência do campo.
  if (field === "vectorNetwork" && node.type !== "VECTOR") return "";

  try {
    var normalized = normalizeComparableValue(node[field]);
    var serialized = JSON.stringify(normalized);
    return serialized === undefined ? "" : serialized;
  } catch (error) {
    return "";
  }
}

function comparableDisplay(value) {
  var text = String(value);
  return text.length > 140 ? text.substring(0, 140) + "…" : text;
}

// Instâncias aninhadas são fronteiras de componentes. A estrutura interna
// delas pertence ao componente referenciado e pode mudar quando uma variante
// diferente é preservada; ela não deve alterar a compatibilidade do contêiner.
function nestedComponentIdentity(node) {
  if (!node || node.type !== "INSTANCE") return "";
  try {
    var mainComponent = node.mainComponent;
    if (!mainComponent) return "";
    var parent = mainComponent.parent;
    if (parent && parent.type === "COMPONENT_SET") return "set:" + parent.id;
    return "component:" + mainComponent.id;
  } catch (error) {
    return "";
  }
}

function propertiesSignature(node, selected, rootTypeIgnored, isRoot) {
  if (isRoot === undefined) isRoot = true;
  var parts = ["type=" + (rootTypeIgnored ? "<component-compatível>" : val(node.type))];
  var simpleFields = [
    "name", "visible", "width", "height", "rotation", "layoutMode", "layoutWrap",
    "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing", "counterAxisSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "clipsContent", "opacity",
  ];
  var complexFields = ["vectorNetwork", "fills", "strokes", "effects"];

  for (var i = 0; i < simpleFields.length; i++) {
    var field = simpleFields[i];
    var config = selected[field];
    if (!config) continue;

    var isIncluded = isRoot ? config.element : config.children;
    if (!isIncluded) continue;
    
    // 1. Ignorar largura/altura para camadas de texto se a comparação de caracteres estiver desabilitada
    var charsConfig = selected.characters;
    var isCharsEnabled = charsConfig && (isRoot ? charsConfig.element : charsConfig.children);
    
    if (node.type === "TEXT" && !isCharsEnabled && (field === "width" || field === "height")) {
      continue;
    }
    
    // 2. Ignorar largura/altura para frames Auto-Layout com redimensionamento automático (Hug)
    if (supportsAutoLayout(node) && node.layoutMode !== "NONE" && !isCharsEnabled) {
      if (field === "width") {
        var isWidthAuto = (node.layoutMode === "HORIZONTAL" && isPrimaryAuto(node)) ||
                          (node.layoutMode === "VERTICAL" && isCounterAuto(node));
        if (isWidthAuto) continue;
      }
      if (field === "height") {
        var isHeightAuto = (node.layoutMode === "HORIZONTAL" && isCounterAuto(node)) ||
                           (node.layoutMode === "VERTICAL" && isPrimaryAuto(node));
        if (isHeightAuto) continue;
      }
    }
    
    parts.push(field + "=" + readSimpleField(node, field));
  }

  for (var c = 0; c < complexFields.length; c++) {
    var complexField = complexFields[c];
    var complexConfig = selected[complexField];
    if (!complexConfig) continue;

    var complexIncluded = isRoot ? complexConfig.element : complexConfig.children;
    if (complexIncluded) {
      parts.push(complexField + "=" + readComplexField(node, complexField));
    }
  }

  var charsConfig = selected.characters;
  if (charsConfig && (isRoot ? charsConfig.element : charsConfig.children)) {
    try { if (node.type === "TEXT") parts.push("characters=" + val(node.characters)); } catch (error) {}
  }

  var propsConfig = selected.componentPropertyDefinitions;
  if (propsConfig && (isRoot ? propsConfig.element : propsConfig.children)) {
    try {
      if (node.type === "COMPONENT" && node.componentPropertyDefinitions) {
        parts.push("properties=" + Object.keys(node.componentPropertyDefinitions).sort().join(","));
      }
    } catch (error) {}
  }
  return parts.join(";");
}

function hashText(text, seed) {
  var hash = seed;
  for (var i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}

function compactSignature(properties, children) {
  var text = properties + "{" + children.join("|") + "}";
  return hashText(text, 2166136261) + ":" + hashText(text, 2654435761);
}

function createSignatureCalculator(selected, signatureOptions) {
  var cache = {};
  var compareChildren = !signatureOptions || signatureOptions.compareChildren !== false;
  var groupNestedVariants = !!(signatureOptions && signatureOptions.groupNestedVariants);

  function signatureFor(node, isRoot) {
    if (isRoot === undefined) isRoot = true;
    var cacheKey = node.id + ":" + (isRoot ? "root" : "child");
    if (cache[cacheKey]) return cache[cacheKey];

    var exactChildren = [];
    var compatibleChildren = [];
    try {
      if (compareChildren && node.children) {
        for (var i = 0; i < node.children.length; i++) {
          // Os elementos internos recursivos são sempre descendentes (isRoot = false)
          var child = node.children[i];
          var exactChildSignature = signatureFor(child, false).exact;
          var nestedIdentity = nestedComponentIdentity(child);
          exactChildren.push(groupNestedVariants && nestedIdentity
            ? "nested-instance=" + nestedIdentity
            : exactChildSignature);
          compatibleChildren.push(nestedIdentity
            ? "nested-instance=" + nestedIdentity
            : exactChildSignature);
        }
      }
    } catch (error) {
      exactChildren.push("inacessível");
      compatibleChildren.push("inacessível");
    }

    var result = {
      exact: compactSignature(propertiesSignature(node, selected, false, isRoot), exactChildren),
      compatible: compactSignature(propertiesSignature(node, selected, true, isRoot), compatibleChildren),
    };
    cache[cacheKey] = result;
    return result;
  }

  return signatureFor;
}

// --- Debug: comparação legível entre dois nós ---
function diffNodes(nodeA, nodeB, selected, path, maxDiffs, isRoot, compareChildren) {
  if (isRoot === undefined) isRoot = true;
  if (!maxDiffs) maxDiffs = 10;
  if (compareChildren === undefined) compareChildren = true;
  var diffs = [];
  var currentPath = path || nodeA.name || "(raiz)";

  // O componente interno pode ter outra variante e, portanto, outra árvore
  // de filhos. Essa diferença será preservada no override da instância; não
  // é uma incompatibilidade do elemento externo.
  if (!isRoot) {
    var identityA = nestedComponentIdentity(nodeA);
    var identityB = nestedComponentIdentity(nodeB);
    if (identityA && identityA === identityB) return diffs;
  }

  // Comparar tipo (sempre comparado, mas na raiz usa compatible)
  if (nodeA.type !== nodeB.type) {
    diffs.push(currentPath + " → tipo: " + nodeA.type + " vs " + nodeB.type);
  }

  // Comparar campos simples selecionados
  var simpleFields = [
    "name", "visible", "width", "height", "rotation", "layoutMode", "layoutWrap",
    "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing", "counterAxisSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "clipsContent", "opacity",
  ];
  var complexFields = ["vectorNetwork", "fills", "strokes", "effects"];
  for (var i = 0; i < simpleFields.length; i++) {
    if (diffs.length >= maxDiffs) break;
    var field = simpleFields[i];
    var config = selected[field];
    if (!config) continue;

    var isIncluded = isRoot ? config.element : config.children;
    if (!isIncluded) continue;

    var valA = readSimpleField(nodeA, field);
    var valB = readSimpleField(nodeB, field);
    if (valA !== valB) {
      diffs.push(currentPath + " → " + field + ": \"" + valA + "\" vs \"" + valB + "\"");
    }
  }

  for (var c = 0; c < complexFields.length; c++) {
    if (diffs.length >= maxDiffs) break;
    var complexField = complexFields[c];
    var complexConfig = selected[complexField];
    if (!complexConfig) continue;

    var complexIncluded = isRoot ? complexConfig.element : complexConfig.children;
    if (!complexIncluded) continue;

    var complexA = readComplexField(nodeA, complexField);
    var complexB = readComplexField(nodeB, complexField);
    if (complexA !== complexB) {
      diffs.push(currentPath + " → " + complexField + ": \"" + comparableDisplay(complexA) + "\" vs \"" + comparableDisplay(complexB) + "\"");
    }
  }

  // Comparar texto
  var charsConfig = selected.characters;
  var isCharsIncluded = charsConfig && (isRoot ? charsConfig.element : charsConfig.children);
  if (isCharsIncluded && nodeA.type === "TEXT" && nodeB.type === "TEXT") {
    try {
      var charsA = val(nodeA.characters);
      var charsB = val(nodeB.characters);
      if (charsA !== charsB) {
        diffs.push(currentPath + " → characters: \"" + charsA.substring(0, 40) + "\" vs \"" + charsB.substring(0, 40) + "\"");
      }
    } catch (e) {}
  }

  if (!compareChildren) return diffs;

  // Comparar quantidade de filhos
  var childrenA = [];
  var childrenB = [];
  try { if (nodeA.children) childrenA = nodeA.children; } catch (e) {}
  try { if (nodeB.children) childrenB = nodeB.children; } catch (e) {}

  if (childrenA.length !== childrenB.length) {
    diffs.push(currentPath + " → quantidade de filhos: " + childrenA.length + " vs " + childrenB.length);
  } else {
    // Comparar filhos recursivamente (sendo descendentes, passa isRoot = false)
    for (var c = 0; c < childrenA.length; c++) {
      if (diffs.length >= maxDiffs) break;
      var childPath = currentPath + " > " + (childrenA[c].name || "[" + c + "]");
      var childDiffs = diffNodes(childrenA[c], childrenB[c], selected, childPath, maxDiffs - diffs.length, false, compareChildren);
      for (var d = 0; d < childDiffs.length; d++) {
        diffs.push(childDiffs[d]);
      }
    }
  }

  return diffs;
}

function pageName(node) {
  var current = node;
  while (current && current.type !== "PAGE") current = current.parent;
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

function nodeDepth(node) {
  var depth = 0;
  var current = node.parent;
  while (current && current.type !== "DOCUMENT") {
    depth++;
    current = current.parent;
  }
  return depth;
}

function hasProtectedAncestor(node) {
  var current = node.parent;
  while (current && current.type !== "DOCUMENT") {
    if (current.type === "INSTANCE" || current.type === "COMPONENT" || current.type === "COMPONENT_SET") return true;
    current = current.parent;
  }
  return false;
}

// Analisa recursivamente se um nó contém sub-elementos proibidos
function hasProhibitedDescendants(node, prohibitedTypes) {
  if (!prohibitedTypes || prohibitedTypes.length === 0) return false;
  var found = false;
  function walk(n) {
    if (found) return;
    if (n !== node && prohibitedTypes.indexOf(n.type) !== -1) {
      found = true;
      return;
    }
    if (n.children) {
      for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    }
  }
  walk(node);
  return found;
}

// Conta instâncias/componentes na subárvore
function countNestedComponents(node) {
  var count = 0;
  function walk(n) {
    if (n !== node && (n.type === "INSTANCE" || n.type === "COMPONENT" || n.type === "COMPONENT_SET")) {
      count++;
    }
    if (n.children) {
      for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    }
  }
  walk(node);
  return count;
}

function createSubtreeMetadataCalculator() {
  var cache = {};

  function metadataFor(node) {
    if (!node || !node.id) return { nestedComponents: 0, descendantTypes: {} };
    if (cache[node.id]) return cache[node.id];

    var metadata = { nestedComponents: 0, descendantTypes: {} };
    cache[node.id] = metadata;
    try {
      var children = node.children || [];
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var childMetadata = metadataFor(child);
        metadata.descendantTypes[child.type] = true;
        if (child.type === "INSTANCE" || child.type === "COMPONENT" || child.type === "COMPONENT_SET") {
          metadata.nestedComponents++;
        }
        metadata.nestedComponents += childMetadata.nestedComponents;
        var descendantTypes = Object.keys(childMetadata.descendantTypes);
        for (var d = 0; d < descendantTypes.length; d++) {
          metadata.descendantTypes[descendantTypes[d]] = true;
        }
      }
    } catch (error) {}
    return metadata;
  }

  return metadataFor;
}

function shouldIgnoreNode(node, filterConfig, subtreeMetadataFor) {
  if (!filterConfig) return false;

  // 1. Filtros de Contêineres / Frames / Grupos (Contagem de filhos e nomes ignorados)
  if (node.type === "FRAME" || node.type === "GROUP" || node.type === "COMPONENT" || node.type === "INSTANCE" || node.type === "SECTION") {
    var count = node.children ? node.children.length : 0;
    if (filterConfig.enableMinChildren && count < filterConfig.minChildrenVal) return true;
    if (filterConfig.enableMaxChildren && count > filterConfig.maxChildrenVal) return true;
    if (filterConfig.ignoredNames && filterConfig.ignoredNames.length > 0) {
      var nameLower = (node.name || "").toLowerCase().trim();
      for (var i = 0; i < filterConfig.ignoredNames.length; i++) {
        var term = filterConfig.ignoredNames[i].toLowerCase().trim();
        if (term && nameLower.indexOf(term) !== -1) return true;
      }
    }
  }

  // 2. Filtro de Dimensões Mínimas e Máximas (aplica a qualquer elemento que possua largura e altura)
  if (typeof node.width === "number" && typeof node.height === "number") {
    var w = node.width;
    var h = node.height;
    if (filterConfig.enableMinDimensions) {
      if (w < filterConfig.minWidthVal || h < filterConfig.minHeightVal) return true;
    }
    if (filterConfig.enableMaxDimensions) {
      if (w > filterConfig.maxWidthVal || h > filterConfig.maxHeightVal) return true;
    }
  }

  // 3. Supressão de Wrapper (Ignorar filhos únicos em favor do container)
  if (filterConfig.enableWrapperSuppression) {
    if (node.parent && node.parent.children && node.parent.children.length === 1 && !hasProtectedAncestor(node.parent)) {
      return true; // Pula este nó, pois o pai é o wrapper visual definitivo
    }
  }

  // 4. Exclusão de Subárvore (Tipos proibidos)
  if (filterConfig.enableSubtreeExclusion && filterConfig.prohibitedTypes && filterConfig.prohibitedTypes.length > 0) {
    var metadata = subtreeMetadataFor ? subtreeMetadataFor(node) : null;
    if (metadata) {
      for (var p = 0; p < filterConfig.prohibitedTypes.length; p++) {
        if (metadata.descendantTypes[filterConfig.prohibitedTypes[p]]) return true;
      }
    } else if (hasProhibitedDescendants(node, filterConfig.prohibitedTypes)) {
      return true;
    }
  }

  // 5. Limites de Componentes Aninhados na Subárvore
  if (filterConfig.enableComponentLimits) {
    var componentMetadata = subtreeMetadataFor ? subtreeMetadataFor(node) : null;
    var compCount = componentMetadata ? componentMetadata.nestedComponents : countNestedComponents(node);
    if (filterConfig.enableMinComponents && compCount < filterConfig.minComponentsVal) return true;
    if (filterConfig.enableMaxComponents && compCount > filterConfig.maxComponentsVal) return true;
  }

  return false;
}

function getCandidates(scope, selectedTypes, filterConfig, includeComponentContents) {
  var result = [];
  var candidateIds = {};
  var allowProtectedContents = !!includeComponentContents;
  var subtreeMetadataFor = filterConfig &&
    ((filterConfig.enableSubtreeExclusion && filterConfig.prohibitedTypes && filterConfig.prohibitedTypes.length) ||
      filterConfig.enableComponentLimits)
    ? createSubtreeMetadataCalculator()
    : null;

  // A seleção do Figma pode conter nós sobrepostos (por exemplo, um frame e
  // um de seus filhos). Como cada seleção é percorrida recursivamente, o
  // mesmo nó podia entrar mais de uma vez na análise e ser enviado duas vezes
  // para a aplicação. Isso fazia a validação falhar no meio da família,
  // deixando parte dos itens sem componentizar.
  function addCandidate(node) {
    if (!node || !node.id || candidateIds[node.id]) return;
    candidateIds[node.id] = true;
    result.push(node);
  }

  function walk(node) {
    try {
      if (node.type === "DOCUMENT" || node.type === "PAGE") {
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            walk(node.children[i]);
          }
        }
        return;
      }
      
      if (node.type === "COMPONENT_SET") {
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            if (node.children[i].type === "COMPONENT") {
              if (!selectedTypes || selectedTypes["COMPONENT"]) {
                if (!shouldIgnoreNode(node.children[i], filterConfig, subtreeMetadataFor)) {
                  addCandidate(node.children[i]);
                }
              }
            }
          }
        }
        return;
      }
      
      if (node.type === "COMPONENT") {
        if (!selectedTypes || selectedTypes["COMPONENT"]) {
          if (!shouldIgnoreNode(node, filterConfig, subtreeMetadataFor)) {
            addCandidate(node);
          }
        }
        if (allowProtectedContents && node.children) {
          for (var componentChild = 0; componentChild < node.children.length; componentChild++) {
            walk(node.children[componentChild]);
          }
        }
        return;
      }
      
      if (node.type === "INSTANCE") {
        if ((!selectedTypes || selectedTypes["INSTANCE"]) &&
            (allowProtectedContents || !hasProtectedAncestor(node)) &&
            !shouldIgnoreNode(node, filterConfig, subtreeMetadataFor)) {
          addCandidate(node);
        }
        if (allowProtectedContents && node.children) {
          for (var instanceChild = 0; instanceChild < node.children.length; instanceChild++) {
            walk(node.children[instanceChild]);
          }
        }
        return;
      }
      
      if (allowProtectedContents || !hasProtectedAncestor(node)) {
        var allowed = true;
        if (selectedTypes) {
          if (node.type === "TEXT") {
            allowed = !!selectedTypes["TEXT"];
          } else if (node.type === "FRAME") {
            allowed = !!selectedTypes["FRAME"];
          } else if (node.type === "GROUP") {
            allowed = !!selectedTypes["GROUP"];
          } else if (
            node.type === "RECTANGLE" ||
            node.type === "ELLIPSE" ||
            node.type === "POLYGON" ||
            node.type === "STAR" ||
            node.type === "VECTOR" ||
            node.type === "LINE"
          ) {
            allowed = !!selectedTypes["SHAPES"];
          } else {
            allowed = !!selectedTypes["SHAPES"];
          }
        }
        if (allowed && !shouldIgnoreNode(node, filterConfig, subtreeMetadataFor)) {
          addCandidate(node);
        }
      }
      
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          walk(node.children[i]);
        }
      }
    } catch (e) {
      figma.ui.postMessage({
        type: "log",
        text: "Nó inacessível ignorado durante varredura: " + e.message
      });
    }
  }

  if (scope === "selection") {
    var sel = figma.currentPage.selection;
    if (sel && sel.length > 0) {
      for (var s = 0; s < sel.length; s++) {
        walk(sel[s]);
      }
    }
  } else if (scope === "page") {
    walk(figma.currentPage);
  } else {
    walk(figma.root);
  }

  return result;
}

function nearestFrameAncestor(node) {
  var current = node ? node.parent : null;
  while (current && current.type !== "DOCUMENT") {
    if (current.type === "FRAME") return current;
    current = current.parent;
  }
  return null;
}

function filterCandidatesByFrameRepetition(candidates, signatureFor) {
  var framesBySignature = {};
  var candidateFrames = {};

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    var frame = nearestFrameAncestor(candidate);
    if (!frame) continue;

    var signature = signatureFor(candidate).compatible;
    candidateFrames[candidate.id] = frame.id;
    if (!framesBySignature[signature]) framesBySignature[signature] = {};
    framesBySignature[signature][frame.id] = true;
  }

  var repeatedSignatures = {};
  var signatures = Object.keys(framesBySignature);
  for (var s = 0; s < signatures.length; s++) {
    if (Object.keys(framesBySignature[signatures[s]]).length > 1) {
      repeatedSignatures[signatures[s]] = true;
    }
  }

  return candidates.filter(function (candidate) {
    var frameId = candidateFrames[candidate.id];
    if (!frameId) return false;
    return !!repeatedSignatures[signatureFor(candidate).compatible];
  });
}

function analyzeDocument(selected, selectedTypes, scope, filterConfig, optionsConfig) {
  var candidates = getCandidates(scope, selectedTypes, filterConfig);
  var signatureFor = createSignatureCalculator(selected);

  if (optionsConfig && optionsConfig.validateRepeatsAcrossFrames) {
    var beforeFrameValidation = candidates.length;
    candidates = filterCandidatesByFrameRepetition(candidates, signatureFor);
    figma.ui.postMessage({
      type: "log",
      text: "Validação entre frames activa: " + candidates.length + " de " + beforeFrameValidation + " elemento(s) permanecem na análise."
    });
  }
  
  var families = {};
  
  for (var i = 0; i < candidates.length; i++) {
    var node = candidates[i];
    var familyName = "";
    var isVariant = false;
    var rawProps = {};
    
    if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
      familyName = node.parent.name;
      isVariant = true;
      rawProps = readVariantPropertiesSafely(node);
    } else if (node.type === "INSTANCE") {
      // Instâncias de variantes herdam a família e as propriedades do
      // componente principal, permitindo analisá-las como variantes reais.
      try {
        var mainComponent = node.mainComponent;
        if (mainComponent && mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
          familyName = mainComponent.parent.name;
          isVariant = true;
          rawProps = readVariantPropertiesSafely(mainComponent);
        }
      } catch (error) {}

      if (!familyName) familyName = node.name;
    } else if (node.name && node.name.indexOf("/") !== -1) {
      var parts = node.name.split("/").map(function (s) { return s.trim(); });
      familyName = parts[0];
      isVariant = true;
      if (parts.length > 1) {
        rawProps["Property 1"] = parts.slice(1).join("/");
      }
    } else {
      familyName = node.name;
      isVariant = false;
      rawProps = {};
    }
    
    if (!familyName) familyName = "(sem nome)";
    
    var nodeSig = signatureFor(node).compatible;
    var familyKey = nodeSig;
    
    if (!families[familyKey]) {
      families[familyKey] = {
        name: familyName,
        nodes: [],
        keysMap: {}
      };
    }
    
    families[familyKey].nodes.push({
      node: node,
      isVariant: isVariant,
      rawProps: rawProps
    });
    
    var keys = Object.keys(rawProps);
    for (var j = 0; j < keys.length; j++) {
      families[familyKey].keysMap[keys[j]] = true;
    }
  }
  
  var resultFamilies = [];
  var familyNames = Object.keys(families);
  
  for (var f = 0; f < familyNames.length; f++) {
    var fam = families[familyNames[f]];
    var familyKeys = Object.keys(fam.keysMap).sort();
    
    var variantGroups = {};
    
    for (var n = 0; n < fam.nodes.length; n++) {
      var item = fam.nodes[n];
      var node = item.node;
      
      var normalizedProps = {};
      if (familyKeys.length > 0) {
        for (var k = 0; k < familyKeys.length; k++) {
          var key = familyKeys[k];
          normalizedProps[key] = (item.rawProps[key] !== undefined && item.rawProps[key] !== null) ? item.rawProps[key] : "Default";
        }
      } else {
        normalizedProps["Property 1"] = node.name || "Default";
      }
      
      var variantStr = Object.keys(normalizedProps).sort().map(function (k) {
        return k + "=" + normalizedProps[k];
      }).join(", ");
      
      if (!variantGroups[variantStr]) {
        variantGroups[variantStr] = [];
      }
      
      variantGroups[variantStr].push({
        node: node,
        normalizedProps: normalizedProps,
        signature: signatureFor(node).compatible
      });
    }
    
    var processedVariants = [];
    var familyMaxDepth = 0;
    var totalCopies = 0;
    var hasIncompatibility = false;
    
    var variantStrs = Object.keys(variantGroups);
    for (var v = 0; v < variantStrs.length; v++) {
      var vStr = variantStrs[v];
      var groupItems = variantGroups[vStr];
      
      var sourceItem = null;
      for (var gi = 0; gi < groupItems.length; gi++) {
        var type = groupItems[gi].node.type;
        if (type === "COMPONENT") {
          sourceItem = groupItems[gi];
          break;
        }
      }
      if (!sourceItem) {
        sourceItem = groupItems[0];
      }
      
      var sourceNode = sourceItem.node;
      var sourceSignature = sourceItem.signature;
      
      var copies = [];
      for (var gi = 0; gi < groupItems.length; gi++) {
        var item = groupItems[gi];
        if (item.node.id === sourceNode.id) {
          continue;
        }
        
        var isCompatible = (item.signature === sourceSignature);
        if (!isCompatible) {
          hasIncompatibility = true;
          var reasons = diffNodes(sourceNode, item.node, selected, item.node.name, 5);
          figma.ui.postMessage({
            type: "log",
            text: "⚠️ Incompatibilidade em \"" + item.node.name + "\" (" + item.node.id + "):\n" + (reasons.length > 0 ? reasons.map(function(r) { return "   • " + r; }).join("\n") : "   • Diferença na estrutura interna (hash diferente)")
          });
        }
        
        copies.push({
          id: item.node.id,
          type: item.node.type,
          name: item.node.name,
          page: pageName(item.node),
          path: nodePath(item.node),
          isComponent: item.node.type === "COMPONENT",
          isCompatible: isCompatible
        });
      }
      
      var depth = nodeDepth(sourceNode);
      if (depth > familyMaxDepth) familyMaxDepth = depth;
      
      totalCopies += copies.length;
      
      processedVariants.push({
        variantStr: vStr,
        sourceId: sourceNode.id,
        sourceType: (sourceNode.type === "COMPONENT") ? (sourceNode.parent && sourceNode.parent.type === "COMPONENT_SET" ? "variant" : "loose") : "common",
        sourceName: sourceNode.name,
        sourcePage: pageName(sourceNode),
        sourcePath: nodePath(sourceNode),
        copies: copies
      });
    }
    
    if (totalCopies > 0) {
      resultFamilies.push({
        name: fam.name,
        variants: processedVariants,
        totalCopies: totalCopies,
        maxDepth: familyMaxDepth,
        hasIncompatibility: hasIncompatibility
      });
    }
  }
  
  return resultFamilies;
}

function instancesByMainComponent() {
  var index = {};
  var instances = figma.root.findAll(function (node) { return node.type === "INSTANCE"; });
  for (var i = 0; i < instances.length; i++) {
    try {
      var main = instances[i].mainComponent;
      if (main) {
        if (!index[main.id]) index[main.id] = [];
        index[main.id].push(instances[i]);
      }
    } catch (error) {}
  }
  return { index: index, count: instances.length };
}

// --- Explorar: inventário e busca aproximada ---
function selectionSummary(nodes) {
  return (nodes || []).map(function (node) {
    return {
      id: node.id,
      name: node.name || "(sem nome)",
      type: node.type,
      page: pageName(node),
      path: nodePath(node)
    };
  });
}

function postSelectionState() {
  var selection = figma.currentPage.selection || [];
  var cleanupParents = [];
  var cleanupParentIds = {};
  if (selection.length > 0 && selection.every(function (node) { return node.type === "COMPONENT"; })) {
    for (var i = 0; i < selection.length; i++) {
      if (cleanupParentIds[selection[i].id]) continue;
      cleanupParentIds[selection[i].id] = true;
      cleanupParents.push(cleanupParentSummary(selection[i]));
    }
  } else if (selection.length === 1 && selection[0].type === "INSTANCE") {
    try {
      if (selection[0].mainComponent) cleanupParents.push(cleanupParentSummary(selection[0].mainComponent));
    } catch (error) {}
  }
  var cleanupParent = cleanupParents.length === 1 ? cleanupParents[0] : null;
  figma.ui.postMessage({
    type: "selection-state",
    selection: selectionSummary(selection),
    cleanupParent: cleanupParent,
    cleanupParents: cleanupParents
  });
}

function componentInventory() {
  // Inventário é solicitado com frequência na aba Explorar. Faça uma única
  // varredura para coletar componentes e indexar instâncias, em vez de dois
  // findAll completos no documento.
  var nodes = figma.root.findAll(function (node) {
    return node.type === "COMPONENT" || node.type === "INSTANCE";
  });
  var components = [];
  var instanceIndex = {};
  var currentPageId = figma.currentPage.id;

  for (var n = 0; n < nodes.length; n++) {
    var node = nodes[n];
    if (node.type === "COMPONENT") {
      components.push(node);
      continue;
    }
    try {
      var mainComponent = node.mainComponent;
      if (!mainComponent) continue;
      if (!instanceIndex[mainComponent.id]) instanceIndex[mainComponent.id] = { all: 0, currentPage: 0 };
      instanceIndex[mainComponent.id].all++;
      var instancePage = getPage(node);
      if (instancePage && instancePage.id === currentPageId) instanceIndex[mainComponent.id].currentPage++;
    } catch (error) {}
  }

  var result = [];

  for (var i = 0; i < components.length; i++) {
    var component = components[i];
    var instanceCounts = instanceIndex[component.id] || { all: 0, currentPage: 0 };
    var componentSet = component.parent && component.parent.type === "COMPONENT_SET"
      ? component.parent
      : null;
    result.push({
      id: component.id,
      name: component.name || "(sem nome)",
      type: component.type,
      family: componentSet ? componentSet.name : "",
      familyId: componentSet ? componentSet.id : "",
      page: pageName(component),
      path: nodePath(component),
      instances: instanceCounts.all,
      instancesOnCurrentPage: instanceCounts.currentPage
    });
  }

  result.sort(function (a, b) {
    if (b.instances !== a.instances) return b.instances - a.instances;
    return a.name.localeCompare(b.name);
  });
  return result;
}

function similarTypeGroup(type) {
  if (type === "TEXT") return "TEXT";
  if (type === "RECTANGLE" || type === "ELLIPSE" || type === "POLYGON" ||
      type === "STAR" || type === "VECTOR" || type === "LINE") return "SHAPE";
  if (type === "FRAME" || type === "GROUP" || type === "SECTION" ||
      type === "COMPONENT" || type === "INSTANCE" || type === "COMPONENT_SET") return "CONTAINER";
  return type;
}

function similarFeatures(node, cache) {
  var cacheKey = node && node.id;
  if (cache && cacheKey && cache[cacheKey]) return cache[cacheKey];

  var children = [];
  try {
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) children.push(node.children[i].type);
    }
  } catch (error) {}

  var width = typeof node.width === "number" ? node.width : 0;
  var height = typeof node.height === "number" ? node.height : 0;
  var features = {
    type: node.type,
    group: similarTypeGroup(node.type),
    width: width,
    height: height,
    aspect: height > 0 ? width / height : (width > 0 ? 10 : 1),
    childTypes: children,
    childCount: children.length,
    layoutMode: readSimpleField(node, "layoutMode"),
    alignMain: readSimpleField(node, "primaryAxisAlignItems"),
    alignCross: readSimpleField(node, "counterAxisAlignItems"),
    padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(function (field) {
      return readSimpleField(node, field);
    }).join(","),
    fills: readComplexField(node, "fills"),
    strokes: readComplexField(node, "strokes"),
    effects: readComplexField(node, "effects"),
    vector: readComplexField(node, "vectorNetwork"),
    nameTokens: String(node.name || "").toLowerCase()
      .replace(/[0-9]+/g, " ")
      .replace(/[^a-z0-9áéíóúãõç]+/gi, " ")
      .split(/\s+/)
      .filter(function (token) { return token.length > 1 && token !== "copy"; })
  };
  if (cache && cacheKey) cache[cacheKey] = features;
  return features;
}

function listSimilarity(listA, listB) {
  if (!listA.length && !listB.length) return 1;
  var lengthScore = 1 - Math.min(Math.abs(listA.length - listB.length) / Math.max(listA.length, listB.length, 1), 1);
  var matches = 0;
  var limit = Math.min(listA.length, listB.length);
  for (var i = 0; i < limit; i++) if (listA[i] === listB[i]) matches++;
  var positionScore = limit ? matches / Math.max(listA.length, listB.length) : 0;
  return lengthScore * 0.45 + positionScore * 0.55;
}

function setSimilarity(listA, listB) {
  if (!listA.length && !listB.length) return 1;
  var uniqueA = {};
  var uniqueB = {};
  for (var i = 0; i < listA.length; i++) uniqueA[listA[i]] = (uniqueA[listA[i]] || 0) + 1;
  for (var j = 0; j < listB.length; j++) uniqueB[listB[j]] = (uniqueB[listB[j]] || 0) + 1;
  var keys = {};
  Object.keys(uniqueA).forEach(function (key) { keys[key] = true; });
  Object.keys(uniqueB).forEach(function (key) { keys[key] = true; });
  var intersection = 0;
  var union = 0;
  Object.keys(keys).forEach(function (key) {
    intersection += Math.min(uniqueA[key] || 0, uniqueB[key] || 0);
    union += Math.max(uniqueA[key] || 0, uniqueB[key] || 0);
  });
  return union ? intersection / union : 0;
}

function scalarSimilarity(valueA, valueB) {
  var a = Math.abs(Number(valueA) || 0);
  var b = Math.abs(Number(valueB) || 0);
  if (!a && !b) return 1;
  return 1 - Math.min(Math.abs(a - b) / Math.max(a, b, 1), 1);
}

function tokenSimilarity(tokensA, tokensB) {
  var a = {};
  var b = {};
  tokensA.forEach(function (token) { a[token] = true; });
  tokensB.forEach(function (token) { b[token] = true; });
  var all = {};
  Object.keys(a).forEach(function (token) { all[token] = true; });
  Object.keys(b).forEach(function (token) { all[token] = true; });
  var total = Object.keys(all).length;
  if (!total) return 0;
  var common = Object.keys(a).filter(function (token) { return !!b[token]; }).length;
  return common / total;
}

function smartSimilarity(nodeA, nodeB, featureCache) {
  var a = similarFeatures(nodeA, featureCache);
  var b = similarFeatures(nodeB, featureCache);
  var typeScore = a.type === b.type ? 1 : (a.group === b.group ? 0.65 : 0);
  var structureScore = listSimilarity(a.childTypes, b.childTypes) * 0.7 +
    setSimilarity(a.childTypes, b.childTypes) * 0.3;
  var styleValuesA = [a.fills, a.strokes, a.effects, a.vector];
  var styleValuesB = [b.fills, b.strokes, b.effects, b.vector];
  var styleMatches = 0;
  for (var i = 0; i < styleValuesA.length; i++) {
    if (styleValuesA[i] === styleValuesB[i]) styleMatches++;
  }
  var styleScore = styleMatches / styleValuesA.length;
  var layoutValuesA = [a.layoutMode, a.alignMain, a.alignCross, a.padding];
  var layoutValuesB = [b.layoutMode, b.alignMain, b.alignCross, b.padding];
  var layoutMatches = 0;
  for (var j = 0; j < layoutValuesA.length; j++) {
    if (layoutValuesA[j] === layoutValuesB[j]) layoutMatches++;
  }
  var layoutScore = layoutMatches / layoutValuesA.length;
  var aspectScore = scalarSimilarity(a.aspect, b.aspect);
  var sizeScore = scalarSimilarity(a.width, b.width) * 0.5 + scalarSimilarity(a.height, b.height) * 0.5;
  var nameScore = tokenSimilarity(a.nameTokens, b.nameTokens);

  var total = typeScore * 0.25 + structureScore * 0.30 + styleScore * 0.20 +
    layoutScore * 0.15 + aspectScore * 0.06 + sizeScore * 0.03 + nameScore * 0.01;
  var reasons = [];
  if (typeScore === 1) reasons.push("mesmo tipo");
  else if (typeScore > 0) reasons.push("tipo compatível");
  if (structureScore >= 0.8) reasons.push("estrutura parecida");
  if (styleScore >= 0.75) reasons.push("aparência parecida");
  if (layoutScore >= 0.75) reasons.push("layout parecido");
  if (aspectScore >= 0.9) reasons.push("proporção próxima");
  return {
    score: Math.round(Math.max(0, Math.min(1, total)) * 100),
    reasons: reasons.length ? reasons : ["características parcialmente coincidentes"]
  };
}

function isInsideNode(node, ancestor) {
  var current = node;
  while (current && current.type !== "DOCUMENT") {
    if (current.id === ancestor.id) return true;
    current = current.parent;
  }
  return false;
}

function findSimilarNodes(referenceIds, preserveDifferences, compatibilityConfig) {
  var references = [];
  for (var i = 0; i < (referenceIds || []).length; i++) {
    var reference = figma.getNodeById(referenceIds[i]);
    if (reference && !reference.removed && getPage(reference) && getPage(reference).id === figma.currentPage.id) {
      references.push(reference);
    }
  }
  if (!references.length) throw new Error("Selecione ao menos um elemento válido na página atual.");

  var candidates = getCandidates(
    "page",
    null,
    null,
    !!(compatibilityConfig && compatibilityConfig.includeComponentContents)
  );
  var results = [];
  var featureCache = {};
  var compatibilityFields = exploreSelectedFields(preserveDifferences, compatibilityConfig);
  var compatibilityOptions = exploreCompatibilityOptions(compatibilityConfig);
  var compatibilitySignature = createSignatureCalculator(compatibilityFields, compatibilityOptions);
  var identitySignature = createSignatureCalculator(exploreIdentityFields(), {
    groupNestedVariants: compatibilityOptions.groupNestedVariants
  });
  for (var c = 0; c < candidates.length; c++) {
    var candidate = candidates[c];
    var skip = false;
    for (var r = 0; r < references.length; r++) {
      if (isInsideNode(candidate, references[r])) {
        skip = true;
        break;
      }
    }
    if (skip) continue;

    var best = null;
    var bestReference = null;
    for (var ri = 0; ri < references.length; ri++) {
      var comparison = smartSimilarity(references[ri], candidate, featureCache);
      if (!best || comparison.score > best.score) {
        best = comparison;
        bestReference = references[ri];
      }
    }
    if (best && best.score >= 45) {
      var candidateCompatibility = compatibilitySignature(candidate).compatible;
      var referenceCompatibility = compatibilitySignature(bestReference).compatible;
      var isCompatible = candidateCompatibility === referenceCompatibility;
      results.push({
        id: candidate.id,
        name: candidate.name || "(sem nome)",
        type: candidate.type,
        page: pageName(candidate),
        path: nodePath(candidate),
        score: best.score,
        confidence: best.score >= 90 ? "Muito semelhante" : (best.score >= 70 ? "Semelhante" : "Possível candidato"),
        reasons: best.reasons,
        referenceId: bestReference.id,
        referenceName: bestReference.name || "(sem nome)",
        isCompatible: isCompatible,
        compatibilityDifferences: [],
        _candidateNode: candidate,
        _referenceNode: bestReference,
        duplicateKey: bestReference.id + "|" + identitySignature(candidate).exact
      });
    }
  }
  results.sort(function (a, b) { return b.score - a.score; });
  var visibleResults = results.slice(0, 100);
  for (var visibleIndex = 0; visibleIndex < visibleResults.length; visibleIndex++) {
    var visibleItem = visibleResults[visibleIndex];
    if (!visibleItem.isCompatible) {
      visibleItem.compatibilityDifferences = diffNodes(
        visibleItem._referenceNode,
        visibleItem._candidateNode,
        compatibilityFields,
        visibleItem.name,
        4,
        undefined,
        compatibilityOptions.compareChildren
      );
    }
    delete visibleItem._candidateNode;
    delete visibleItem._referenceNode;
  }
  var duplicateGroups = {};
  for (var d = 0; d < visibleResults.length; d++) {
    var duplicateKey = visibleResults[d].duplicateKey;
    if (!duplicateGroups[duplicateKey]) duplicateGroups[duplicateKey] = [];
    duplicateGroups[duplicateKey].push(visibleResults[d]);
  }
  Object.keys(duplicateGroups).forEach(function (duplicateKey) {
    var duplicateGroup = duplicateGroups[duplicateKey];
    for (var g = 0; g < duplicateGroup.length; g++) {
      duplicateGroup[g].duplicateGroupSize = duplicateGroup.length;
    }
  });
  return visibleResults;
}

// A aba Explorar não passa por uma análise de famílias completa. Ainda assim,
// usamos o mesmo motor de consolidação para manter as validações, a migração
// segura de instâncias e a preservação de overrides consistentes entre as abas.
function exploreCompatibilityOptions(compatibilityConfig) {
  return {
    compareChildren: !compatibilityConfig || compatibilityConfig.structure !== false,
    groupNestedVariants: !!(compatibilityConfig && compatibilityConfig.groupNestedVariants)
  };
}

function compatibilityOptionEnabled(compatibilityConfig, key, fallback) {
  if (!compatibilityConfig || compatibilityConfig[key] === undefined) return fallback;
  return !!compatibilityConfig[key];
}

function exploreIdentityFields() {
  var selected = {};
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    selected[ALL_FIELD_KEYS[i]] = { element: true, children: true };
  }
  return selected;
}

function exploreSelectedFields(preserveDifferences, compatibilityConfig) {
  var selected = {};
  for (var i = 0; i < ALL_FIELD_KEYS.length; i++) {
    var key = ALL_FIELD_KEYS[i];
    selected[key] = { element: false, children: false };
  }

  // Nome, dimensões, aparência, visibilidade e conteúdo de texto são
  // diferenças comuns em candidatos semelhantes e devem poder ser
  // preservados como override da instância.
  var structuralFields = [];
  if (compatibilityOptionEnabled(compatibilityConfig, "dimensions", false)) {
    structuralFields.push("width", "height");
  }
  if (compatibilityOptionEnabled(compatibilityConfig, "layout", true)) {
    structuralFields.push("layoutMode", "layoutWrap");
  }
  if (compatibilityOptionEnabled(compatibilityConfig, "fills", false)) structuralFields.push("fills");
  if (compatibilityOptionEnabled(compatibilityConfig, "strokes", false)) structuralFields.push("strokes");
  if (compatibilityOptionEnabled(compatibilityConfig, "effects", false)) structuralFields.push("effects");
  if (compatibilityOptionEnabled(compatibilityConfig, "vector", !preserveDifferences)) structuralFields.push("vectorNetwork");
  if (compatibilityOptionEnabled(compatibilityConfig, "text", false)) structuralFields.push("characters");
  if (compatibilityOptionEnabled(compatibilityConfig, "visibility", false)) structuralFields.push("visible");
  if (compatibilityOptionEnabled(compatibilityConfig, "rotation", false)) structuralFields.push("rotation");
  for (var e = 0; e < structuralFields.length; e++) {
    selected[structuralFields[e]].element = true;
    selected[structuralFields[e]].children = true;
  }
  return selected;
}

function consolidateSimilar(items, optionsConfig) {
  var unique = {};
  var grouped = {};
  var selectedItems = Array.isArray(items) ? items : [];
  var compatibilityConfig = optionsConfig && optionsConfig.similarCompatibility;
  var compatibilityOptions = exploreCompatibilityOptions(compatibilityConfig);
  var fields = exploreSelectedFields(!!(optionsConfig && optionsConfig.preserveOverrides), compatibilityConfig);

  figma.ui.postMessage({
    type: "log",
    text: "Explorar: recebidos " + selectedItems.length + " candidato(s) selecionado(s)."
  });

  var hasIncompatibleCandidate = false;
  var signatureFor = createSignatureCalculator(fields, compatibilityOptions);
  // A assinatura usada para deduplicar variantes precisa conter exatamente os
  // critérios usados na validação. Caso contrário, candidatos diferentes em
  // um critério (por exemplo, fills) podem ser agrupados como uma única
  // variante e falhar no preflight seguinte.
  var variantIdentitySignature = createSignatureCalculator(fields, compatibilityOptions);

  for (var i = 0; i < selectedItems.length; i++) {
    var item = selectedItems[i];
    if (item && item.id && unique[item.id]) continue;
    if (!item || !item.id || !item.referenceId) {
      hasIncompatibleCandidate = true;
      continue;
    }
    var candidate = figma.getNodeById(item.id);
    var reference = figma.getNodeById(item.referenceId);
    if (!candidate || candidate.removed || !reference || reference.removed) {
      hasIncompatibleCandidate = true;
      continue;
    }
    if (candidate.id === reference.id || isInsideNode(candidate, reference)) {
      hasIncompatibleCandidate = true;
      continue;
    }

    // Uma diferença estrutural pode ser consolidada como variante. Se o item
    // incompatível continuar configurado como cópia, a operação inteira deve
    // ser protegida para não misturar migrações parciais.
    var candidateIsCompatible = signatureFor(candidate).compatible === signatureFor(reference).compatible;
    if (!candidateIsCompatible && !item.asVariant) {
      hasIncompatibleCandidate = true;
      var differences = diffNodes(reference, candidate, fields, candidate.name, 4, undefined, compatibilityOptions.compareChildren);
      figma.ui.postMessage({
        type: "log",
        text: "⚠️ Candidato incompatível encontrado: " + candidate.name +
          (differences.length ? "\n" + differences.map(function (difference) { return "   • " + difference; }).join("\n") : "")
      });
      continue;
    }

    unique[candidate.id] = true;
    if (!grouped[reference.id]) {
      grouped[reference.id] = {
        name: reference.name || "Componente explorado",
        source: reference,
        copies: [],
        variants: []
      };
    }
    if (item.asVariant) grouped[reference.id].variants.push(candidate);
    else grouped[reference.id].copies.push(candidate);
  }

  if (hasIncompatibleCandidate) {
    figma.ui.postMessage({
      type: "error",
      text: "Operação protegida: há candidato(s) incompatível(is) configurado(s) como cópia. Marque-os como variante ou remova-os da seleção."
    });
    figma.ui.postMessage({
      type: "done",
      dryRun: false,
      aborted: true,
      totals: {
        componentsCreated: 0,
        instancesInserted: 0,
        redirected: 0,
        componentsRemoved: 0,
        skipped: 0,
        protected: selectedItems.length
      }
    });
    return;
  }

  var plans = [];
  var referenceIds = Object.keys(grouped);
  for (var r = 0; r < referenceIds.length; r++) {
    var group = grouped[referenceIds[r]];
    if (!group.copies.length && !group.variants.length) continue;
    var variantsBySignature = {};
    var uniqueVariants = [];
    for (var uniqueVariantIndex = 0; uniqueVariantIndex < group.variants.length; uniqueVariantIndex++) {
      var variantCandidate = group.variants[uniqueVariantIndex];
      var variantSignature = variantIdentitySignature(variantCandidate).exact;
      var variantGroup = variantsBySignature[variantSignature];
      if (!variantGroup) {
        variantGroup = { source: variantCandidate, copies: [] };
        variantsBySignature[variantSignature] = variantGroup;
        uniqueVariants.push(variantGroup);
      } else {
        variantGroup.copies.push(variantCandidate);
      }
    }

    var planVariants = [{
      variantStr: "Property 1=Default",
      sourceId: group.source.id,
      sourceType: group.source.type === "COMPONENT" ? "loose" : "common",
      sourceName: group.source.name,
      sourcePage: pageName(group.source),
      sourcePath: nodePath(group.source),
      copies: group.copies.map(function (node) {
        return {
          id: node.id,
          type: node.type,
          name: node.name,
          page: pageName(node),
          path: nodePath(node),
          isComponent: node.type === "COMPONENT",
          isCompatible: true
        };
      })
    }];

    var variantNameCounts = { "Default": 1 };
    for (var vi = 0; vi < uniqueVariants.length; vi++) {
      var variantGroup = uniqueVariants[vi];
      var variantNode = variantGroup.source;
      var variantName = variantNode.name || "Variante";
      var variantNameKey = variantName;
      var variantNameCount = variantNameCounts[variantNameKey] || 0;
      variantNameCounts[variantNameKey] = variantNameCount + 1;
      if (variantNameCount > 0) variantName += " (" + (variantNameCount + 1) + ")";
      planVariants.push({
        variantStr: "Property 1=" + variantName,
        sourceId: variantNode.id,
        sourceType: variantNode.type === "COMPONENT" ? "loose" : "common",
        sourceName: variantNode.name,
        sourcePage: pageName(variantNode),
        sourcePath: nodePath(variantNode),
        copies: variantGroup.copies.map(function (node) {
          return {
            id: node.id,
            type: node.type,
            name: node.name,
            page: pageName(node),
            path: nodePath(node),
            isComponent: node.type === "COMPONENT",
            isCompatible: false
          };
        })
      });
    }

    plans.push({
      name: group.name,
      maxDepth: nodeDepth(group.source),
      variants: planVariants
    });
  }

  if (!plans.length) {
    figma.ui.postMessage({ type: "error", text: "Nenhum candidato válido foi selecionado para consolidar." });
    return;
  }

  figma.ui.postMessage({
    type: "log",
    text: "Explorar: executando " + plans.length + " plano(s) de consolidação."
  });

  lastAnalysisCriteriaKey = analysisCriteriaKey(fields, optionsConfig);
  // A exploração já possui sua própria lista de candidatos e não deve exigir
  // uma análise prévia feita na outra aba para poder aplicar o plano.
  return consolidate(false, plans, fields, optionsConfig, true);
}

function getPage(node) {
  var current = node;
  while (current && current.type !== "PAGE") current = current.parent;
  return current;
}

function absolutePosition(node) {
  try {
    return { x: node.absoluteTransform[0][2], y: node.absoluteTransform[1][2] };
  } catch (error) {
    return { x: node.x || 0, y: node.y || 0 };
  }
}

// Propriedades que podem existir como overrides em subcamadas de uma
// instância. Algumas não são editáveis em todos os tipos de nó; cada escrita
// é protegida individualmente para que uma propriedade não impeça as demais.
var OVERRIDE_FIELDS = [
  "visible", "opacity", "blendMode", "fills", "strokes", "effects",
  "vectorNetwork",
  "x", "y", "width", "height", "rotation", "constraints",
  "layoutAlign", "layoutGrow", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "layoutSizingHorizontal", "layoutSizingVertical", "layoutPositioning",
  "layoutMode", "layoutWrap", "primaryAxisAlignItems", "counterAxisAlignItems",
  "itemSpacing", "counterAxisSpacing", "paddingTop", "paddingRight",
  "paddingBottom", "paddingLeft", "clipsContent", "strokeWeight", "strokeAlign",
  "dashPattern", "cornerRadius", "topLeftRadius", "topRightRadius",
  "bottomLeftRadius", "bottomRightRadius", "fontName", "fontSize",
  "letterSpacing", "lineHeight", "paragraphIndent", "paragraphSpacing",
  "textCase", "textDecoration", "openTypeFeatures", "characters"
];

var CLEANUP_APPEARANCE_FIELDS = [
  "opacity", "blendMode", "fills", "strokes", "effects"
];
var CLEANUP_SHAPE_FIELDS = [
  "vectorNetwork", "strokeWeight", "strokeAlign", "dashPattern",
  "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius",
  "bottomRightRadius"
];
var CLEANUP_DIMENSION_FIELDS = [
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "layoutSizingHorizontal", "layoutSizingVertical"
];
var CLEANUP_LAYOUT_FIELDS = [
  "layoutAlign", "layoutGrow", "layoutPositioning", "layoutMode", "layoutWrap",
  "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing",
  "counterAxisSpacing", "paddingTop", "paddingRight", "paddingBottom",
  "paddingLeft", "clipsContent"
];

function cleanupFieldIsKept(field, config) {
  if (config.keepAppearance && CLEANUP_APPEARANCE_FIELDS.indexOf(field) >= 0) return true;
  if (config.keepShape && CLEANUP_SHAPE_FIELDS.indexOf(field) >= 0) return true;
  if (config.keepDimensions && CLEANUP_DIMENSION_FIELDS.indexOf(field) >= 0) return true;
  if (config.keepLayout && CLEANUP_LAYOUT_FIELDS.indexOf(field) >= 0) return true;
  if (config.keepVisibility && field === "visible") return true;
  if (config.keepRotation && field === "rotation") return true;
  return false;
}

function readNodeProperty(node, field) {
  try { return node[field]; } catch (error) { return undefined; }
}

function readVariantPropertiesSafely(node) {
  try {
    return node && node.variantProperties ? node.variantProperties : {};
  } catch (error) {
    // Component Sets com erro interno podem lançar ao acessar esta API.
    // A análise continua sem os nomes das variantes.
    return {};
  }
}

function sameComparableValue(valueA, valueB) {
  try {
    return JSON.stringify(normalizeComparableValue(valueA)) === JSON.stringify(normalizeComparableValue(valueB));
  } catch (error) {
    return valueA === valueB;
  }
}

function collectFonts(fonts, node) {
  if (!node || node.type !== "TEXT") return;
  var font = readNodeProperty(node, "fontName");
  if (!font || typeof font !== "object" || !font.family || !font.style) return;
  fonts[font.family + "\u0000" + font.style] = font;
}

function readComponentPropertyValues(node) {
  if (!node || node.type !== "INSTANCE") return null;
  var values = {};

  try {
    var properties = node.componentProperties;
    if (properties) {
      var keys = Object.keys(properties);
      for (var i = 0; i < keys.length; i++) {
        values[keys[i]] = {
          type: properties[keys[i]].type,
          value: properties[keys[i]].value
        };
      }
    }
  } catch (error) {}

  // Compatibilidade com documentos/API que ainda expõem variantes apenas
  // pelo campo legado variantProperties.
  try {
    var variants = node.variantProperties;
    if (variants) {
      var variantKeys = Object.keys(variants);
      for (var v = 0; v < variantKeys.length; v++) {
        if (!values[variantKeys[v]]) {
          values[variantKeys[v]] = {
            type: "VARIANT",
            value: variants[variantKeys[v]]
          };
        }
      }
    }
  } catch (error) {}

  return Object.keys(values).length ? values : null;
}

function componentPropertyBaseName(propertyName) {
  return String(propertyName || "").split("#")[0];
}

function findTargetComponentProperty(target, sourcePropertyName, sourceProperty) {
  var targetProperties = null;
  try { targetProperties = target.componentProperties; } catch (error) {}
  if (!targetProperties) return null;

  if (targetProperties[sourcePropertyName]) return sourcePropertyName;

  var sourceBaseName = componentPropertyBaseName(sourcePropertyName);
  var targetKeys = Object.keys(targetProperties);
  for (var i = 0; i < targetKeys.length; i++) {
    var targetKey = targetKeys[i];
    var targetProperty = targetProperties[targetKey];
    if (componentPropertyBaseName(targetKey) !== sourceBaseName) continue;
    if (!sourceProperty || !sourceProperty.type || !targetProperty || targetProperty.type === sourceProperty.type) {
      return targetKey;
    }
  }
  return null;
}

function captureOverrideDifferences(reference, original, options) {
  var snapshot = { items: [], fonts: {} };
  var config = options || {};

  function walk(referenceNode, originalNode, path) {
    if (!originalNode) return;
    collectFonts(snapshot.fonts, originalNode);

    var values = {};
    for (var i = 0; i < OVERRIDE_FIELDS.length; i++) {
      var field = OVERRIDE_FIELDS[i];
      if (config.skipFields && config.skipFields[field]) continue;
      if (path.length === 0 && config.skipRootFields && config.skipRootFields[field]) continue;
      if (field === "characters" && originalNode.type !== "TEXT") continue;

      var originalValue = readNodeProperty(originalNode, field);
      if (originalValue === undefined) continue;
      var referenceValue = readNodeProperty(referenceNode, field);
      if (!sameComparableValue(referenceValue, originalValue)) {
        values[field] = originalValue;
      }
    }

    var componentProperties = readComponentPropertyValues(originalNode);
    var nestedMainComponent = null;
    if ((path.length > 0 || config.includeRootMainComponent) && originalNode.type === "INSTANCE") {
      try {
        var originalMainComponent = originalNode.mainComponent;
        var referenceMainComponent = referenceNode && referenceNode.type === "INSTANCE"
          ? referenceNode.mainComponent
          : null;
        if (originalMainComponent && (!referenceMainComponent || originalMainComponent.id !== referenceMainComponent.id) &&
            (path.length > 0 || config.includeRootMainComponent)) {
          nestedMainComponent = originalMainComponent;
        }
      } catch (error) {}
    }

    if (Object.keys(values).length > 0 || componentProperties || nestedMainComponent) {
      snapshot.items.push({
        path: path.slice(),
        values: values,
        componentProperties: componentProperties,
        mainComponent: nestedMainComponent
      });
    }

    var referenceChildren = [];
    var originalChildren = [];
    try { if (referenceNode && referenceNode.children) referenceChildren = referenceNode.children; } catch (error) {}
    try { if (originalNode.children) originalChildren = originalNode.children; } catch (error) {}
    var childCount = Math.min(referenceChildren.length, originalChildren.length);
    for (var c = 0; c < childCount; c++) {
      walk(referenceChildren[c], originalChildren[c], path.concat(c));
    }
  }

  walk(reference, original, []);
  return snapshot;
}

async function loadOverrideFonts(fonts, log) {
  var keys = Object.keys(fonts || {});
  for (var i = 0; i < keys.length; i++) {
    try {
      await figma.loadFontAsync(fonts[keys[i]]);
    } catch (error) {
      if (log) log("⚠️ Não foi possível carregar a fonte do override: " + error.message);
    }
  }
}

function nodeAtPath(root, path) {
  var current = root;
  for (var i = 0; i < path.length; i++) {
    try {
      if (!current || !current.children || !current.children[path[i]]) return null;
      current = current.children[path[i]];
    } catch (error) {
      return null;
    }
  }
  return current;
}

function indexPathFromAncestor(node, ancestor) {
  var path = [];
  var current = node;
  while (current && current !== ancestor) {
    var parent = current.parent;
    if (!parent || !parent.children) return null;
    var index = -1;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === current.id) {
        index = i;
        break;
      }
    }
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === ancestor ? path : null;
}

function owningComponent(node) {
  var current = node;
  while (current && current.type !== "DOCUMENT") {
    if (current.type === "COMPONENT") return current;
    current = current.parent;
  }
  return null;
}

function addPrefixedSnapshot(target, source, prefix) {
  if (!source) return;
  var fontKeys = Object.keys(source.fonts || {});
  for (var f = 0; f < fontKeys.length; f++) {
    target.fonts[fontKeys[f]] = source.fonts[fontKeys[f]];
  }
  for (var i = 0; i < (source.items || []).length; i++) {
    var item = source.items[i];
    target.items.push({
      path: prefix.concat(item.path || []),
      values: item.values || {},
      componentProperties: item.componentProperties || null,
      mainComponent: item.mainComponent || null
    });
  }
}

function captureParentInstanceOverrides(parentComponent, groupNodes) {
  var migrations = [];
  if (!parentComponent) return migrations;

  var instanceIndex = instancesByMainComponent().index;
  var parentInstances = instanceIndex[parentComponent.id] || [];
  for (var i = 0; i < parentInstances.length; i++) {
    var parentInstance = parentInstances[i];
    var snapshot = { items: [], fonts: {} };
    for (var n = 0; n < groupNodes.length; n++) {
      var oldPath = indexPathFromAncestor(groupNodes[n], parentComponent);
      if (!oldPath) continue;
      var instanceNode = nodeAtPath(parentInstance, oldPath);
      if (!instanceNode) continue;
      var nodeSnapshot = captureOverrideDifferences(
        groupNodes[n],
        instanceNode,
        {
          includeRootMainComponent: true,
          // A selected child will be reparented into the new component. Its
          // old x/y belonged to the button, so carrying those coordinates
          // into the new component would move it incorrectly.
          skipFields: { x: true, y: true }
        }
      );
      var prefix = groupNodes.length === 1 ? [] : [n];
      addPrefixedSnapshot(snapshot, nodeSnapshot, prefix);
    }
    if (snapshot.items.length) {
      migrations.push({ instance: parentInstance, snapshot: snapshot });
    }
  }
  return migrations;
}

async function applyParentInstanceOverrides(migrations, sharedComponent) {
  for (var i = 0; i < migrations.length; i++) {
    var migration = migrations[i];
    var nestedInstances = [];
    try {
      nestedInstances = migration.instance.findAll(function (node) {
        if (node.type !== "INSTANCE") return false;
        try {
          return node.mainComponent && node.mainComponent.id === sharedComponent.id;
        } catch (error) {
          return false;
        }
      });
    } catch (error) {}
    if (!nestedInstances.length) continue;
    await applyOverrideSnapshot(nestedInstances[0], migration.snapshot, function (text) {
      figma.ui.postMessage({ type: "log", text: text });
    });
  }
}

async function applyOverrideSnapshot(instance, snapshot, log) {
  if (!snapshot || !snapshot.items || snapshot.items.length === 0) return;
  await loadOverrideFonts(snapshot.fonts, log);

  for (var i = 0; i < snapshot.items.length; i++) {
    var item = snapshot.items[i];
    var target = nodeAtPath(instance, item.path);
    if (!target) {
      if (log) log("⚠️ Subcamada do override não encontrada no novo componente.");
      continue;
    }

    if (item.mainComponent && target.type === "INSTANCE") {
      try {
        if (target.swapComponent) {
          target.swapComponent(item.mainComponent);
        } else {
          // Fallback para versões/API mocks que ainda permitem a atribuição
          // direta; no Figma atual, swapComponent é o caminho suportado.
          target.mainComponent = item.mainComponent;
        }
      } catch (error) {
        if (log) log("⚠️ Não foi possível preservar a variante/componente interno: " + error.message);
      }
    }

    var fields = Object.keys(item.values || {});
    for (var f = 0; f < fields.length; f++) {
      var field = fields[f];
      try {
        if (field === "characters" && target.type !== "TEXT") continue;
        if (field === "vectorNetwork" && target.setVectorNetworkAsync) {
          await target.setVectorNetworkAsync(item.values[field]);
        } else if (field === "vectorNetwork" && target.setVectorNetwork) {
          target.setVectorNetwork(item.values[field]);
        } else {
          target[field] = item.values[field];
        }
      } catch (error) {
        // Nem toda propriedade é sobrescrevível em toda subcamada. Isso é
        // esperado para alguns campos de layout/geometry do Figma.
      }
    }

    if (item.componentProperties && target.type === "INSTANCE" && target.setProperties) {
      var propertyNames = Object.keys(item.componentProperties);
      for (var p = 0; p < propertyNames.length; p++) {
        var sourcePropertyName = propertyNames[p];
        var sourceProperty = item.componentProperties[sourcePropertyName];
        var propertyValue = sourceProperty && Object.prototype.hasOwnProperty.call(sourceProperty, "value")
          ? sourceProperty.value
          : sourceProperty;
        var propertyName = findTargetComponentProperty(target, sourcePropertyName, sourceProperty) || sourcePropertyName;
        var property = {};
        property[propertyName] = propertyValue;
        try {
          target.setProperties(property);
        } catch (error) {
          if (log) {
            log("⚠️ Não foi possível preservar a configuração \"" + sourcePropertyName + "\": " + error.message);
          }
        }
      }
    }
  }
}

async function preserveNodeDifferences(reference, original, instance, log) {
  var snapshot = captureOverrideDifferences(reference, original);
  await applyOverrideSnapshot(instance, snapshot, log);
}

async function insertInstanceReplacing(source, component, preserveOverrides, reference) {
  var parent = source.parent;
  if (!parent || !parent.insertChild) throw new Error("Elemento sem contêiner editável.");
  var siblings = parent.children || [];
  var index = 0;
  for (var i = 0; i < siblings.length; i++) if (siblings[i].id === source.id) { index = i; break; }
  var x = source.x;
  var y = source.y;
  var width = source.width;
  var height = source.height;
  var rotation = source.rotation;
  var visible = source.visible;
  var instance = component.createInstance();
  parent.insertChild(index, instance);
  try { instance.resizeWithoutConstraints(width, height); } catch (error) { try { instance.resize(width, height); } catch (resizeError) {} }
  try { instance.x = x; instance.y = y; } catch (error) {}
  try { instance.rotation = rotation; instance.visible = visible; } catch (error) {}
  
  if (preserveOverrides) {
    await preserveNodeDifferences(reference || source, source, instance, function (text) {
      // O callback é deliberadamente local para manter os avisos no log da UI.
      figma.ui.postMessage({ type: "log", text: text });
    });
  }

  try {
    source.remove();
  } catch (error) {
    try { instance.remove(); } catch (cleanupError) {}
    throw error;
  }
  return instance;
}

function componentFamilyId(component) {
  if (!component) return null;
  return component.parent && component.parent.type === "COMPONENT_SET"
    ? component.parent.id
    : component.id;
}

function sameComponentFamily(componentA, componentB) {
  return !!componentA && !!componentB && componentFamilyId(componentA) === componentFamilyId(componentB);
}

function isDescendantOfNode(node, ancestor) {
  var current = node && node.parent;
  while (current && current.type !== "DOCUMENT") {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function nodeStillExists(node) {
  if (!node || !node.id) return false;
  try {
    return !!figma.getNodeById(node.id);
  } catch (error) {
    return false;
  }
}

function findNestedSourceInstance(wrapperComponent, sourceComponent) {
  var nested = [];
  try {
    nested = wrapperComponent.findAll(function (node) {
      return node.type === "INSTANCE" && sameComponentFamily(node.mainComponent, sourceComponent);
    });
  } catch (error) {}
  if (!nested.length) return null;

  for (var i = 0; i < nested.length; i++) {
    try {
      if (nested[i].mainComponent && nested[i].mainComponent.id === sourceComponent.id) return nested[i];
    } catch (error) {}
  }
  return nested[0];
}

async function replaceInstanceWithWrapper(sourceInstance, sourceComponent, targetComponent, preserveOverrides) {
  var parent = sourceInstance.parent;
  if (!parent || !parent.insertChild || parent.type === "INSTANCE") {
    throw new Error("A instância está dentro de uma estrutura não editável.");
  }

  var sourceMain = null;
  try { sourceMain = sourceInstance.mainComponent; } catch (error) {}
  if (!sourceMain) throw new Error("A instância de origem não possui componente mestre.");

  var snapshot = null;
  if (preserveOverrides) {
    snapshot = captureOverrideDifferences(sourceMain, sourceInstance, {
      // A posição e o tamanho da instância antiga pertencem ao uso externo.
      // Eles serão aplicados ao wrapper, não ao botão interno.
      skipRootFields: {
        x: true, y: true, width: true, height: true, rotation: true,
        visible: true, layoutAlign: true, layoutGrow: true,
        layoutSizingHorizontal: true, layoutSizingVertical: true,
        layoutPositioning: true
      }
    });
  }

  var siblings = parent.children || [];
  var index = 0;
  for (var i = 0; i < siblings.length; i++) {
    if (siblings[i].id === sourceInstance.id) { index = i; break; }
  }

  var x = sourceInstance.x;
  var y = sourceInstance.y;
  var width = sourceInstance.width;
  var height = sourceInstance.height;
  var rotation = sourceInstance.rotation;
  var visible = sourceInstance.visible;
  var wrapperInstance = targetComponent.createInstance();
  parent.insertChild(index, wrapperInstance);

  try {
    try { wrapperInstance.resizeWithoutConstraints(width, height); } catch (error) { try { wrapperInstance.resize(width, height); } catch (resizeError) {} }
    try { wrapperInstance.x = x; wrapperInstance.y = y; } catch (error) {}
    try { wrapperInstance.rotation = rotation; wrapperInstance.visible = visible; } catch (error) {}

    var nestedSourceInstance = findNestedSourceInstance(wrapperInstance, sourceComponent);
    if (!nestedSourceInstance) {
      throw new Error("O componente destino não contém uma instância do componente de origem.");
    }

    // Seleciona a mesma variante/componente filho usada pela instância antiga.
    nestedSourceInstance.swapComponent(sourceMain);
    if (snapshot) {
      await applyOverrideSnapshot(nestedSourceInstance, snapshot, function (text) {
        figma.ui.postMessage({ type: "log", text: text });
      });
    }
    sourceInstance.remove();
    return wrapperInstance;
  } catch (error) {
    try { wrapperInstance.remove(); } catch (cleanupError) {}
    throw error;
  }
}

async function replaceInstancesWithWrapper(sourceIds, targetId, scope, preserveOverrides) {
  if (!Array.isArray(sourceIds)) sourceIds = sourceIds ? [sourceIds] : [];
  if (!sourceIds.length) throw new Error("Nenhuma origem foi definida.");

  var targetNode = figma.getNodeById(targetId);
  if (!targetNode) throw new Error("O destino não foi encontrado.");

  var targetComponent = targetNode.type === "INSTANCE" ? targetNode.mainComponent : targetNode;
  var sourceComponents = [];
  var sourceComponentIds = {};
  var sourceFamily = null;
  for (var s = 0; s < sourceIds.length; s++) {
    var sourceNode = figma.getNodeById(sourceIds[s]);
    if (!sourceNode) throw new Error("Uma das origens não foi encontrada.");
    var sourceComponent = sourceNode.type === "INSTANCE" ? sourceNode.mainComponent : sourceNode;
    if (!sourceComponent || sourceComponent.type !== "COMPONENT") {
      throw new Error("Todas as origens precisam ser componentes ou instâncias com componente mestre.");
    }
    var currentFamily = componentFamilyId(sourceComponent);
    if (sourceFamily && sourceFamily !== currentFamily) {
      throw new Error("As origens precisam pertencer à mesma família de componentes/variantes.");
    }
    sourceFamily = currentFamily;
    if (!sourceComponentIds[sourceComponent.id]) {
      sourceComponentIds[sourceComponent.id] = true;
      sourceComponents.push(sourceComponent);
    }
  }
  if (!targetComponent || targetComponent.type !== "COMPONENT") {
    throw new Error("O destino precisa ser um componente ou uma instância com componente mestre.");
  }
  if (sameComponentFamily(sourceComponents[0], targetComponent)) {
    throw new Error("A origem e o destino pertencem ao mesmo componente/família.");
  }
  for (var sc = 0; sc < sourceComponents.length; sc++) {
    if (isDescendantOfNode(sourceComponents[sc], targetComponent)) {
      throw new Error("Um componente de origem está dentro do destino; ele deve ser apenas o componente filho do wrapper.");
    }
  }

  var indexedInstances = instancesByMainComponent().index;
  var allInstances = [];
  var instanceIds = {};
  for (var si = 0; si < sourceComponents.length; si++) {
    var sourceInstances = indexedInstances[sourceComponents[si].id] || [];
    for (var ii = 0; ii < sourceInstances.length; ii++) {
      if (instanceIds[sourceInstances[ii].id]) continue;
      instanceIds[sourceInstances[ii].id] = true;
      allInstances.push(sourceInstances[ii]);
    }
  }
  var replaced = [];
  var errors = [];
  var currentPageId = figma.currentPage.id;
  for (var i = 0; i < allInstances.length; i++) {
    var instance = allInstances[i];
    // Trocar uma instância dentro de um componente mestre pode atualizar e
    // remover instâncias derivadas que já estavam no índice inicial.
    if (!nodeStillExists(instance)) continue;
    var page = null;
    try { page = getPage(instance); } catch (error) { continue; }
    if (scope === "page" && (!page || page.id !== currentPageId)) continue;
    // Instâncias dentro de outra instância são atualizadas pelo mestre externo
    // e não podem ser editadas estruturalmente de forma independente.
    if (hasInstanceAncestor(instance) || isDescendantOfNode(instance, targetComponent)) continue;
    try {
      replaced.push(await replaceInstanceWithWrapper(instance, sourceComponents[0], targetComponent, preserveOverrides));
    } catch (error) {
      errors.push((instance.name || instance.id) + ": " + error.message);
    }
  }

  if (!replaced.length) {
    throw new Error("Nenhuma instância foi substituída. " + (errors.join(" ") || "Nenhuma instância elegível encontrada."));
  }

  var currentPageReplaced = replaced.filter(function (node) {
    var page = getPage(node);
    return page && page.id === currentPageId;
  });
  try { figma.currentPage.selection = currentPageReplaced; } catch (error) {}
  if (currentPageReplaced.length) figma.viewport.scrollAndZoomIntoView(currentPageReplaced);
  figma.ui.postMessage({
    type: "replace-instances-done",
    replaced: replaced.length,
    skipped: errors.length,
    errors: errors
  });
  figma.notify(replaced.length + (replaced.length === 1 ? " instância substituída." : " instâncias substituídas."));
}

function mergeOverrideSnapshots(baseSnapshot, overrideSnapshot) {
  var result = { items: [], fonts: {} };
  var itemIndexes = {};

  function addSnapshot(snapshot) {
    if (!snapshot) return;

    var fontKeys = Object.keys(snapshot.fonts || {});
    for (var f = 0; f < fontKeys.length; f++) {
      result.fonts[fontKeys[f]] = snapshot.fonts[fontKeys[f]];
    }

    var items = snapshot.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemKey = JSON.stringify(item.path || []);
      var index = itemIndexes[itemKey];
      if (index === undefined) {
        result.items.push({
          path: (item.path || []).slice(),
          values: Object.assign({}, item.values || {}),
          componentProperties: item.componentProperties,
          mainComponent: item.mainComponent || null
        });
        itemIndexes[itemKey] = result.items.length - 1;
        continue;
      }

      var merged = result.items[index];
      Object.assign(merged.values, item.values || {});
      if (item.componentProperties) merged.componentProperties = item.componentProperties;
      if (item.mainComponent) merged.mainComponent = item.mainComponent;
    }
  }

  // As diferenças do original têm prioridade sobre as diferenças do master
  // base, pois representam overrides específicos daquela instância.
  addSnapshot(baseSnapshot);
  addSnapshot(overrideSnapshot);
  return result;
}

async function redirectInstances(instances, target, dryRun, log, preserveOverrides, masterSnapshotCache) {
  var result = { redirected: 0, failed: 0 };
  for (var i = 0; i < instances.length; i++) {
    if (dryRun) { result.redirected++; continue; }
    var instance = instances[i];
    var snapshot = null;
    if (preserveOverrides) {
      try {
        var oldMain = instance.mainComponent;
        if (oldMain) {
          var masterDifferences = null;
          if (target) {
            var snapshotKey = target.id + "|" + oldMain.id;
            if (masterSnapshotCache && Object.prototype.hasOwnProperty.call(masterSnapshotCache, snapshotKey)) {
              masterDifferences = masterSnapshotCache[snapshotKey];
            } else {
              masterDifferences = captureOverrideDifferences(target, oldMain);
              if (masterSnapshotCache) masterSnapshotCache[snapshotKey] = masterDifferences;
            }
          }
          var instanceDifferences = captureOverrideDifferences(oldMain, instance);
          snapshot = mergeOverrideSnapshots(masterDifferences, instanceDifferences);
        }
      } catch (error) {}
    }
    try {
      instance.swapComponent(target);
      if (snapshot) await applyOverrideSnapshot(instance, snapshot, log);
      result.redirected++;
    } catch (error) {
      result.failed++;
      log("    Erro ao redirecionar instância " + instance.id + ": " + error.message);
    }
  }
  return result;
}

// --- Limpeza seletiva de instâncias ---
// A limpeza usa removeOverrides() como operação base e reaplica somente as
// diferenças que o usuário escolheu manter. Assim, valores herdados do antigo
// componente mestre deixam de ficar presos na instância.
function captureCleanupDifferences(reference, original, options) {
  var config = options || {};
  var snapshot = { items: [], fonts: {} };

  function walk(referenceNode, originalNode, path) {
    if (!originalNode) return;

    var values = {};
    for (var i = 0; i < OVERRIDE_FIELDS.length; i++) {
      var field = OVERRIDE_FIELDS[i];
      if (field === "characters" || !cleanupFieldIsKept(field, config)) continue;
      var originalValue = readNodeProperty(originalNode, field);
      if (originalValue === undefined) continue;
      var referenceValue = readNodeProperty(referenceNode, field);
      if (!sameComparableValue(referenceValue, originalValue)) {
        values[field] = originalValue;
      }
    }

    if (config.keepText && originalNode.type === "TEXT") {
      var originalCharacters = readNodeProperty(originalNode, "characters");
      var referenceCharacters = readNodeProperty(referenceNode, "characters");
      if (originalCharacters !== undefined && !sameComparableValue(referenceCharacters, originalCharacters)) {
        values.characters = originalCharacters;
        collectFonts(snapshot.fonts, originalNode);
        // Depois do reset o texto volta à fonte do pai; ela também precisa
        // estar carregada quando o conteúdo preservado for reaplicado.
        collectFonts(snapshot.fonts, referenceNode);
      }
    }

    var componentProperties = null;
    if (config.keepComponentProperties && originalNode.type === "INSTANCE") {
      componentProperties = readComponentPropertyValues(originalNode);
    }

    var nestedMainComponent = null;
    if (config.keepNestedVariants && path.length > 0 && originalNode.type === "INSTANCE") {
      try {
        var originalMainComponent = originalNode.mainComponent;
        var referenceMainComponent = referenceNode && referenceNode.type === "INSTANCE"
          ? referenceNode.mainComponent
          : null;
        if (originalMainComponent && (!referenceMainComponent || originalMainComponent.id !== referenceMainComponent.id)) {
          nestedMainComponent = originalMainComponent;
        }
      } catch (error) {}
    }

    if (Object.keys(values).length > 0 || componentProperties || nestedMainComponent) {
      snapshot.items.push({
        path: path.slice(),
        values: values,
        componentProperties: componentProperties,
        mainComponent: nestedMainComponent
      });
    }

    var referenceChildren = [];
    var originalChildren = [];
    try { if (referenceNode && referenceNode.children) referenceChildren = referenceNode.children; } catch (error) {}
    try { if (originalNode.children) originalChildren = originalNode.children; } catch (error) {}
    var childCount = Math.min(referenceChildren.length, originalChildren.length);
    for (var c = 0; c < childCount; c++) {
      walk(referenceChildren[c], originalChildren[c], path.concat(c));
    }
  }

  walk(reference, original, []);
  return snapshot;
}

function cleanupParentSummary(component) {
  var counts = instancesByMainComponent().index[component.id] || [];
  var currentPageCount = 0;
  for (var i = 0; i < counts.length; i++) {
    var page = getPage(counts[i]);
    if (page && page.id === figma.currentPage.id) currentPageCount++;
  }
  return {
    id: component.id,
    name: component.name || "(sem nome)",
    type: component.type,
    family: component.parent && component.parent.type === "COMPONENT_SET" ? component.parent.name : "",
    page: pageName(component),
    path: nodePath(component),
    instances: counts.length,
    instancesOnCurrentPage: currentPageCount
  };
}

function componentPropertiesDiffer(referenceNode, originalNode) {
  if (!referenceNode || referenceNode.type !== "INSTANCE" || !originalNode || originalNode.type !== "INSTANCE") {
    return false;
  }
  var originalProperties = readComponentPropertyValues(originalNode);
  var referenceProperties = readComponentPropertyValues(referenceNode);
  if (!originalProperties) return false;

  var names = Object.keys(originalProperties);
  for (var i = 0; i < names.length; i++) {
    var sourceName = names[i];
    var sourceProperty = originalProperties[sourceName];
    var targetName = findTargetComponentProperty(referenceNode, sourceName, sourceProperty);
    if (!targetName || !referenceProperties || !referenceProperties[targetName]) return true;
    if (!sameComparableValue(
      referenceProperties[targetName].value,
      sourceProperty && sourceProperty.value
    )) return true;
  }
  return false;
}

function cleanupDifferenceSummary(reference, original, options) {
  var config = options || {};
  var labels = {};

  function addLabel(label) { labels[label] = true; }

  function labelForField(field) {
    if (field === "characters") return "Texto";
    if (field === "width" || field === "height" ||
        field === "layoutSizingHorizontal" || field === "layoutSizingVertical") return "Dimensões / Fill / Hug";
    if (field === "fills" || field === "strokes" || field === "effects" || field === "vectorNetwork") return "Aparência";
    if (field.indexOf("layout") === 0 || field.indexOf("padding") === 0 ||
        field === "itemSpacing" || field === "counterAxisSpacing" ||
        field === "primaryAxisAlignItems" || field === "counterAxisAlignItems") return "Layout";
    return field;
  }

  function walk(referenceNode, originalNode, path) {
    if (!originalNode) return;
    for (var i = 0; i < OVERRIDE_FIELDS.length; i++) {
      var field = OVERRIDE_FIELDS[i];
      // A posição absoluta pertence ao contexto onde a instância foi usada;
      // compará-la com x/y do componente pai faria todas as instâncias
      // parecerem divergentes.
      if (field === "x" || field === "y") continue;
      if (field === "characters" && config.keepText) continue;
      if (field === "characters" && originalNode.type !== "TEXT") continue;
      if (cleanupFieldIsKept(field, config)) continue;
      var originalValue = readNodeProperty(originalNode, field);
      if (originalValue === undefined) continue;
      var referenceValue = readNodeProperty(referenceNode, field);
      if (!sameComparableValue(referenceValue, originalValue)) addLabel(labelForField(field));
    }

    if (!config.keepComponentProperties && path.length > 0 && componentPropertiesDiffer(referenceNode, originalNode)) {
      addLabel("Propriedades de componentes filhos");
    }

    if (!config.keepNestedVariants && path.length > 0 && originalNode.type === "INSTANCE") {
      try {
        var originalMain = originalNode.mainComponent;
        var referenceMain = referenceNode && referenceNode.type === "INSTANCE" ? referenceNode.mainComponent : null;
        if (originalMain && (!referenceMain || originalMain.id !== referenceMain.id)) {
          addLabel("Variantes de componentes filhos");
        }
      } catch (error) {}
    }

    var referenceChildren = [];
    var originalChildren = [];
    try { if (referenceNode && referenceNode.children) referenceChildren = referenceNode.children; } catch (error) {}
    try { if (originalNode.children) originalChildren = originalNode.children; } catch (error) {}
    var childCount = Math.min(referenceChildren.length, originalChildren.length);
    for (var c = 0; c < childCount; c++) {
      walk(referenceChildren[c], originalChildren[c], path.concat(c));
    }
  }

  walk(reference, original, []);
  var labelList = Object.keys(labels);
  return { hasDifferences: labelList.length > 0, labels: labelList };
}

function cleanupDifferenceInventory(options) {
  var nodes = figma.root.findAll(function (node) {
    return node.type === "COMPONENT" || node.type === "INSTANCE";
  });
  var components = [];
  var instanceIndex = {};
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.type === "COMPONENT") {
      components.push(node);
      continue;
    }
    try {
      var mainComponent = node.mainComponent;
      if (!mainComponent) continue;
      if (!instanceIndex[mainComponent.id]) instanceIndex[mainComponent.id] = [];
      instanceIndex[mainComponent.id].push(node);
    } catch (error) {}
  }

  var result = [];
  for (var c = 0; c < components.length; c++) {
    var component = components[c];
    var instances = instanceIndex[component.id] || [];
    var differentInstances = [];
    var labels = {};
    for (var n = 0; n < instances.length; n++) {
      var instance = instances[n];
      try {
        var summary = cleanupDifferenceSummary(component, instance, options);
        if (!summary.hasDifferences) continue;
        differentInstances.push({
          id: instance.id,
          name: instance.name || "(sem nome)",
          page: pageName(instance),
          path: nodePath(instance)
        });
        summary.labels.forEach(function (label) { labels[label] = true; });
      } catch (error) {}
    }
    if (!differentInstances.length) continue;

    var componentSet = component.parent && component.parent.type === "COMPONENT_SET" ? component.parent : null;
    result.push({
      id: component.id,
      name: component.name || "(sem nome)",
      family: componentSet ? componentSet.name : "",
      page: pageName(component),
      path: nodePath(component),
      instances: instances.length,
      differentInstances: differentInstances.length,
      differenceLabels: Object.keys(labels),
      examples: differentInstances.slice(0, 3)
    });
  }

  result.sort(function (a, b) {
    if (b.differentInstances !== a.differentInstances) return b.differentInstances - a.differentInstances;
    return a.name.localeCompare(b.name);
  });
  return result;
}

function cleanupInstancesForParentId(parentId, onlyDifferent, options) {
  var parent = figma.getNodeById(parentId);
  if (!parent || parent.removed || parent.type !== "COMPONENT") return [];
  var instances = instancesByMainComponent().index[parent.id] || [];
  if (!onlyDifferent) return instances;
  return instances.filter(function (instance) {
    try { return cleanupDifferenceSummary(parent, instance, options).hasDifferences; } catch (error) { return false; }
  });
}

function restoreParentSizing(parent, instance, log) {
  var sizingFields = ["layoutSizingHorizontal", "layoutSizingVertical", "layoutPositioning"];
  for (var i = 0; i < sizingFields.length; i++) {
    var field = sizingFields[i];
    var parentValue = readNodeProperty(parent, field);
    if (parentValue === undefined || parentValue === null || parentValue === "") continue;
    try { instance[field] = parentValue; } catch (error) {
      if (log) log("⚠️ Não foi possível restaurar " + field + ": " + error.message);
    }
  }

  // Em componentes com sizing FIXED, o tamanho também é parte do padrão do
  // pai. Para FILL/HUG, a propriedade de sizing acima é a fonte de verdade e
  // não devemos transformar o comportamento em uma largura fixa.
  var horizontal = readNodeProperty(parent, "layoutSizingHorizontal");
  var vertical = readNodeProperty(parent, "layoutSizingVertical");
  try {
    if (horizontal === "FIXED" && typeof parent.width === "number") {
      instance.resizeWithoutConstraints(parent.width, instance.height);
    }
  } catch (error) {}
  try {
    if (vertical === "FIXED" && typeof parent.height === "number") {
      instance.resizeWithoutConstraints(instance.width, parent.height);
    }
  } catch (error) {}
}

async function cleanupInstancesForParent(parentId, scope, options, postResult) {
  var parent = figma.getNodeById(parentId);
  if (!parent || parent.removed || parent.type !== "COMPONENT") {
    throw new Error("Escolha um componente pai válido para a limpeza.");
  }

  var allInstances = cleanupInstancesForParentId(parent.id, !!(options && options.onlyDifferent), options);
  var instances = allInstances.filter(function (instance) {
    if (!instance || instance.removed) return false;
    if (scope === "page") {
      var page = getPage(instance);
      return page && page.id === figma.currentPage.id;
    }
    if (scope === "selection") {
      return (figma.currentPage.selection || []).some(function (selected) {
        return selected && selected.id === instance.id;
      });
    }
    return true;
  });

  if (!instances.length) {
    throw new Error(scope === "selection"
      ? "Nenhuma instância do componente pai está selecionada."
      : "Nenhuma instância encontrada para o escopo escolhido.");
  }

  var keepConfig = {
    keepText: !!(options && options.keepText),
    keepAppearance: !!(options && options.keepAppearance),
    keepShape: !!(options && options.keepShape),
    keepDimensions: !!(options && options.keepDimensions),
    keepLayout: !!(options && options.keepLayout),
    keepVisibility: !!(options && options.keepVisibility),
    keepRotation: !!(options && options.keepRotation),
    keepComponentProperties: !!(options && options.keepComponentProperties),
    keepNestedVariants: !!(options && options.keepNestedVariants)
  };
  var cleaned = 0;
  var failed = 0;
  var log = function (text) { figma.ui.postMessage({ type: "log", text: text }); };

  for (var i = 0; i < instances.length; i++) {
    var instance = instances[i];
    try {
      var snapshot = captureCleanupDifferences(parent, instance, keepConfig);
      var removeOverrides = instance.removeOverrides || instance.resetOverrides;
      if (!removeOverrides) {
        throw new Error("Esta versão da API do Figma não oferece remoção de overrides.");
      }
      var resetResult = removeOverrides.call(instance);
      if (resetResult && typeof resetResult.then === "function") await resetResult;
      await applyOverrideSnapshot(instance, snapshot, log);
      if (!keepConfig.keepDimensions && !keepConfig.keepLayout) {
        restoreParentSizing(parent, instance, log);
      }
      cleaned++;
    } catch (error) {
      failed++;
      log("⚠️ Não foi possível limpar a instância " + instance.id + ": " + error.message);
    }
  }

  var result = {
    parent: cleanupParentSummary(parent),
    scope: scope,
    total: instances.length,
    cleaned: cleaned,
    failed: failed
  };
  if (postResult !== false) {
    figma.ui.postMessage({ type: "cleanup-done", parent: result.parent, scope: scope, total: result.total, cleaned: cleaned, failed: failed });
    figma.notify(cleaned + " instância(s) limpa(s)" + (failed ? "; " + failed + " falha(s)." : "."));
  }
  return result;
}

async function cleanupInstancesForParents(parentIds, scope, options) {
  var ids = [];
  var seen = {};
  for (var i = 0; i < (parentIds || []).length; i++) {
    var id = String(parentIds[i] || "");
    if (id && !seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  }
  if (!ids.length) throw new Error("Selecione ao menos um componente pai válido.");

  var total = 0;
  var cleaned = 0;
  var failed = 0;
  for (var p = 0; p < ids.length; p++) {
    try {
      var result = await cleanupInstancesForParent(ids[p], scope, options, false);
      total += result.total;
      cleaned += result.cleaned;
      failed += result.failed;
    } catch (error) {
      failed++;
      figma.ui.postMessage({ type: "log", text: "⚠️ Não foi possível limpar o componente " + ids[p] + ": " + error.message });
    }
  }
  if (!total) throw new Error("Nenhuma instância divergente foi encontrada para os componentes selecionados.");
  figma.ui.postMessage({
    type: "cleanup-done",
    parent: null,
    scope: scope,
    total: total,
    cleaned: cleaned,
    failed: failed
  });
  figma.notify(cleaned + " instância(s) limpa(s)" + (failed ? "; " + failed + " falha(s)." : "."));
}

async function consolidate(dryRun, plans, rawSelectedFields, optionsConfig, skipAnalysisCheck) {
  var selected = normalizeSelectedFields(rawSelectedFields);
  var shouldCreateSet = !optionsConfig || optionsConfig.createSet !== false;
  var preserveOverrides = !!(optionsConfig && optionsConfig.preserveOverrides);
  var compatibilityOptions = exploreCompatibilityOptions(optionsConfig && optionsConfig.similarCompatibility);
  var log = function (text) { figma.ui.postMessage({ type: "log", text: text }); };
  
  var totals = {
    componentsCreated: 0,
    instancesInserted: 0,
    redirected: 0,
    componentsRemoved: 0,
    skipped: 0,
    protected: 0
  };

  if (!hasAnyField(selected) || (!skipAnalysisCheck && lastAnalysisCriteriaKey !== analysisCriteriaKey(selected, optionsConfig))) {
    figma.ui.postMessage({ type: "error", text: "Analise novamente após escolher as propriedades." });
    figma.ui.postMessage({ type: "done", dryRun: dryRun, totals: totals, invalidPlan: true });
    return;
  }

  var sortedPlans = (plans || []).slice().sort(function (a, b) {
    return (b.maxDepth || 0) - (a.maxDepth || 0);
  });

  log("Critérios usados: " + activeFieldsLabel(selected));
  log("Executando " + (dryRun ? "simulação" : "aplicação") + " de " + sortedPlans.length + " família(s)...");

  // Faça o preflight de todas as famílias antes de criar mestres, trocar
  // instâncias ou remover componentes. Um plano inválido protege a operação
  // inteira, inclusive as famílias que seriam compatíveis.
  var hasInvalidPlan = false;
  var preflightSignature = createSignatureCalculator(selected, compatibilityOptions);
  for (var preflightIndex = 0; preflightIndex < sortedPlans.length; preflightIndex++) {
    var preflightPlan = sortedPlans[preflightIndex];
    var preflightValid = !!(preflightPlan && Array.isArray(preflightPlan.variants) && preflightPlan.variants.length);
    var preflightFailure = preflightValid ? "" : "plano sem variantes válidas";
    if (preflightValid) {
      for (var preflightVariantIndex = 0; preflightVariantIndex < preflightPlan.variants.length; preflightVariantIndex++) {
        var preflightVariant = preflightPlan.variants[preflightVariantIndex];
        var preflightSource = preflightVariant && figma.getNodeById(preflightVariant.sourceId);
        if (!preflightSource || preflightSource.removed) {
          preflightFailure = "fonte ausente para " + (preflightVariant && preflightVariant.variantStr || "variante sem nome");
          preflightValid = false;
          break;
        }

        var preflightSourceSignature = preflightSignature(preflightSource).compatible;
        var preflightCopies = (preflightVariant && Array.isArray(preflightVariant.copies))
          ? preflightVariant.copies
          : [];
        for (var preflightCopyIndex = 0; preflightCopyIndex < preflightCopies.length; preflightCopyIndex++) {
          var preflightCopy = preflightCopies[preflightCopyIndex];
          var preflightCopyNode = preflightCopy && figma.getNodeById(preflightCopy.id);
          if (!preflightCopyNode || preflightCopyNode.removed) {
            preflightFailure = "cópia ausente: " + (preflightCopy && preflightCopy.name || "sem nome");
            preflightValid = false;
            break;
          }
          if (preflightSignature(preflightCopyNode).compatible !== preflightSourceSignature) {
            preflightFailure = "cópia incompatível: " + (preflightCopy.name || preflightCopyNode.name || preflightCopy.id);
            preflightValid = false;
            break;
          }
        }
        if (!preflightValid) break;
      }

      var preflightFirstVariant = preflightPlan.variants[0];
      var preflightFirstSource = preflightFirstVariant && figma.getNodeById(preflightFirstVariant.sourceId);
      if (preflightValid && (!preflightFirstSource || !getPage(preflightFirstSource))) {
        preflightFailure = "fonte fora de uma página válida";
        preflightValid = false;
      }
    }

    if (!preflightValid) {
      hasInvalidPlan = true;
      log("❌ Família \"" + (preflightPlan && preflightPlan.name || "sem nome") +
        "\" protegida: " + preflightFailure + ".");
    }
  }

  if (hasInvalidPlan) {
    log("Operação protegida: todas as famílias selecionadas foram mantidas porque pelo menos uma é inválida.");
    figma.ui.postMessage({
      type: "done",
      dryRun: dryRun,
      aborted: true,
      totals: {
        componentsCreated: 0,
        instancesInserted: 0,
        redirected: 0,
        componentsRemoved: 0,
        skipped: 0,
        protected: sortedPlans.length
      }
    });
    return;
  }

  var instanceMap = instancesByMainComponent();
  var masterSnapshotCache = {};
  
  var looseComponentsTrack = {};
  var componentSetsTrack = {};
  var variantToComponentSet = {};

  for (var p = 0; p < sortedPlans.length; p++) {
    var plan = sortedPlans[p];
    var signatureFor = createSignatureCalculator(selected, compatibilityOptions);
    
    var isFamilyValid = true;
    var validatedVariants = [];

    for (var v = 0; v < plan.variants.length; v++) {
      var variant = plan.variants[v];
      var sourceNode = figma.getNodeById(variant.sourceId);
      if (!sourceNode || sourceNode.removed) {
        log("⚠️ Fonte não encontrada para variante " + variant.variantStr + " da família " + plan.name);
        isFamilyValid = false;
        break;
      }
      
      var sourceSignature = signatureFor(sourceNode).compatible;
      var validatedCopies = [];

      for (var c = 0; c < variant.copies.length; c++) {
        var copy = variant.copies[c];
        var copyNode = figma.getNodeById(copy.id);
        if (!copyNode || copyNode.removed) {
          log("⚠️ Cópia não encontrada: " + copy.name + " (" + copy.id + ")");
          isFamilyValid = false;
          break;
        }
        
        var copySignature = signatureFor(copyNode).compatible;
        if (copySignature !== sourceSignature) {
          log("⚠️ Cópia incompatível estruturalmente: " + copy.name + " (" + copy.id + ")");
          isFamilyValid = false;
          break;
        }
        validatedCopies.push(copyNode);
      }
      
      if (!isFamilyValid) break;

      validatedVariants.push({
        variantStr: variant.variantStr,
        sourceNode: sourceNode,
        copies: validatedCopies
      });
    }

    if (!isFamilyValid) {
      totals.protected++;
      log("❌ Família \"" + plan.name + "\" protegida: fontes inválidas ou cópias incompatíveis.");
      continue;
    }

    for (var v = 0; v < validatedVariants.length; v++) {
      var vv = validatedVariants[v];
      var nodesToTrack = [vv.sourceNode].concat(vv.copies);
      
      for (var nt = 0; nt < nodesToTrack.length; nt++) {
        var node = nodesToTrack[nt];
        if (node.type === "COMPONENT") {
          if (node.parent && node.parent.type === "COMPONENT_SET") {
            var setId = node.parent.id;
            variantToComponentSet[node.id] = setId;
            if (!componentSetsTrack[setId]) {
              componentSetsTrack[setId] = {
                node: node.parent,
                variantsTrack: {}
              };
            }
            componentSetsTrack[setId].variantsTrack[node.id] = {
              success: false,
              hasFailedRedirections: false
            };
          } else {
            if (!looseComponentsTrack[node.id]) {
              looseComponentsTrack[node.id] = {
                node: node,
                success: false,
                hasFailedRedirections: false
              };
            }
          }
        }
      }
    }

    var firstSource = validatedVariants[0].sourceNode;
    var page = getPage(firstSource);
    if (!page) {
      totals.protected++;
      log("❌ Família \"" + plan.name + "\" protegida: página da primeira fonte não encontrada.");
      continue;
    }

    var basePos = absolutePosition(firstSource);
    var baseWidth = firstSource.width || 0;
    var startX = basePos.x + baseWidth + 100;
    var startY = basePos.y;

    var newMasterComponents = [];
    var newMasterByVariantStr = {};
    var creationFailed = false;

    for (var v = 0; v < validatedVariants.length; v++) {
      var vv = validatedVariants[v];
      if (dryRun) {
        totals.componentsCreated++;
        log("⚡ [Simulação] Criaria novo componente master para variante \"" + vv.variantStr + "\".");
      } else {
        try {
          var clone = vv.sourceNode.clone();
          page.appendChild(clone);
          
          clone.x = startX + v * (baseWidth + 40);
          clone.y = startY;

          // clone() de um COMPONENT já retorna um novo componente. Para
          // INSTANCE, destacamos primeiro para preservar sua aparência e
          // permitir a conversão do Frame resultante em componente.
          var newComp;
          if (clone.type === "COMPONENT") {
            newComp = clone;
          } else {
            if (clone.type === "INSTANCE") clone = clone.detachInstance();
            newComp = figma.createComponentFromNode(clone);
          }
          totals.componentsCreated++;
          newMasterComponents.push(newComp);
          newMasterByVariantStr[vv.variantStr] = newComp;
        } catch (e) {
          log("❌ Erro ao criar master para variante \"" + vv.variantStr + "\": " + e.message);
          creationFailed = true;
          break;
        }
      }
    }

    if (creationFailed) {
      totals.protected++;
      log("❌ Família \"" + plan.name + "\" protegida devido a falha na criação de componentes.");
      if (!dryRun) {
        for (var mc = 0; mc < newMasterComponents.length; mc++) {
          try { newMasterComponents[mc].remove(); } catch(err) {}
        }
      }
      continue;
    }

    var finalMasterByVariantStr = {};
    if (!dryRun) {
      if (validatedVariants.length >= 2 && shouldCreateSet) {
        try {
          for (var v = 0; v < validatedVariants.length; v++) {
            var vstr = validatedVariants[v].variantStr;
            newMasterComponents[v].name = vstr;
          }
          
          // A API oficial para combinar componentes em variantes é
          // combineAsVariants(components, parent).
          var newSet = figma.combineAsVariants(newMasterComponents, page);
          newSet.name = plan.name;
          
          for (var c = 0; c < newSet.children.length; c++) {
            var child = newSet.children[c];
            var childProps = readVariantPropertiesSafely(child);
            var childVariantStr = Object.keys(childProps).sort().map(function (k) {
              return k + "=" + childProps[k];
            }).join(", ");
            finalMasterByVariantStr[childVariantStr] = child;
          }
          log("📦 Novo Component Set \"" + plan.name + "\" criado com sucesso.");
        } catch (e) {
          // Alguns componentes clonados carregam metadados de variantes ou
          // propriedades inválidas que fazem combineAsVariants falhar. Não
          // descartamos os masters já criados: eles continuam úteis como
          // componentes independentes e a migração pode ser concluída.
          log("⚠️ Não foi possível criar o Component Set: " + e.message);
          log("   Os masters serão mantidos como componentes independentes.");
          for (var fallback = 0; fallback < validatedVariants.length; fallback++) {
            var fallbackVariant = validatedVariants[fallback];
            var fallbackComponent = newMasterComponents[fallback];
            fallbackComponent.name = plan.name + " / " + fallbackVariant.variantStr;
            finalMasterByVariantStr[fallbackVariant.variantStr] = fallbackComponent;
          }
        }
      } else {
        for (var v = 0; v < validatedVariants.length; v++) {
          var singleComp = newMasterComponents[v];
          singleComp.name = plan.name + (validatedVariants.length > 1 ? " / " + validatedVariants[v].variantStr : "");
          finalMasterByVariantStr[validatedVariants[v].variantStr] = singleComp;
        }
        log("🧩 Componente(s) mestre(s) para \"" + plan.name + "\" criado(s) com sucesso.");
      }
    }

    for (var v = 0; v < validatedVariants.length; v++) {
      var vv = validatedVariants[v];
      var newMaster = dryRun ? null : finalMasterByVariantStr[vv.variantStr];
      var hasRedirectionFailure = false;

      if (vv.sourceNode.type === "COMPONENT") {
        var sourceInstances = instanceMap.index[vv.sourceNode.id] || [];
        var swappedSource = await redirectInstances(sourceInstances, newMaster, dryRun, log, preserveOverrides, masterSnapshotCache);
        totals.redirected += swappedSource.redirected;
        totals.skipped += swappedSource.failed;
        if (swappedSource.failed > 0) {
          hasRedirectionFailure = true;
        }
      } else if (vv.sourceNode.type === "INSTANCE") {
        // Reaproveita a instância e preserva seus overrides ao trocar o master.
        var swappedSourceInstance = await redirectInstances([vv.sourceNode], newMaster, dryRun, log, preserveOverrides, masterSnapshotCache);
        totals.redirected += swappedSourceInstance.redirected;
        totals.skipped += swappedSourceInstance.failed;
        if (swappedSourceInstance.failed > 0) {
          hasRedirectionFailure = true;
        }
      }

      for (var c = 0; c < vv.copies.length; c++) {
        var copyNode = vv.copies[c];
        if (copyNode.type === "COMPONENT") {
          var copyInstances = instanceMap.index[copyNode.id] || [];
          var swappedCopy = await redirectInstances(copyInstances, newMaster, dryRun, log, preserveOverrides, masterSnapshotCache);
          totals.redirected += swappedCopy.redirected;
          totals.skipped += swappedCopy.failed;
          if (swappedCopy.failed > 0) {
            hasRedirectionFailure = true;
          }
        } else if (copyNode.type === "INSTANCE") {
          var swappedCopyInstance = await redirectInstances([copyNode], newMaster, dryRun, log, preserveOverrides, masterSnapshotCache);
          totals.redirected += swappedCopyInstance.redirected;
          totals.skipped += swappedCopyInstance.failed;
          if (swappedCopyInstance.failed > 0) {
            hasRedirectionFailure = true;
          }
        } else {
          if (dryRun) {
            totals.instancesInserted++;
          } else {
            try {
              await insertInstanceReplacing(copyNode, newMaster, preserveOverrides, vv.sourceNode);
              totals.instancesInserted++;
            } catch (e) {
              totals.skipped++;
              log("⚠️ Falha ao substituir elemento comum \"" + copyNode.name + "\": " + e.message);
              hasRedirectionFailure = true;
            }
          }
        }
      }

      if (vv.sourceNode.type !== "COMPONENT" && vv.sourceNode.type !== "INSTANCE") {
        if (dryRun) {
          totals.instancesInserted++;
        } else {
          try {
            await insertInstanceReplacing(vv.sourceNode, newMaster, preserveOverrides, vv.sourceNode);
            totals.instancesInserted++;
          } catch (e) {
            totals.skipped++;
            log("⚠️ Falha ao substituir elemento comum fonte \"" + vv.sourceNode.name + "\": " + e.message);
            hasRedirectionFailure = true;
          }
        }
      }

      if (!dryRun) {
        var allNodesToMark = [vv.sourceNode].concat(vv.copies);
        for (var nt = 0; nt < allNodesToMark.length; nt++) {
          var node = allNodesToMark[nt];
          if (node.type === "COMPONENT") {
            var setId = variantToComponentSet[node.id];
            if (setId && componentSetsTrack[setId]) {
              var vTrack = componentSetsTrack[setId].variantsTrack[node.id];
              if (vTrack) {
                vTrack.success = !hasRedirectionFailure;
                vTrack.hasFailedRedirections = hasRedirectionFailure;
              }
            } else if (looseComponentsTrack[node.id]) {
              var lTrack = looseComponentsTrack[node.id];
              lTrack.success = !hasRedirectionFailure;
              lTrack.hasFailedRedirections = hasRedirectionFailure;
            }
          }
        }
      }
    }
  }

  if (!dryRun) {
    var looseIds = Object.keys(looseComponentsTrack);
    for (var li = 0; li < looseIds.length; li++) {
      var track = looseComponentsTrack[looseIds[li]];
      if (track.success && !track.hasFailedRedirections) {
        try {
          track.node.remove();
          totals.componentsRemoved++;
          log("🗑 Componente antigo \"" + track.node.name + "\" removido.");
        } catch (e) {
          totals.protected++;
          log("⚠️ Falha ao remover componente antigo \"" + track.node.name + "\": " + e.message);
        }
      } else {
        totals.protected++;
        log("🛡 Componente antigo \"" + track.node.name + "\" mantido (falhas ou instâncias remanescentes).");
      }
    }

    var setIds = Object.keys(componentSetsTrack);
    for (var si = 0; si < setIds.length; si++) {
      var setTrack = componentSetsTrack[setIds[si]];
      var componentSet = setTrack.node;
      
      var allVariantsMigrated = true;
      var children = componentSet.children;
      
      for (var c = 0; c < children.length; c++) {
        var childId = children[c].id;
        var vTrack = setTrack.variantsTrack[childId];
        if (!vTrack || !vTrack.success || vTrack.hasFailedRedirections) {
          allVariantsMigrated = false;
          break;
        }
      }

      if (allVariantsMigrated) {
        try {
          componentSet.remove();
          totals.componentsRemoved++;
          log("🗑 Component Set antigo \"" + componentSet.name + "\" removido.");
        } catch (e) {
          totals.protected++;
          log("⚠️ Falha ao remover Component Set antigo \"" + componentSet.name + "\": " + e.message);
        }
      } else {
        totals.protected++;
        log("🛡 Component Set antigo \"" + componentSet.name + "\" mantido (contém variantes não migradas ou falhas).");
      }
    }
  } else {
    var looseIds = Object.keys(looseComponentsTrack);
    totals.componentsRemoved += looseIds.length;
    var setIds = Object.keys(componentSetsTrack);
    totals.componentsRemoved += setIds.length;
  }

  if (!dryRun && (totals.instancesInserted > 0 || totals.redirected > 0)) {
    figma.notify("Consolidação concluída. Revise o resultado antes de compartilhar.");
  }

  figma.ui.postMessage({
    type: "done",
    dryRun: dryRun,
    totals: totals
  });
}

function isInsideSelectedNode(node, selectedIds) {
  var current = node.parent;
  while (current && current.type !== "DOCUMENT") {
    if (selectedIds[current.id]) return true;
    current = current.parent;
  }
  return false;
}

function hasInstanceAncestor(node) {
  var current = node.parent;
  while (current && current.type !== "DOCUMENT") {
    if (current.type === "INSTANCE") return true;
    current = current.parent;
  }
  return false;
}

function prepareNodeForComponentCreation(node) {
  if (node.type === "INSTANCE") {
    return node.detachInstance();
  }
  return node;
}

function groupNodesByParent(nodes) {
  var groups = [];
  var groupByParentId = {};
  for (var i = 0; i < nodes.length; i++) {
    var parent = nodes[i].parent;
    if (!parent || !parent.id) continue;
    var group = groupByParentId[parent.id];
    if (!group) {
      group = { parent: parent, nodes: [] };
      groupByParentId[parent.id] = group;
      groups.push(group);
    }
    group.nodes.push(nodes[i]);
  }
  for (var g = 0; g < groups.length; g++) {
    var siblings = groups[g].parent.children || [];
    groups[g].nodes.sort(function (a, b) {
      var indexA = siblings.indexOf(a);
      var indexB = siblings.indexOf(b);
      return indexA - indexB;
    });
  }
  return groups;
}

function createSharedComponentFromNodeGroup(groupNodes) {
  var page = getPage(groupNodes[0]) || figma.currentPage;
  var clones = [];
  var group = null;
  var component = null;
  try {
    for (var i = 0; i < groupNodes.length; i++) {
      var clone = groupNodes[i].clone();
      page.appendChild(clone);
      var position = absolutePosition(groupNodes[i]);
      try { clone.x = position.x; clone.y = position.y; } catch (positionError) {}
      try { clone.rotation = groupNodes[i].rotation; } catch (rotationError) {}
      clones.push(clone);
    }
    if (!clones.length) throw new Error("A seleção não contém elementos para formar o componente compartilhado.");
    if (clones.length === 1) {
      component = figma.createComponentFromNode(clones[0]);
    } else {
      group = figma.group(clones, page);
      component = figma.createComponentFromNode(group);
    }
    component.name = "Componente criado da seleção";
    try {
      var bounds = component.absoluteBoundingBox;
      if (bounds) {
        component.x = bounds.x + bounds.width + 120;
        component.y = bounds.y;
      }
    } catch (positionError) {}
    return component;
  } catch (error) {
    if (component) {
      try { component.remove(); } catch (componentCleanupError) {}
    }
    if (group) {
      try { group.remove(); } catch (cleanupError) {}
    }
    for (var c = 0; c < clones.length; c++) {
      try { if (clones[c].removed !== true) clones[c].remove(); } catch (cloneCleanupError) {}
    }
    throw error;
  }
}

function groupsHaveCompatibleStructure(referenceNodes, targetNodes) {
  if (referenceNodes.length !== targetNodes.length) return false;
  for (var i = 0; i < referenceNodes.length; i++) {
    if (referenceNodes[i].type !== targetNodes[i].type) return false;
  }
  return true;
}

function replaceNodeGroupWithSharedInstance(groupNodes, component, preserveOverrides, reference) {
  var parent = groupNodes[0] && groupNodes[0].parent;
  if (!parent || !parent.insertChild) throw new Error("Elemento sem contêiner editável.");
  for (var i = 1; i < groupNodes.length; i++) {
    if (groupNodes[i].parent !== parent) throw new Error("Os elementos do grupo não pertencem ao mesmo contêiner.");
  }

  var source = groupNodes.length === 1 ? groupNodes[0] : figma.group(groupNodes, parent);
  return insertInstanceReplacing(source, component, preserveOverrides, reference);
}

async function createComponentsFromSelection(mode) {
  var selection = figma.currentPage.selection || [];
  if (!selection.length) throw new Error("Selecione ao menos um elemento para criar componentes.");

  var selectedIds = {};
  for (var s = 0; s < selection.length; s++) selectedIds[selection[s].id] = true;

  var candidates = [];
  var skipped = [];
  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    if (node.type === "COMPONENT") {
      skipped.push(node.name + " (já é um componente)");
      continue;
    }
    if (isInsideSelectedNode(node, selectedIds)) {
      skipped.push(node.name + " (filho de outro item selecionado)");
      continue;
    }
    if (hasInstanceAncestor(node)) {
      skipped.push(node.name + " (está dentro de uma instância; selecione o mestre do componente)");
      continue;
    }
    candidates.push(node);
  }

  if (!candidates.length) {
    throw new Error("Nenhum elemento elegível encontrado na seleção. Componentes existentes e elementos internos de instâncias foram ignorados.");
  }

  var created = [];
  var errors = [];
  if (mode === "single") {
    var parentGroups = groupNodesByParent(candidates);
    var templateGroup = parentGroups[0];
    var sharedComponent;
    try {
      sharedComponent = createSharedComponentFromNodeGroup(templateGroup.nodes);
    } catch (error) {
      throw new Error("Não foi possível criar o componente compartilhado: " + error.message);
    }

    var instancesCreated = 0;
    for (var g = 0; g < parentGroups.length; g++) {
      if (!groupsHaveCompatibleStructure(templateGroup.nodes, parentGroups[g].nodes)) {
        errors.push(parentGroups[g].parent.name + ": estrutura diferente do primeiro grupo selecionado");
        continue;
      }
      var parentComponent = owningComponent(parentGroups[g].parent);
      var instanceOverrideMigrations = captureParentInstanceOverrides(
        parentComponent,
        parentGroups[g].nodes
      );
      try {
        await replaceNodeGroupWithSharedInstance(
          parentGroups[g].nodes,
          sharedComponent,
          g > 0,
          sharedComponent
        );
        await applyParentInstanceOverrides(instanceOverrideMigrations, sharedComponent);
        instancesCreated++;
      } catch (error) {
        errors.push(parentGroups[g].parent.name + ": " + error.message);
      }
    }
    if (!instancesCreated) {
      try { sharedComponent.remove(); } catch (cleanupError) {}
      throw new Error("Nenhuma instância foi inserida. " + errors.join(" "));
    }
    created.push(sharedComponent);
    figma.currentPage.selection = [sharedComponent];
    figma.viewport.scrollAndZoomIntoView([sharedComponent]);
    figma.ui.postMessage({
      type: "create-components-done",
      created: 1,
      instances: instancesCreated,
      skipped: skipped,
      errors: errors,
      mode: mode
    });
    figma.notify("Componente compartilhado criado com " + instancesCreated + " instância(s) inserida(s).");
    return;
  } else {
    for (var c = 0; c < candidates.length; c++) {
      try {
        var preparedNode = prepareNodeForComponentCreation(candidates[c]);
        created.push(figma.createComponentFromNode(preparedNode));
      } catch (error) {
        errors.push(candidates[c].name + ": " + error.message);
      }
    }
  }

  if (!created.length) throw new Error("Nenhum componente foi criado. " + errors.join(" "));
  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
  figma.ui.postMessage({
    type: "create-components-done",
    created: created.length,
    skipped: skipped,
    errors: errors,
    mode: mode
  });
  figma.notify(created.length + (created.length === 1 ? " componente criado." : " componentes criados."));
}

var selectionChangeTimer = null;
figma.on("selectionchange", function () {
  // Arrastar ou selecionar vários nós dispara diversos eventos em sequência.
  // O painel só precisa receber o estado final da seleção.
  if (selectionChangeTimer) clearTimeout(selectionChangeTimer);
  selectionChangeTimer = setTimeout(function () {
    selectionChangeTimer = null;
    postSelectionState();
  }, 80);
});

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === "presets-load") {
      postPresets(null);
      return;
    }

    if (msg.type === "preset-save") {
      try {
        savePreset(msg.preset, !!msg.update);
      } catch (error) {
        figma.ui.postMessage({ type: "preset-error", text: error.message });
      }
      return;
    }

    if (msg.type === "preset-delete") {
      try {
        deletePreset(msg.id);
      } catch (error) {
        figma.ui.postMessage({ type: "preset-error", text: error.message });
      }
      return;
    }

    if (msg.type === "request-selection") {
      postSelectionState();
      return;
    }

    if (msg.type === "request-inventory") {
      figma.ui.postMessage({ type: "inventory", items: componentInventory() });
      return;
    }

    if (msg.type === "request-cleanup-analysis") {
      figma.ui.postMessage({ type: "cleanup-analysis", items: cleanupDifferenceInventory(msg.options || {}) });
      return;
    }

    if (msg.type === "create-components-from-selection") {
      await createComponentsFromSelection(msg.mode || "each");
      return;
    }

    if (msg.type === "replace-instances-with-wrapper") {
      await replaceInstancesWithWrapper(
        msg.sourceIds || msg.sourceId,
        msg.targetId,
        msg.scope || "document",
        msg.preserveOverrides !== false
      );
      return;
    }

    if (msg.type === "cleanup-instances") {
      var cleanupOptions = Object.assign({}, msg.options || {}, { onlyDifferent: !!msg.onlyDifferent });
      if (Array.isArray(msg.parentIds) && msg.parentIds.length > 1) {
        await cleanupInstancesForParents(msg.parentIds, msg.scope || "document", cleanupOptions);
      } else {
        var singleParentId = Array.isArray(msg.parentIds) && msg.parentIds.length ? msg.parentIds[0] : msg.parentId;
        await cleanupInstancesForParent(singleParentId, msg.scope || "document", cleanupOptions);
      }
      return;
    }

    if (msg.type === "select-cleanup-instances") {
      var cleanupInstances = cleanupInstancesForParentId(msg.componentId, true, msg.options || {}).filter(function (instance) {
        var page = getPage(instance);
        return page && page.id === figma.currentPage.id;
      });
      figma.currentPage.selection = cleanupInstances;
      if (cleanupInstances.length) {
        figma.viewport.scrollAndZoomIntoView(cleanupInstances);
        figma.notify(cleanupInstances.length + " instância(s) com diferenças selecionada(s).");
      } else {
        figma.notify("Nenhuma instância com diferenças deste componente nesta página.");
      }
      return;
    }

    if (msg.type === "find-similar") {
      var similarIds = msg.nodeIds || (figma.currentPage.selection || []).map(function (node) { return node.id; });
      if (msg.switchToReferencePage && similarIds.length > 0) {
        var referenceNode = figma.getNodeById(similarIds[0]);
        var referencePage = referenceNode && getPage(referenceNode);
        if (referencePage && referencePage.id !== figma.currentPage.id) {
          figma.currentPage = referencePage;
        }
      }
      var similarItems = findSimilarNodes(
        similarIds,
        msg.preserveDifferences !== false,
        msg.compatibilityConfig
      );
      figma.ui.postMessage({ type: "similar-results", items: similarItems });
      return;
    }

    if (msg.type === "consolidate-similar") {
      await consolidateSimilar(msg.items, {
        createSet: true,
        preserveOverrides: msg.preserveOverrides !== false,
        similarCompatibility: msg.compatibilityConfig
      });
      return;
    }

    if (msg.type === "select-component-instances") {
      var instanceIndex = instancesByMainComponent().index;
      var componentInstances = instanceIndex[msg.componentId] || [];
      var currentPageInstances = componentInstances.filter(function (instance) {
        var page = getPage(instance);
        return page && page.id === figma.currentPage.id;
      });
      figma.currentPage.selection = currentPageInstances;
      if (currentPageInstances.length > 0) {
        figma.viewport.scrollAndZoomIntoView(currentPageInstances);
        figma.notify(currentPageInstances.length + " instância(s) selecionada(s) nesta página.");
      } else {
        figma.notify("Nenhuma instância deste componente nesta página.");
      }
      return;
    }

    if (msg.type === "select-nodes") {
      try {
        var nodeIds = msg.nodeIds || [];
        var nodes = [];
        var targetPage = null;

        for (var i = 0; i < nodeIds.length; i++) {
          var node = figma.getNodeById(nodeIds[i]);
          if (node && !node.removed) {
            var page = getPage(node);
            if (page) {
              if (!targetPage) {
                targetPage = page;
              }
              // O Figma só permite selecionar nós na página ativa atual.
              // Portanto, agrupamos e selecionamos os nós que pertencem à página alvo principal.
              if (page.id === targetPage.id) {
                nodes.push(node);
              }
            }
          }
        }

        if (nodes.length > 0 && targetPage) {
          // Muda para a página alvo se for diferente da atual
          if (figma.currentPage.id !== targetPage.id) {
            figma.currentPage = targetPage;
          }
          figma.currentPage.selection = nodes;
          figma.viewport.scrollAndZoomIntoView(nodes);
          figma.ui.postMessage({
            type: "log",
            text: "Selecionados " + nodes.length + " elemento(s) na página \"" + targetPage.name + "\"."
          });
        } else {
          figma.ui.postMessage({
            type: "log",
            text: "Nenhum elemento válido encontrado para seleção no canvas."
          });
        }
      } catch (err) {
        figma.ui.postMessage({
          type: "error",
          text: "Erro ao selecionar elementos: " + err.message
        });
      }
      return;
    }

    if (msg.type === "request-preview") {
      try {
        var node = figma.getNodeById(msg.nodeId);
        if (node && !node.removed) {
          var isWide = (node.width || 0) > (node.height || 0);
          var constraintType = isWide ? "WIDTH" : "HEIGHT";
          var constraintValue = 80;

          node.exportAsync({
            format: "PNG",
            constraint: {
              type: constraintType,
              value: constraintValue
            }
          }).then(function (bytes) {
            figma.ui.postMessage({
              type: "preview-response",
              nodeId: msg.nodeId,
              bytes: bytes
            });
          }).catch(function (err) {
            figma.ui.postMessage({
              type: "preview-response",
              nodeId: msg.nodeId,
              bytes: null
            });
          });
        } else {
          figma.ui.postMessage({
            type: "preview-response",
            nodeId: msg.nodeId,
            bytes: null
          });
        }
      } catch (e) {
        figma.ui.postMessage({
          type: "preview-response",
          nodeId: msg.nodeId,
          bytes: null
        });
      }
      return;
    }

    if (msg.type === "analyze") {
      var selected = normalizeSelectedFields(msg.selectedFields);
      if (!hasAnyField(selected)) {
        figma.ui.postMessage({ type: "error", text: "Selecione ao menos uma propriedade para analisar." });
        return;
      }
      lastAnalysisCriteriaKey = analysisCriteriaKey(selected, msg.optionsConfig);
      var scope = msg.scope || "document";
      var scopeLabel = scope === "selection" ? "Seleção Atual" : (scope === "page" ? "Página Atual" : "Documento Inteiro");
      figma.ui.postMessage({ type: "log", text: "Escopo: " + scopeLabel + ". Propriedades: " + activeFieldsLabel(selected) });
      
      var families = analyzeDocument(selected, msg.selectedTypes, scope, msg.filterConfig, msg.optionsConfig);
      
      figma.ui.postMessage({
        type: "analysis",
        data: {
          families: families
        }
      });
    }
    if (msg.type === "simulate") {
      await consolidate(true, msg.plans, msg.selectedFields, msg.optionsConfig);
    }
    if (msg.type === "apply") {
      await consolidate(false, msg.plans, msg.selectedFields, msg.optionsConfig);
    }
    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (error) {
    figma.ui.postMessage({ type: "error", text: "ERRO GLOBAL: " + error.message });
    figma.notify("Erro: " + error.message);
  }
};
