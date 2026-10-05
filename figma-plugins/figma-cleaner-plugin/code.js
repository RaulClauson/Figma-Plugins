figma.showUI(__html__, {
  width: 680,
  height: 820,
  title: "Cleaner - Otimizador de Estrutura",
});

// --- Helpers de Inspeção de Propriedades ---

function hasVisibleFills(node) {
  if (!node.fills || !Array.isArray(node.fills)) {
    if (typeof node.fills === "symbol") return true;
    return false;
  }
  return node.fills.some(function (f) {
    return f.visible !== false && (typeof f.opacity !== "number" || f.opacity > 0);
  });
}

function hasImageFills(node) {
  if (!node.fills || !Array.isArray(node.fills)) return false;
  return node.fills.some(function (f) {
    return f.visible !== false && f.type === "IMAGE";
  });
}

function hasVisibleStrokes(node) {
  if (!node.strokes || !Array.isArray(node.strokes)) {
    if (typeof node.strokes === "symbol") return true;
    return false;
  }
  var hasVisible = node.strokes.some(function (s) {
    return s.visible !== false;
  });
  if (!hasVisible) return false;

  if (typeof node.strokeWeight === "number") {
    return node.strokeWeight > 0;
  }
  if (typeof node.strokeWeight === "symbol") {
    return true;
  }
  if (
    (typeof node.strokeTopWeight === "number" && node.strokeTopWeight > 0) ||
    (typeof node.strokeRightWeight === "number" && node.strokeRightWeight > 0) ||
    (typeof node.strokeBottomWeight === "number" && node.strokeBottomWeight > 0) ||
    (typeof node.strokeLeftWeight === "number" && node.strokeLeftWeight > 0)
  ) {
    return true;
  }
  return false;
}

function hasVisibleEffects(node) {
  if (!node.effects || !Array.isArray(node.effects)) {
    if (typeof node.effects === "symbol") return true;
    return false;
  }
  return node.effects.some(function (e) {
    return e.visible !== false;
  });
}

function hasReactions(node) {
  return node.reactions && Array.isArray(node.reactions) && node.reactions.length > 0;
}

function hasExportSettings(node) {
  return (
    node.exportSettings &&
    Array.isArray(node.exportSettings) &&
    node.exportSettings.length > 0
  );
}

function hasCustomCornerRadius(node) {
  if (typeof node.cornerRadius === "symbol") return true;
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) return true;
  if (
    (typeof node.topLeftRadius === "number" && node.topLeftRadius > 0) ||
    (typeof node.topRightRadius === "number" && node.topRightRadius > 0) ||
    (typeof node.bottomLeftRadius === "number" && node.bottomLeftRadius > 0) ||
    (typeof node.bottomRightRadius === "number" && node.bottomRightRadius > 0)
  ) {
    return true;
  }
  return false;
}

function isInsideInstance(node) {
  var cur = node.parent;
  while (cur && cur.type !== "DOCUMENT" && cur.type !== "PAGE") {
    if (cur.type === "INSTANCE") return true;
    cur = cur.parent;
  }
  return false;
}

function isAutoLayoutSpacer(node) {
  if (!node.parent) return false;
  var p = node.parent;
  var isParentAutoLayout =
    p.type === "FRAME" && (p.layoutMode === "HORIZONTAL" || p.layoutMode === "VERTICAL");
  if (!isParentAutoLayout) return false;

  // Spacer típico: sem preenchimento visível, sem bordas, sem efeitos e com largura ou altura fixa
  var noVisuals =
    !hasVisibleFills(node) && !hasVisibleStrokes(node) && !hasVisibleEffects(node);
  return noVisuals && (node.width > 0 || node.height > 0);
}

function nodePath(node) {
  var names = [];
  var cur = node;
  while (cur && cur.type !== "DOCUMENT") {
    names.unshift(cur.name);
    cur = cur.parent;
  }
  return names.join(" / ");
}

function getNodeDepth(node) {
  var depth = 0;
  var cur = node;
  while (cur && cur.type !== "DOCUMENT") {
    depth++;
    cur = cur.parent;
  }
  return depth;
}

function safePadding(val) {
  var num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num) || !isFinite(num) || num < 0) return 0;
  return Math.max(0, Math.round(num));
}

function isGraphicOrIcon(node) {
  if (!node) return false;
  var t = node.type;
  if (
    t === "VECTOR" ||
    t === "BOOLEAN_OPERATION" ||
    t === "STAR" ||
    t === "ELLIPSE" ||
    t === "POLYGON" ||
    t === "LINE"
  ) {
    return true;
  }
  if (t === "INSTANCE" || t === "COMPONENT") {
    return true;
  }
  if (node.children && Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) {
      if (isGraphicOrIcon(node.children[i])) return true;
    }
  }
  return false;
}

function containsVectors(node) {
  if (!node || !node.children || !Array.isArray(node.children)) return false;
  for (var i = 0; i < node.children.length; i++) {
    if (isGraphicOrIcon(node.children[i])) return true;
  }
  return false;
}

function canSafelyConvertToAutoLayout(child) {
  if (child.layoutMode && child.layoutMode !== "NONE") return false;
  if (containsVectors(child)) return false; // NUNCA converter frame com vetores/ícones para Auto Layout
  if (!child.children || child.children.length === 0) return true;
  if (child.children.length === 1) {
    var grandChild = child.children[0];
    return (
      grandChild.type === "TEXT" ||
      grandChild.type === "FRAME" ||
      grandChild.type === "RECTANGLE"
    );
  }
  return false;
}

// --- Coleta de Nós Conforme o Escopo ---

function getTargetNodes(scope) {
  var nodes = [];
  var seen = {};

  function addNode(node) {
    if (!node || seen[node.id]) return;
    seen[node.id] = true;
    nodes.push(node);
  }

  if (scope === "selection") {
    var sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      return [];
    }
    for (var i = 0; i < sel.length; i++) {
      addNode(sel[i]);
      if ("findAll" in sel[i]) {
        var descendants = sel[i].findAll(function () {
          return true;
        });
        for (var d = 0; d < descendants.length; d++) addNode(descendants[d]);
      }
    }
  } else {
    // Escopo: página atual
    nodes = figma.currentPage.findAll(function () {
      return true;
    });
  }
  return nodes;
}

// --- Análise de Frames Redundantes ---

function analyzeRedundantFrames(nodes) {
  var results = [];

  for (var i = 0; i < nodes.length; i++) {
    var parent = nodes[i];

    // Deve ser um FRAME normal (não Componente solto nem ComponentSet nem Instância)
    if (parent.type !== "FRAME") continue;
    if (parent.parent && parent.parent.type === "COMPONENT_SET") continue;
    if (isInsideInstance(parent)) continue;

    // Deve ter exatamente 1 filho e ele deve ser um FRAME
    if (!parent.children || parent.children.length !== 1) continue;
    var child = parent.children[0];
    if (child.type !== "FRAME") continue;

    // Analisar compatibilidade estrita
    var classification = "secured"; // "secured" | "low-risk" | "high-risk" | "incompatible"
    var reasons = [];

    // 1. Bloqueios reais e inegociáveis do Figma
    if (parent.locked || child.locked) {
      classification = "incompatible";
      reasons.push("Camada bloqueada");
    }

    if (parent.isMask || child.isMask) {
      classification = "incompatible";
      reasons.push("Contém máscara");
    }

    if (child.layoutPositioning === "ABSOLUTE") {
      classification = "incompatible";
      reasons.push("Filho com posição absoluta");
    }

    var childX = typeof child.x === "number" ? child.x : 0;
    var childY = typeof child.y === "number" ? child.y : 0;
    var childW = typeof child.width === "number" ? child.width : 0;
    var childH = typeof child.height === "number" ? child.height : 0;
    var parentW = typeof parent.width === "number" ? parent.width : 0;
    var parentH = typeof parent.height === "number" ? parent.height : 0;

    // Coordenadas negativas / overflow que cortariam o conteúdo
    if (childX < -0.5 || childY < -0.5) {
      classification = "incompatible";
      reasons.push("Elemento com coordenadas negativas (overflow fora do frame)");
    }

    var parentIsAutoLayout = parent.layoutMode && parent.layoutMode !== "NONE";
    var childIsAutoLayout = child.layoutMode && child.layoutMode !== "NONE";
    var childHasVectors = containsVectors(child);

    // Proteção de slots de ícone/gráfico: Container com dimensões diferentes envolvendo ícone/vetores
    if (childHasVectors && (Math.abs(parentW - childW) > 1 || Math.abs(parentH - childH) > 1)) {
      classification = "incompatible";
      reasons.push("Slot envolvendo ícone/gráfico de tamanho diferente (mantém área de toque e alinhamento)");
    }

    var parentHasFill = hasVisibleFills(parent);
    var childHasFill = hasVisibleFills(child);
    if (parentHasFill && childHasFill) {
      classification = "incompatible";
      reasons.push("Conflito de preenchimento (Fills em ambos — possível Overlay/Scrim)");
    }

    var parentHasStroke = hasVisibleStrokes(parent);
    var childHasStroke = hasVisibleStrokes(child);
    if (parentHasStroke && childHasStroke) {
      classification = "incompatible";
      reasons.push("Conflito de borda (Strokes em ambos)");
    }

    var extraLeft = safePadding(childX);
    var extraTop = safePadding(childY);
    var extraRight = safePadding(parentW - (childX + childW));
    var extraBottom = safePadding(parentH - (childY + childH));
    var hasExtraPadding = extraLeft > 0 || extraTop > 0 || extraRight > 0 || extraBottom > 0;

    if (classification !== "incompatible") {
      var parentOpacity = typeof parent.opacity === "number" ? parent.opacity : 1;
      var parentHasEffects = hasVisibleEffects(parent);
      var parentHasRadius = hasCustomCornerRadius(parent);
      var parentHasReactions = hasReactions(parent);
      var parentHasExport = hasExportSettings(parent);
      var parentHasClips = !!parent.clipsContent;

      var parentLayoutMode = parent.layoutMode || "NONE";
      var childLayoutMode = child.layoutMode || "NONE";
      var layoutModesMatch = parentLayoutMode === childLayoutMode;

      var pSizingH = parent.layoutSizingHorizontal || "FIXED";
      var cSizingH = child.layoutSizingHorizontal || "FIXED";
      var pSizingV = parent.layoutSizingVertical || "FIXED";
      var cSizingV = child.layoutSizingVertical || "FIXED";
      var sizingModesMatch = pSizingH === cSizingH && pSizingV === cSizingV;
      var dimensionsMatch = Math.abs(parentW - childW) <= 0.5 && Math.abs(parentH - childH) <= 0.5;

      var is100PercentIdentical =
        !parentHasFill &&
        !parentHasStroke &&
        !parentHasEffects &&
        !parentHasReactions &&
        !parentHasExport &&
        !parentHasRadius &&
        parentOpacity === 1 &&
        (!parentHasClips || child.clipsContent) &&
        !hasExtraPadding &&
        layoutModesMatch &&
        sizingModesMatch &&
        Math.abs(parentW - childW) <= 0.01 &&
        Math.abs(parentH - childH) <= 0.01 &&
        Math.abs(childX) <= 0.01 &&
        Math.abs(childY) <= 0.01;

      if (is100PercentIdentical) {
        classification = "secured";
        reasons.push("100% Idêntico (Zero alteração visual)");
      } else {
        var hasStyleStacking = (parentHasFill && childHasFill) || (parentHasStroke && childHasStroke);
        var isCrossAxisAutoLayout = parentIsAutoLayout && childIsAutoLayout && !layoutModesMatch;
        var isMultiElementFreeform = !childIsAutoLayout && !childHasVectors && child.children && child.children.length > 1;
        var hasLargeSizeGap = Math.abs(parentW - childW) > 16 || Math.abs(parentH - childH) > 16 || !sizingModesMatch;

        // CASO 1: Alto Risco (Mudanças estruturais complexas, eixos cruzados, translação múltipla ou empilhamento de estilos)
        if (isCrossAxisAutoLayout) {
          classification = "high-risk";
          reasons.push("Auto Layout multi-eixo (" + parentLayoutMode + " + " + childLayoutMode + ") • Requer conferência");
        } else if (isMultiElementFreeform) {
          classification = "high-risk";
          reasons.push("Translação de múltiplos elementos livres (" + child.children.length + " filhos)");
        } else if (hasStyleStacking) {
          classification = "high-risk";
          reasons.push("Empilhamento de cores/bordas sobrepostas");
        } else if (hasLargeSizeGap) {
          classification = "high-risk";
          reasons.push("Diferença acentuada de dimensões/sizing (" + Math.round(parentW) + "x" + Math.round(parentH) + " ➔ " + Math.round(childW) + "x" + Math.round(childH) + ")");
        }
        // CASO 2: Baixo Risco (Mesclagens simples no mesmo eixo, conversão limpa ou transferência de estilos simples)
        else if (parentIsAutoLayout && childIsAutoLayout && layoutModesMatch) {
          classification = "low-risk";
          reasons.push("Auto Layout mesmo eixo (" + parentLayoutMode + ") • Soma paddings");
        } else if (parentIsAutoLayout && canSafelyConvertToAutoLayout(child)) {
          classification = "low-risk";
          reasons.push("Converte filho em Auto Layout • Herda alinhamento e padding");
        } else if (!childIsAutoLayout && !childHasVectors) {
          classification = "low-risk";
          reasons.push("Translação simples de coordenadas livres");
        } else if (!childIsAutoLayout && childHasVectors && dimensionsMatch) {
          classification = "secured";
          reasons.push("Envelope redundante de ícone (mesmo tamanho)");
        } else {
          classification = "low-risk";
          reasons.push("Mesclagem simples com transferência de estilos");
        }

        // Detalhes dos estilos transferidos
        if (parentHasFill && childHasFill) reasons.push("Empilha preenchimentos (camadas)");
        else if (parentHasFill) reasons.push("Transfere preenchimento");

        if (parentHasStroke && childHasStroke) reasons.push("Combina bordas");
        else if (parentHasStroke) reasons.push("Transfere borda");

        if (parentHasEffects) reasons.push("Empilha efeitos de sombra");
        if (parentHasRadius) reasons.push("Transfere arredondamento");
        if (parentOpacity < 1) reasons.push("Mescla opacidade");
        if (parentHasClips && !child.clipsContent) reasons.push("Transfere clipsContent");
      }
    }

    results.push({
      id: parent.id,
      childId: child.id,
      name: parent.name,
      childName: child.name,
      path: nodePath(parent),
      depth: getNodeDepth(parent),
      classification: classification,
      reasons: reasons,
      selected: classification === "secured",
    });
  }

  return results;
}

// --- Análise de Frames Vazios ---

function analyzeEmptyFrames(nodes, rules) {
  var results = [];

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.type !== "FRAME") continue;
    if (isInsideInstance(node)) continue;

    // Frame sem filhos
    if (!node.children || node.children.length === 0) {
      var isProtected = false;
      var reasons = [];

      if (node.locked) {
        isProtected = true;
        reasons.push("Camada bloqueada");
      }

      if (rules.preserveComponents && (node.type === "COMPONENT" || node.type === "COMPONENT_SET")) {
        isProtected = true;
        reasons.push("Componente / Variante");
      }

      if (rules.preserveReactions && hasReactions(node)) {
        isProtected = true;
        reasons.push("Área de clique de protótipo");
      }

      if (rules.preserveExport && hasExportSettings(node)) {
        isProtected = true;
        reasons.push("Configuração de exportação");
      }

      if (rules.preserveImageFills && hasImageFills(node)) {
        isProtected = true;
        reasons.push("Preenchimento com Imagem");
      } else if (rules.preserveFills && hasVisibleFills(node)) {
        isProtected = true;
        reasons.push("Possui preenchimento");
      }

      if (rules.preserveStrokes && hasVisibleStrokes(node)) {
        isProtected = true;
        reasons.push("Possui borda");
      }

      if (rules.preserveEffects && hasVisibleEffects(node)) {
        isProtected = true;
        reasons.push("Possui efeitos (sombra/blur)");
      }

      if (rules.preserveSpacers && isAutoLayoutSpacer(node)) {
        isProtected = true;
        reasons.push("Espaçador de Auto Layout");
      }

      results.push({
        id: node.id,
        name: node.name,
        path: nodePath(node),
        isProtected: isProtected,
        reasons: reasons,
        selected: !isProtected,
      });
    }
  }

  return results;
}

// --- Análise de Grupos ---

function analyzeGroups(nodes) {
  var results = [];

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.type === "GROUP") {
      if (isInsideInstance(node)) continue;

      var isLocked = node.locked;
      results.push({
        id: node.id,
        name: node.name,
        path: nodePath(node),
        childCount: node.children ? node.children.length : 0,
        isLocked: isLocked,
        selected: !isLocked,
      });
    }
  }

  return results;
}

// --- Análise de Auto Layout ---

function getAutoLayoutSettings(frame) {
  try {
    if (typeof frame.inferredAutoLayout === "undefined") return null;
    var inferred = frame.inferredAutoLayout;
    if (!inferred || !inferred.layoutMode || inferred.layoutMode === "NONE") return null;

    return {
      layoutMode: inferred.layoutMode,
      layoutWrap: inferred.layoutWrap || "NO_WRAP",
      primaryAxisSizingMode: inferred.primaryAxisSizingMode || "AUTO",
      counterAxisSizingMode: inferred.counterAxisSizingMode || "AUTO",
      primaryAxisAlignItems: inferred.primaryAxisAlignItems || "MIN",
      counterAxisAlignItems: inferred.counterAxisAlignItems || "MIN",
      paddingLeft: typeof inferred.paddingLeft === "number" ? inferred.paddingLeft : 0,
      paddingRight: typeof inferred.paddingRight === "number" ? inferred.paddingRight : 0,
      paddingTop: typeof inferred.paddingTop === "number" ? inferred.paddingTop : 0,
      paddingBottom: typeof inferred.paddingBottom === "number" ? inferred.paddingBottom : 0,
      itemSpacing: typeof inferred.itemSpacing === "number" ? inferred.itemSpacing : 0,
      counterAxisSpacing: typeof inferred.counterAxisSpacing === "number" ? inferred.counterAxisSpacing : null,
      strokesIncludedInLayout: typeof inferred.strokesIncludedInLayout === "boolean" ? inferred.strokesIncludedInLayout : null,
      itemReverseZIndex: typeof inferred.itemReverseZIndex === "boolean" ? inferred.itemReverseZIndex : null,
    };
  } catch (e) {
    return null;
  }
}

function getAutoLayoutFlowLabel(layoutMode) {
  if (layoutMode === "HORIZONTAL") return "Horizontal";
  if (layoutMode === "VERTICAL") return "Vertical";
  if (layoutMode === "GRID") return "Grade";
  return "Desconhecido";
}

function getAutoLayoutGapLabel(settings) {
  if (settings.primaryAxisAlignItems === "SPACE_BETWEEN") return "Auto · Entre";
  if (settings.primaryAxisAlignItems === "SPACE_EVENLY") return "Auto · Uniforme";
  if (settings.primaryAxisAlignItems === "SPACE_AROUND") return "Auto · Ao redor";
  return settings.itemSpacing + " px";
}

function matchesInferredCrossAlignment(children, settings, horizontal) {
  var alignment = settings.counterAxisAlignItems;
  if (alignment === "BASELINE") return false;

  var positions = [];
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (horizontal) {
      if (alignment === "CENTER") positions.push(child.y + child.height / 2);
      else if (alignment === "MAX") positions.push(child.y + child.height);
      else positions.push(child.y);
    } else {
      if (alignment === "CENTER") positions.push(child.x + child.width / 2);
      else if (alignment === "MAX") positions.push(child.x + child.width);
      else positions.push(child.x);
    }
  }

  return Math.max.apply(Math, positions) - Math.min.apply(Math, positions) <= 1.5;
}

function analyzeAutoLayoutRisk(frame, settings) {
  var reasons = [];
  var classification = "secured";

  if (frame.locked) {
    return { classification: "incompatible", reasons: ["Frame bloqueado"] };
  }

  if (settings.layoutMode === "GRID") {
    return { classification: "incompatible", reasons: ["A inferência sugere Auto Layout em grade, ainda não suportado"] };
  }

  if (settings.layoutMode !== "HORIZONTAL" && settings.layoutMode !== "VERTICAL") {
    return { classification: "incompatible", reasons: ["Fluxo inferido não suportado"] };
  }

  var children = frame.children ? [].slice.call(frame.children) : [];
  if (children.length < 2) {
    return { classification: "incompatible", reasons: ["São necessários pelo menos dois filhos para inferir um fluxo"] };
  }

  var horizontal = settings.layoutMode === "HORIZONTAL";
  var orderedChildren = children.slice().sort(function (a, b) {
    var aMain = horizontal ? a.x : a.y;
    var bMain = horizontal ? b.x : b.y;
    if (Math.abs(aMain - bMain) > 0.5) return aMain - bMain;
    var aCross = horizontal ? a.y : a.x;
    var bCross = horizontal ? b.y : b.x;
    return aCross - bCross;
  });

  var orderMatches = true;
  for (var i = 0; i < children.length; i++) {
    if (children[i].id !== orderedChildren[i].id) {
      orderMatches = false;
      break;
    }
  }

  var hasOverlap = false;
  for (var aIdx = 0; aIdx < children.length; aIdx++) {
    for (var bIdx = aIdx + 1; bIdx < children.length; bIdx++) {
      var aChild = children[aIdx];
      var bChild = children[bIdx];
      var overlapX = Math.min(aChild.x + aChild.width, bChild.x + bChild.width) - Math.max(aChild.x, bChild.x);
      var overlapY = Math.min(aChild.y + aChild.height, bChild.y + bChild.height) - Math.max(aChild.y, bChild.y);
      if (overlapX > 0.5 && overlapY > 0.5) hasOverlap = true;
    }
  }

  var gaps = [];
  for (var g = 1; g < orderedChildren.length; g++) {
    var previous = orderedChildren[g - 1];
    var current = orderedChildren[g];
    var gap = horizontal
      ? current.x - (previous.x + previous.width)
      : current.y - (previous.y + previous.height);
    gaps.push(gap);
  }

  var minGap = Math.min.apply(Math, gaps);
  var maxGap = Math.max.apply(Math, gaps);
  var gapsConsistent = maxGap - minGap <= Math.max(1, Math.abs(maxGap) * 0.05);
  var alignmentMatches = matchesInferredCrossAlignment(children, settings, horizontal);
  var hasMask = !!frame.isMask;
  var hasRotation = false;
  for (var c = 0; c < children.length; c++) {
    if (children[c].isMask) hasMask = true;
    if (typeof children[c].rotation === "number" && Math.abs(children[c].rotation) > 0.5) hasRotation = true;
  }

  if (settings.layoutWrap === "WRAP") {
    classification = "high-risk";
    reasons.push("Fluxo com quebra de linha pode reorganizar os filhos");
  }
  if (hasOverlap) {
    classification = "high-risk";
    reasons.push("Há elementos sobrepostos; eles podem precisar de posição absoluta");
  }
  if (!orderMatches) {
    classification = "high-risk";
    reasons.push("A ordem visual difere da ordem das camadas");
  }
  if (minGap < -0.5) {
    classification = "high-risk";
    reasons.push("Há sobreposição no eixo principal do fluxo");
  }
  if (hasMask) {
    classification = "high-risk";
    reasons.push("O frame ou um filho usa máscara");
  }
  if (hasRotation && classification === "secured") {
    classification = "low-risk";
    reasons.push("Há elementos rotacionados; confira o resultado visual");
  }
  if (!gapsConsistent && classification === "secured") {
    classification = "low-risk";
    reasons.push("Os espaçamentos atuais variam; será aplicado o valor inferido pelo Figma");
  }
  if (!alignmentMatches && classification === "secured") {
    classification = "low-risk";
    reasons.push("O alinhamento transversal pode mudar; confira a prévia no Figma");
  }

  if (classification === "secured") {
    reasons.push("Fluxo " + getAutoLayoutFlowLabel(settings.layoutMode).toLowerCase() + " claro, ordem preservada e espaçamento regular");
  }

  return { classification: classification, reasons: reasons };
}

function analyzeAutoLayoutFrames(nodes) {
  var results = [];
  var seen = {};

  for (var i = 0; i < nodes.length; i++) {
    var frame = nodes[i];
    if (!frame || frame.type !== "FRAME" || seen[frame.id]) continue;
    seen[frame.id] = true;
    if (frame.layoutMode && frame.layoutMode !== "NONE") continue;
    if (!frame.children || frame.children.length < 2) continue;
    if (isInsideInstance(frame)) continue;

    var settings = getAutoLayoutSettings(frame);
    if (!settings) continue;

    var risk = analyzeAutoLayoutRisk(frame, settings);
    results.push({
      id: frame.id,
      name: frame.name,
      path: nodePath(frame),
      depth: getNodeDepth(frame),
      classification: risk.classification,
      reasons: risk.reasons,
      settings: settings,
      selected: risk.classification === "secured",
    });
  }

  return results;
}

function supportsAutoLayoutInference(nodes) {
  var foundFrame = false;
  for (var i = 0; i < nodes.length; i++) {
    if (!nodes[i] || nodes[i].type !== "FRAME") continue;
    foundFrame = true;
    try {
      if (typeof nodes[i].inferredAutoLayout !== "undefined") return true;
    } catch (e) {}
  }
  return foundFrame ? false : null;
}

function executeAutoLayout(frame, dryRun, log) {
  try {
    if (!frame || frame.removed || frame.type !== "FRAME") {
      return { success: false, error: "Camada não é um frame válido" };
    }
    if (frame.locked || isInsideInstance(frame)) {
      return { success: false, error: "Frame bloqueado ou dentro de uma instância" };
    }
    if (frame.layoutMode && frame.layoutMode !== "NONE") {
      return { success: false, error: "Frame já possui Auto Layout" };
    }

    var settings = getAutoLayoutSettings(frame);
    if (!settings || (settings.layoutMode !== "HORIZONTAL" && settings.layoutMode !== "VERTICAL")) {
      return { success: false, error: "O Figma não inferiu um fluxo horizontal ou vertical compatível" };
    }

    if (dryRun) {
      log(
        "  SIMULAÇÃO: '" + frame.name + "' → " + getAutoLayoutFlowLabel(settings.layoutMode) +
          ", alinhamento " + settings.primaryAxisAlignItems + "/" + settings.counterAxisAlignItems +
          ", gap " + getAutoLayoutGapLabel(settings) +
          ", padding T/R/B/L " + settings.paddingTop + "/" + settings.paddingRight + "/" + settings.paddingBottom + "/" + settings.paddingLeft + "."
      );
      return { success: true };
    }

    // Definir o fluxo primeiro; as demais propriedades só se aplicam com Auto Layout ativo.
    frame.layoutMode = settings.layoutMode;
    frame.primaryAxisSizingMode = settings.primaryAxisSizingMode;
    frame.counterAxisSizingMode = settings.counterAxisSizingMode;
    frame.layoutWrap = settings.layoutWrap;
    frame.paddingTop = settings.paddingTop;
    frame.paddingRight = settings.paddingRight;
    frame.paddingBottom = settings.paddingBottom;
    frame.paddingLeft = settings.paddingLeft;
    frame.itemSpacing = settings.itemSpacing;
    if (settings.layoutWrap === "WRAP" && typeof settings.counterAxisSpacing === "number") {
      frame.counterAxisSpacing = settings.counterAxisSpacing;
    }
    frame.primaryAxisAlignItems = settings.primaryAxisAlignItems;
    frame.counterAxisAlignItems = settings.counterAxisAlignItems;
    if (typeof settings.strokesIncludedInLayout === "boolean") {
      frame.strokesIncludedInLayout = settings.strokesIncludedInLayout;
    }
    if (typeof settings.itemReverseZIndex === "boolean") {
      frame.itemReverseZIndex = settings.itemReverseZIndex;
    }

    return { success: true };
  } catch (e) {
    log("  ERRO ao aplicar Auto Layout em '" + (frame ? frame.name : "frame") + "': " + e.message);
    return { success: false, error: e.message };
  }
}

// --- Execução: Remover/Mesclar Frame Redundante ---

function executeRedundantFrame(parent, child, dryRun, log) {
  try {
    if (dryRun) {
      return { success: true };
    }

    var grandParent = parent.parent;
    if (!grandParent) {
      log("  ERRO: Frame pai não tem ancestral.");
      return { success: false };
    }

    var childX = typeof child.x === "number" ? child.x : 0;
    var childY = typeof child.y === "number" ? child.y : 0;
    var childW = typeof child.width === "number" ? child.width : 0;
    var childH = typeof child.height === "number" ? child.height : 0;
    var parentW = typeof parent.width === "number" ? parent.width : 0;
    var parentH = typeof parent.height === "number" ? parent.height : 0;

    var extraLeft = safePadding(childX);
    var extraTop = safePadding(childY);
    var extraRight = safePadding(parentW - (childX + childW));
    var extraBottom = safePadding(parentH - (childY + childH));

    var parentIsAutoLayout = parent.layoutMode && parent.layoutMode !== "NONE";
    var childIsAutoLayout = child.layoutMode && child.layoutMode !== "NONE";
    var childHasVectors = containsVectors(child);

    // Salvar dimensões e propriedades originais do filho
    var origChildW = child.width;
    var origChildH = child.height;

    // 1. Transferência e Empilhamento Inteligente de Estilos
    try {
      // Fills: Empilhar fills do pai na base dos fills do filho
      var parentFills = hasVisibleFills(parent) && Array.isArray(parent.fills) ? parent.fills : [];
      var childFills = hasVisibleFills(child) && Array.isArray(child.fills) ? child.fills : [];
      if (parentFills.length > 0) {
        if (childFills.length > 0) {
          // Ambos têm fills: pai fica atrás do filho
          child.fills = parentFills.concat(childFills);
        } else {
          child.fills = parentFills;
        }
      }

      // Strokes: se o pai tiver borda e o filho não, transferir
      if (hasVisibleStrokes(parent) && !hasVisibleStrokes(child)) {
        if (Array.isArray(parent.strokes)) child.strokes = parent.strokes;
        if (typeof parent.strokeWeight === "number") {
          child.strokeWeight = parent.strokeWeight;
        } else {
          if (typeof parent.strokeTopWeight === "number") child.strokeTopWeight = parent.strokeTopWeight;
          if (typeof parent.strokeRightWeight === "number") child.strokeRightWeight = parent.strokeRightWeight;
          if (typeof parent.strokeBottomWeight === "number") child.strokeBottomWeight = parent.strokeBottomWeight;
          if (typeof parent.strokeLeftWeight === "number") child.strokeLeftWeight = parent.strokeLeftWeight;
        }
        if (parent.strokeAlign) child.strokeAlign = parent.strokeAlign;
      }

      // Effects: combinar sombras do pai e do filho
      var parentEffects = Array.isArray(parent.effects) ? parent.effects : [];
      var childEffects = Array.isArray(child.effects) ? child.effects : [];
      if (parentEffects.length > 0) {
        child.effects = parentEffects.concat(childEffects);
      }

      // Corner Radius: se o pai tiver e o filho não
      if (hasCustomCornerRadius(parent) && !hasCustomCornerRadius(child)) {
        if (typeof parent.cornerRadius === "number") {
          child.cornerRadius = parent.cornerRadius;
        } else {
          if (typeof parent.topLeftRadius === "number") child.topLeftRadius = parent.topLeftRadius;
          if (typeof parent.topRightRadius === "number") child.topRightRadius = parent.topRightRadius;
          if (typeof parent.bottomLeftRadius === "number") child.bottomLeftRadius = parent.bottomLeftRadius;
          if (typeof parent.bottomRightRadius === "number") child.bottomRightRadius = parent.bottomRightRadius;
        }
      }

      // Opacidade
      if (typeof parent.opacity === "number" && parent.opacity < 1) {
        var childOp = typeof child.opacity === "number" ? child.opacity : 1;
        child.opacity = childOp * parent.opacity;
      }

      // Clips Content
      if (parent.clipsContent) {
        child.clipsContent = true;
      }

      // Blend Mode
      if (parent.blendMode && parent.blendMode !== "PASS_THROUGH" && (!child.blendMode || child.blendMode === "PASS_THROUGH")) {
        child.blendMode = parent.blendMode;
      }
    } catch (e) {}

    // 2. Resolução Geométrica de Layout

    // CASO A: Filho é Auto Layout (mesmo eixo ou eixos opostos H/V)
    if (childIsAutoLayout) {
      try {
        var curPadLeft = safePadding(child.paddingLeft);
        var curPadRight = safePadding(child.paddingRight);
        var curPadTop = safePadding(child.paddingTop);
        var curPadBottom = safePadding(child.paddingBottom);

        child.paddingLeft = safePadding(curPadLeft + extraLeft);
        child.paddingRight = safePadding(curPadRight + extraRight);
        child.paddingTop = safePadding(curPadTop + extraTop);
        child.paddingBottom = safePadding(curPadBottom + extraBottom);
      } catch (e) {}
    }
    // CASO B: Filho é Freeform com 1 elemento seguro (converte em Auto Layout)
    else if (parentIsAutoLayout && canSafelyConvertToAutoLayout(child)) {
      try {
        child.layoutMode = parent.layoutMode;
        if (parent.primaryAxisAlignItems) child.primaryAxisAlignItems = parent.primaryAxisAlignItems;
        if (parent.counterAxisAlignItems) child.counterAxisAlignItems = parent.counterAxisAlignItems;
        if (typeof parent.itemSpacing === "number") child.itemSpacing = parent.itemSpacing;
        child.paddingLeft = extraLeft;
        child.paddingRight = extraRight;
        child.paddingTop = extraTop;
        child.paddingBottom = extraBottom;
      } catch (e) {}
    }
    // CASO C: Filho é Freeform com múltiplos elementos livres (sem vetores/ícones sensíveis)
    else if (!childIsAutoLayout && !childHasVectors && child.children && child.children.length > 0) {
      try {
        if (extraLeft > 0 || extraTop > 0 || Math.abs(parentW - childW) > 0.5 || Math.abs(parentH - childH) > 0.5) {
          // Transladar cada elemento neto para preservar a posição absoluta exata na tela
          var grandChildren = [].concat(child.children);
          for (var g = 0; g < grandChildren.length; g++) {
            var gc = grandChildren[g];
            gc.x = (typeof gc.x === "number" ? gc.x : 0) + extraLeft;
            gc.y = (typeof gc.y === "number" ? gc.y : 0) + extraTop;
          }
          child.resize(Math.max(0.01, parentW), Math.max(0.01, parentH));
        }
      } catch (e) {}
    }

    // 3. Capturar propriedades de dimensionamento do pai no avô
    var pSizingH = parent.layoutSizingHorizontal;
    var pSizingV = parent.layoutSizingVertical;
    var pGrow = parent.layoutGrow;
    var pAlign = parent.layoutAlign;

    var grandParentIsAutoLayout =
      grandParent &&
      grandParent.type === "FRAME" &&
      grandParent.layoutMode &&
      grandParent.layoutMode !== "NONE";

    // Adicionar limites min/max se o filho não possuir definido
    try {
      if (typeof parent.minWidth === "number" && (child.minWidth === null || child.minWidth === undefined)) {
        child.minWidth = parent.minWidth;
      }
      if (typeof parent.maxWidth === "number" && (child.maxWidth === null || child.maxWidth === undefined)) {
        child.maxWidth = parent.maxWidth;
      }
      if (typeof parent.minHeight === "number" && (child.minHeight === null || child.minHeight === undefined)) {
        child.minHeight = parent.minHeight;
      }
      if (typeof parent.maxHeight === "number" && (child.maxHeight === null || child.maxHeight === undefined)) {
        child.maxHeight = parent.maxHeight;
      }
    } catch (e) {}

    // 4. Execução NATIVA do Figma via ungroup (dissolve o frame pai)
    var childName = child.name;
    try {
      figma.ungroup(parent);
    } catch (ungroupError) {
      var index = grandParent.children.indexOf(parent);
      grandParent.insertChild(index, child);
      parent.remove();
    }

    // 5. Sincronização pós-ungroup: garantir que o filho assuma o comportamento exato do pai no avô
    if (grandParentIsAutoLayout && !child.removed) {
      try {
        var isVectorFrame = (!child.layoutMode || child.layoutMode === "NONE") && containsVectors(child);

        if (isVectorFrame) {
          // Ícone/Vetor em frame livre: travar como FIXED com dimensões originais exatas
          child.layoutSizingHorizontal = "FIXED";
          child.layoutSizingVertical = "FIXED";
          if (typeof child.layoutGrow === "number") child.layoutGrow = 0;
          if (child.layoutAlign) child.layoutAlign = "INHERIT";
          if (Math.abs(child.width - origChildW) > 0.01 || Math.abs(child.height - origChildH) > 0.01) {
            child.resize(origChildW, origChildH);
          }
        } else {
          // Frame Auto Layout ou Frame Livre com Translação: herdar sizing do pai fluidamente
          if (pSizingH) {
            child.layoutSizingHorizontal = pSizingH;
            if (pSizingH === "FIXED" && child.layoutMode && child.layoutMode !== "NONE" && Math.abs(child.width - parentW) > 0.5) {
              child.resize(parentW, child.height);
            }
          }
          if (pSizingV) {
            child.layoutSizingVertical = pSizingV;
            if (pSizingV === "FIXED" && child.layoutMode && child.layoutMode !== "NONE" && Math.abs(child.height - parentH) > 0.5) {
              child.resize(child.width, parentH);
            }
          }
          if (typeof pGrow === "number") child.layoutGrow = pGrow;
          if (pAlign) child.layoutAlign = pAlign;
        }
      } catch (e) {}
    }

    return { success: true };
  } catch (e) {
    log("  ERRO ao mesclar '" + parent.name + "': " + e.message);
    return { success: false, error: e.message };
  }
}

// --- Execução: Excluir Frame Vazio ---

function executeEmptyFrame(node, dryRun, log) {
  try {
    if (dryRun) {
      return { success: true };
    }
    node.remove();
    return { success: true };
  } catch (e) {
    log("  ERRO ao excluir '" + node.name + "': " + e.message);
    return { success: false, error: e.message };
  }
}

// --- Execução: Converter Grupo em Frame ---

function executeGroupToFrame(group, dryRun, log) {
  var groupName = "grupo";
  try {
    if (dryRun) {
      return { success: true };
    }

    if (!group || group.removed) {
      return { success: false, error: "Grupo removido ou indisponível" };
    }

    // Guardar valores antes de mover filhos: grupos mudam de posição/tamanho e
    // são removidos automaticamente quando ficam vazios.
    groupName = group.name;
    var groupX = typeof group.x === "number" ? group.x : 0;
    var groupY = typeof group.y === "number" ? group.y : 0;
    var groupWidth = typeof group.width === "number" ? group.width : 1;
    var groupHeight = typeof group.height === "number" ? group.height : 1;
    var childrenToMove = group.children ? [].slice.call(group.children) : [];
    var childPositions = [];
    for (var c = 0; c < childrenToMove.length; c++) {
      childPositions.push({
        node: childrenToMove[c],
        x: childrenToMove[c].x - groupX,
        y: childrenToMove[c].y - groupY,
      });
    }

    var parent = group.parent;
    if (!parent) {
      log("  ERRO: Grupo '" + groupName + "' sem pai.");
      return { success: false, error: "Grupo sem pai" };
    }

    var index = parent.children.indexOf(group);
    var frame = figma.createFrame();

    frame.name = groupName;
    frame.x = groupX;
    frame.y = groupY;
    frame.resize(
      Math.max(1, groupWidth),
      Math.max(1, groupHeight)
    );
    if (typeof group.rotation === "number") frame.rotation = group.rotation;
    if (typeof group.opacity === "number") frame.opacity = group.opacity;
    if (group.blendMode) frame.blendMode = group.blendMode;
    if (Array.isArray(group.effects)) frame.effects = group.effects;
    if (Array.isArray(group.exportSettings)) frame.exportSettings = group.exportSettings;
    frame.fills = []; // Grupos são transparentes por padrão

    parent.insertChild(index, frame);

    // Mover filhos preservando posições relativas
    for (var i = 0; i < childPositions.length; i++) {
      var child = childPositions[i].node;
      frame.appendChild(child);
      child.x = childPositions[i].x;
      child.y = childPositions[i].y;
    }

    // Figma remove automaticamente o GroupNode quando o último filho sai.
    return { success: true };
  } catch (e) {
    log("  ERRO ao converter grupo '" + groupName + "': " + e.message);
    return { success: false, error: e.message };
  }
}

// --- Gerenciador de Mensagens do Plugin ---

figma.ui.onmessage = function (msg) {
  function log(text) {
    figma.ui.postMessage({ type: "log", text: text });
  }

  if (msg.type === "select-node") {
    var node = figma.getNodeById(msg.id);
    if (node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.notify("Camada selecionada: " + node.name);
    } else {
      figma.notify("Camada não encontrada ou já removida.");
    }
  } else if (msg.type === "analyze") {
    var scope = msg.scope || "page";
    log("Iniciando análise (Escopo: " + (scope === "selection" ? "Seleção Atual" : "Página Atual") + ")...");

    var targetNodes = getTargetNodes(scope);
    if (scope === "selection" && targetNodes.length === 0) {
      log("Aviso: Nenhuma camada selecionada. Selecione algo na tela ou mude o escopo para 'Página Atual'.");
      figma.ui.postMessage({
        type: "analysis-result",
        redundant: [],
        empty: [],
        groups: [],
        autoLayout: [],
        autoLayoutInferenceSupported: null,
        totalNodes: 0,
      });
      return;
    }

    var redundant = analyzeRedundantFrames(targetNodes);
    var empty = analyzeEmptyFrames(targetNodes, msg.emptyRules || {});
    var groups = analyzeGroups(targetNodes);
    var autoLayout = analyzeAutoLayoutFrames(targetNodes);
    var autoLayoutInferenceSupported = supportsAutoLayoutInference(targetNodes);

    log("Análise concluída: " + redundant.length + " redundantes, " + empty.length + " vazios, " + groups.length + " grupos, " + autoLayout.length + " sugestões de Auto Layout.");

    figma.ui.postMessage({
      type: "analysis-result",
      redundant: redundant,
      empty: empty,
      groups: groups,
      autoLayout: autoLayout,
      autoLayoutInferenceSupported: autoLayoutInferenceSupported,
      totalNodes: targetNodes.length,
    });
  } else if (msg.type === "execute") {
    var dryRun = !!msg.dryRun;
    var redundantIds = msg.redundantIds || [];
    var emptyIds = msg.emptyIds || [];
    var groupIds = msg.groupIds || [];
    var autoLayoutIds = msg.autoLayoutIds || [];

    log("=========================================");
    log((dryRun ? "INICIANDO SIMULAÇÃO (DRY RUN)" : "INICIANDO APLICAÇÃO REAL") + "...");
    log("=========================================");

    var stats = {
      redundantProcessed: 0,
      emptyProcessed: 0,
      groupsProcessed: 0,
      autoLayoutProcessed: 0,
      errors: 0,
    };

    // 1. Processar Redundantes (Ordenados de baixo para cima pela profundidade)
    if (redundantIds.length > 0) {
      log("Processando " + redundantIds.length + " frame(s) redundante(s)...");

      var redundantNodes = [];
      for (var r = 0; r < redundantIds.length; r++) {
        var node = figma.getNodeById(redundantIds[r]);
        if (node) {
          redundantNodes.push({
            node: node,
            depth: getNodeDepth(node),
          });
        }
      }

      // Ordenar por profundidade decrescente (Bottom-Up: mais profundo primeiro)
      redundantNodes.sort(function (a, b) {
        return b.depth - a.depth;
      });

      for (var rIdx = 0; rIdx < redundantNodes.length; rIdx++) {
        var rParent = redundantNodes[rIdx].node;
        // Validação defensiva
        if (!rParent || rParent.removed) continue;
        if (!rParent.children || rParent.children.length !== 1) continue;
        var rChild = rParent.children[0];
        if (!rChild || rChild.removed || rChild.type !== "FRAME") continue;

        var res = executeRedundantFrame(rParent, rChild, dryRun, log);
        if (res.success) stats.redundantProcessed++;
        else stats.errors++;
      }
    }

    // 2. Processar Frames Vazios
    if (emptyIds.length > 0) {
      log("Processando " + emptyIds.length + " frame(s) vazio(s)...");
      for (var eIdx = 0; eIdx < emptyIds.length; eIdx++) {
        var eNode = figma.getNodeById(emptyIds[eIdx]);
        if (eNode) {
          var eRes = executeEmptyFrame(eNode, dryRun, log);
          if (eRes.success) stats.emptyProcessed++;
          else stats.errors++;
        }
      }
    }

    // 3. Processar Grupos
    if (groupIds.length > 0) {
      log("Processando " + groupIds.length + " grupo(s)...");
      for (var g = 0; g < groupIds.length; g++) {
        var gNode = figma.getNodeById(groupIds[g]);
        if (gNode && gNode.type === "GROUP") {
          var gRes = executeGroupToFrame(gNode, dryRun, log);
          if (gRes.success) stats.groupsProcessed++;
          else stats.errors++;
        }
      }
    }

    // 4. Aplicar Auto Layout (ordenado bottom-up para estabilizar frames aninhados)
    if (autoLayoutIds.length > 0) {
      log("Processando " + autoLayoutIds.length + " sugestão(ões) de Auto Layout...");

      var autoLayoutNodes = [];
      for (var a = 0; a < autoLayoutIds.length; a++) {
        var autoLayoutNode = figma.getNodeById(autoLayoutIds[a]);
        if (autoLayoutNode) {
          autoLayoutNodes.push({
            node: autoLayoutNode,
            depth: getNodeDepth(autoLayoutNode),
          });
        }
      }

      autoLayoutNodes.sort(function (a, b) {
        return b.depth - a.depth;
      });

      for (var aIdx = 0; aIdx < autoLayoutNodes.length; aIdx++) {
        var aNode = autoLayoutNodes[aIdx].node;
        var aRes = executeAutoLayout(aNode, dryRun, log);
        if (aRes.success) stats.autoLayoutProcessed++;
        else {
          stats.errors++;
          log("  Ignorado '" + aNode.name + "': " + aRes.error);
        }
      }
    }

    log("-----------------------------------------");
    log(
      (dryRun ? "Simulação finalizada!" : "Aplicação finalizada com sucesso!") +
        " Redundantes: " +
        stats.redundantProcessed +
        ", Vazios: " +
        stats.emptyProcessed +
        ", Grupos: " +
        stats.groupsProcessed +
        ", Auto Layout: " +
        stats.autoLayoutProcessed +
        ", Falhas: " +
        stats.errors
    );
    log("=========================================");

    figma.notify(
      (dryRun ? "Simulação concluída: " : "Limpeza concluída: ") +
        (stats.redundantProcessed + stats.emptyProcessed + stats.groupsProcessed + stats.autoLayoutProcessed) +
        " itens processados."
    );

    figma.ui.postMessage({
      type: "execution-complete",
      dryRun: dryRun,
      stats: stats,
    });
  } else if (msg.type === "execute-single") {
    var action = msg.action; // 'redundant' | 'empty' | 'group' | 'auto-layout'
    var singleNode = figma.getNodeById(msg.id);
    if (!singleNode) {
      figma.notify("Camada não encontrada.");
      return;
    }

    if (action === "redundant" && singleNode.children && singleNode.children.length === 1) {
      executeRedundantFrame(singleNode, singleNode.children[0], false, log);
      figma.notify("Frame redundante mesclado.");
    } else if (action === "empty") {
      executeEmptyFrame(singleNode, false, log);
      figma.notify("Frame vazio removido.");
    } else if (action === "group" && singleNode.type === "GROUP") {
      var groupResult = executeGroupToFrame(singleNode, false, log);
      figma.notify(groupResult.success ? "Grupo convertido em Frame." : "Falha ao converter grupo: " + groupResult.error);
    } else if (action === "auto-layout" && singleNode.type === "FRAME") {
      var autoLayoutResult = executeAutoLayout(singleNode, false, log);
      figma.notify(autoLayoutResult.success ? "Auto Layout aplicado." : "Não foi possível aplicar Auto Layout.");
    }

    figma.ui.postMessage({
      type: "single-complete",
      id: msg.id,
      action: action,
    });
  }
};
