//todo: ignorar elemntos de texto

figma.showUI(__html__, {
  width: 640,
  height: 860,
  title: "Consolidar Famílias de Componentes",
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
  { key: "characters", label: "Texto (characters)" },
  { key: "componentPropertyDefinitions", label: "Propriedades do componente" },
];

var ALL_FIELD_KEYS = ALL_FIELDS.map(function (field) { return field.key; });
var lastAnalysisCriteriaKey = null;

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

function propertiesSignature(node, selected, rootTypeIgnored, isRoot) {
  if (isRoot === undefined) isRoot = true;
  var parts = ["type=" + (rootTypeIgnored ? "<component-compatível>" : val(node.type))];
  var simpleFields = [
    "name", "visible", "width", "height", "rotation", "layoutMode", "layoutWrap",
    "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing", "counterAxisSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "clipsContent", "opacity",
  ];

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

function createSignatureCalculator(selected) {
  var cache = {};

  function signatureFor(node, isRoot) {
    if (isRoot === undefined) isRoot = true;
    var cacheKey = node.id + ":" + (isRoot ? "root" : "child");
    if (cache[cacheKey]) return cache[cacheKey];

    var children = [];
    try {
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          // Os elementos internos recursivos são sempre descendentes (isRoot = false)
          children.push(signatureFor(node.children[i], false).exact);
        }
      }
    } catch (error) {
      children.push("inacessível");
    }

    var result = {
      exact: compactSignature(propertiesSignature(node, selected, false, isRoot), children),
      compatible: compactSignature(propertiesSignature(node, selected, true, isRoot), children),
    };
    cache[cacheKey] = result;
    return result;
  }

  return signatureFor;
}

// --- Debug: comparação legível entre dois nós ---
function diffNodes(nodeA, nodeB, selected, path, maxDiffs, isRoot) {
  if (isRoot === undefined) isRoot = true;
  if (!maxDiffs) maxDiffs = 10;
  var diffs = [];
  var currentPath = path || nodeA.name || "(raiz)";

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
      var childDiffs = diffNodes(childrenA[c], childrenB[c], selected, childPath, maxDiffs - diffs.length, false);
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

function shouldIgnoreNode(node, filterConfig) {
  if (!filterConfig) return false;

  // 1. Filtros de Frames Padrão
  if (node.type === "FRAME") {
    var count = node.children ? node.children.length : 0;
    if (filterConfig.enableMinChildren && count < filterConfig.minChildrenVal) return true;
    if (filterConfig.enableMaxChildren && count > filterConfig.maxChildrenVal) return true;
    if (filterConfig.enableMaxDimensions) {
      var w = node.width || 0;
      var h = node.height || 0;
      if (w > filterConfig.maxWidthVal || h > filterConfig.maxHeightVal) return true;
    }
    if (filterConfig.ignoredNames && filterConfig.ignoredNames.length > 0) {
      var nameLower = (node.name || "").toLowerCase().trim();
      for (var i = 0; i < filterConfig.ignoredNames.length; i++) {
        var term = filterConfig.ignoredNames[i].toLowerCase().trim();
        if (term && nameLower.indexOf(term) !== -1) return true;
      }
    }
  }

  // 2. Supressão de Wrapper (Ignorar filhos únicos em favor do container)
  if (filterConfig.enableWrapperSuppression) {
    if (node.parent && node.parent.children && node.parent.children.length === 1 && !hasProtectedAncestor(node.parent)) {
      return true; // Pula este nó, pois o pai é o wrapper visual definitivo
    }
  }

  // 3. Exclusão de Subárvore (Tipos proibidos)
  if (filterConfig.enableSubtreeExclusion && filterConfig.prohibitedTypes && filterConfig.prohibitedTypes.length > 0) {
    if (hasProhibitedDescendants(node, filterConfig.prohibitedTypes)) {
      return true;
    }
  }

  // 4. Limites de Componentes Aninhados na Subárvore
  if (filterConfig.enableComponentLimits) {
    var compCount = countNestedComponents(node);
    if (filterConfig.enableMinComponents && compCount < filterConfig.minComponentsVal) return true;
    if (filterConfig.enableMaxComponents && compCount > filterConfig.maxComponentsVal) return true;
  }

  return false;
}

function getCandidates(scope, selectedTypes, filterConfig) {
  var result = [];
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
                result.push(node.children[i]);
              }
            }
          }
        }
        return;
      }
      
      if (node.type === "COMPONENT") {
        if (!selectedTypes || selectedTypes["COMPONENT"]) {
          result.push(node);
        }
        return;
      }
      
      if (node.type === "INSTANCE") {
        return;
      }
      
      if (!hasProtectedAncestor(node)) {
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
        if (allowed && !shouldIgnoreNode(node, filterConfig)) {
          result.push(node);
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
      rawProps = node.variantProperties || {};
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

function preserveTextOverrides(source, instance) {
  try {
    var sourceTexts = getAllNodes(source, function (n) { return n.type === "TEXT"; });
    var instanceTexts = getAllNodes(instance, function (n) { return n.type === "TEXT"; });
    for (var i = 0; i < sourceTexts.length && i < instanceTexts.length; i++) {
      var sText = sourceTexts[i];
      var iText = instanceTexts[i];
      if (sText.characters && iText.characters !== sText.characters) {
        try {
          iText.characters = sText.characters;
        } catch (e) {}
      }
    }
  } catch (err) {}
}

function insertInstanceReplacing(source, component, preserveOverrides) {
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
  
  if (preserveOverrides && source.type !== "COMPONENT" && source.type !== "INSTANCE") {
    preserveTextOverrides(source, instance);
  }

  try {
    source.remove();
  } catch (error) {
    try { instance.remove(); } catch (cleanupError) {}
    throw error;
  }
  return instance;
}

function redirectInstances(instances, target, dryRun, log) {
  var result = { redirected: 0, failed: 0 };
  for (var i = 0; i < instances.length; i++) {
    if (dryRun) { result.redirected++; continue; }
    try { instances[i].swapComponent(target); result.redirected++; }
    catch (error) { result.failed++; log("    Erro ao redirecionar instância " + instances[i].id + ": " + error.message); }
  }
  return result;
}

function consolidate(dryRun, plans, rawSelectedFields, optionsConfig) {
  var selected = normalizeSelectedFields(rawSelectedFields);
  var shouldCreateSet = !optionsConfig || optionsConfig.createSet !== false;
  var preserveOverrides = !!(optionsConfig && optionsConfig.preserveOverrides);
  var log = function (text) { figma.ui.postMessage({ type: "log", text: text }); };
  
  var totals = {
    componentsCreated: 0,
    instancesInserted: 0,
    redirected: 0,
    componentsRemoved: 0,
    skipped: 0,
    protected: 0
  };

  if (!hasAnyField(selected) || lastAnalysisCriteriaKey !== analysisCriteriaKey(selected, optionsConfig)) {
    figma.ui.postMessage({ type: "error", text: "Analise novamente após escolher as propriedades." });
    figma.ui.postMessage({ type: "done", dryRun: dryRun, totals: totals, invalidPlan: true });
    return;
  }

  var sortedPlans = (plans || []).slice().sort(function (a, b) {
    return (b.maxDepth || 0) - (a.maxDepth || 0);
  });

  log("Critérios usados: " + activeFieldsLabel(selected));
  log("Executando " + (dryRun ? "simulação" : "aplicação") + " de " + sortedPlans.length + " família(s)...");

  var instanceMap = instancesByMainComponent();
  
  var looseComponentsTrack = {};
  var componentSetsTrack = {};
  var variantToComponentSet = {};

  for (var p = 0; p < sortedPlans.length; p++) {
    var plan = sortedPlans[p];
    var signatureFor = createSignatureCalculator(selected);
    
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

          var newComp = figma.createComponentFromNode(clone);
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
          
          var newSet = figma.combineAsComponentSet(newMasterComponents);
          newSet.name = plan.name;
          
          for (var c = 0; c < newSet.children.length; c++) {
            var child = newSet.children[c];
            var childProps = child.variantProperties || {};
            var childVariantStr = Object.keys(childProps).sort().map(function (k) {
              return k + "=" + childProps[k];
            }).join(", ");
            finalMasterByVariantStr[childVariantStr] = child;
          }
          log("📦 Novo Component Set \"" + plan.name + "\" criado com sucesso.");
        } catch (e) {
          totals.protected++;
          log("❌ Erro ao combinar componentes em Component Set: " + e.message);
          continue;
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
        var swappedSource = redirectInstances(sourceInstances, newMaster, dryRun, log);
        totals.redirected += swappedSource.redirected;
        totals.skipped += swappedSource.failed;
        if (swappedSource.failed > 0) {
          hasRedirectionFailure = true;
        }
      }

      for (var c = 0; c < vv.copies.length; c++) {
        var copyNode = vv.copies[c];
        if (copyNode.type === "COMPONENT") {
          var copyInstances = instanceMap.index[copyNode.id] || [];
          var swappedCopy = redirectInstances(copyInstances, newMaster, dryRun, log);
          totals.redirected += swappedCopy.redirected;
          totals.skipped += swappedCopy.failed;
          if (swappedCopy.failed > 0) {
            hasRedirectionFailure = true;
          }
        } else {
          if (dryRun) {
            totals.instancesInserted++;
          } else {
            try {
              insertInstanceReplacing(copyNode, newMaster, preserveOverrides);
              totals.instancesInserted++;
            } catch (e) {
              totals.skipped++;
              log("⚠️ Falha ao substituir elemento comum \"" + copyNode.name + "\": " + e.message);
              hasRedirectionFailure = true;
            }
          }
        }
      }

      if (vv.sourceNode.type !== "COMPONENT") {
        if (dryRun) {
          totals.instancesInserted++;
        } else {
          try {
            insertInstanceReplacing(vv.sourceNode, newMaster, preserveOverrides);
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

figma.ui.onmessage = function (msg) {
  try {
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
      consolidate(true, msg.plans, msg.selectedFields, msg.optionsConfig);
    }
    if (msg.type === "apply") {
      consolidate(false, msg.plans, msg.selectedFields, msg.optionsConfig);
    }
    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (error) {
    figma.ui.postMessage({ type: "error", text: "ERRO GLOBAL: " + error.message });
    figma.notify("Erro: " + error.message);
  }
};