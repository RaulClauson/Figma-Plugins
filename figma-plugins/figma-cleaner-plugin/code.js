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
  if (scope === "selection") {
    var sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      return [];
    }
    for (var i = 0; i < sel.length; i++) {
      nodes.push(sel[i]);
      if ("findAll" in sel[i]) {
        var descendants = sel[i].findAll(function () {
          return true;
        });
        nodes = nodes.concat(descendants);
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
  try {
    if (dryRun) {
      return { success: true };
    }

    var parent = group.parent;
    if (!parent) {
      log("  ERRO: Grupo sem pai.");
      return { success: false };
    }

    var index = parent.children.indexOf(group);
    var frame = figma.createFrame();

    frame.name = group.name;
    frame.x = group.x;
    frame.y = group.y;
    frame.resize(
      Math.max(1, typeof group.width === "number" ? group.width : 1),
      Math.max(1, typeof group.height === "number" ? group.height : 1)
    );
    if (typeof group.rotation === "number") frame.rotation = group.rotation;
    if (typeof group.opacity === "number") frame.opacity = group.opacity;
    if (group.blendMode) frame.blendMode = group.blendMode;
    if (Array.isArray(group.effects)) frame.effects = group.effects;
    if (Array.isArray(group.exportSettings)) frame.exportSettings = group.exportSettings;
    frame.fills = []; // Grupos são transparentes por padrão

    parent.insertChild(index, frame);

    // Mover filhos preservando posições relativas
    var children = group.children ? [].slice.call(group.children) : [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var relX = child.x - group.x;
      var relY = child.y - group.y;
      frame.appendChild(child);
      child.x = relX;
      child.y = relY;
    }

    group.remove();
    return { success: true };
  } catch (e) {
    log("  ERRO ao converter grupo '" + group.name + "': " + e.message);
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
        totalNodes: 0,
      });
      return;
    }

    var redundant = analyzeRedundantFrames(targetNodes);
    var empty = analyzeEmptyFrames(targetNodes, msg.emptyRules || {});
    var groups = analyzeGroups(targetNodes);

    log("Análise concluída: " + redundant.length + " redundantes, " + empty.length + " vazios, " + groups.length + " grupos.");

    figma.ui.postMessage({
      type: "analysis-result",
      redundant: redundant,
      empty: empty,
      groups: groups,
      totalNodes: targetNodes.length,
    });
  } else if (msg.type === "execute") {
    var dryRun = !!msg.dryRun;
    var redundantIds = msg.redundantIds || [];
    var emptyIds = msg.emptyIds || [];
    var groupIds = msg.groupIds || [];

    log("=========================================");
    log((dryRun ? "INICIANDO SIMULAÇÃO (DRY RUN)" : "INICIANDO APLICAÇÃO REAL") + "...");
    log("=========================================");

    var stats = {
      redundantProcessed: 0,
      emptyProcessed: 0,
      groupsProcessed: 0,
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

    log("-----------------------------------------");
    log(
      (dryRun ? "Simulação finalizada!" : "Aplicação finalizada com sucesso!") +
        " Redundantes: " +
        stats.redundantProcessed +
        ", Vazios: " +
        stats.emptyProcessed +
        ", Grupos: " +
        stats.groupsProcessed +
        ", Falhas: " +
        stats.errors
    );
    log("=========================================");

    figma.notify(
      (dryRun ? "Simulação concluída: " : "Limpeza concluída: ") +
        (stats.redundantProcessed + stats.emptyProcessed + stats.groupsProcessed) +
        " itens processados."
    );

    figma.ui.postMessage({
      type: "execution-complete",
      dryRun: dryRun,
      stats: stats,
    });
  } else if (msg.type === "execute-single") {
    var action = msg.action; // 'redundant' | 'empty' | 'group'
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
      executeGroupToFrame(singleNode, false, log);
      figma.notify("Grupo convertido em Frame.");
    }

    figma.ui.postMessage({
      type: "single-complete",
      id: msg.id,
      action: action,
    });
  }
};
