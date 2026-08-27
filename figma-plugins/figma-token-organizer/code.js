figma.showUI(__html__, {
  width: 650,
  height: 750,
  title: "Organizador de Tokens",
});

// --- HELPER FUNCTIONS ---

function rgbToHex(r, g, b) {
  const toHex = c => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToRgba(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  let a = 1;
  if (hex.length === 8) {
    a = parseInt(hex.substring(6, 8), 16) / 255;
  }
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
    a: isNaN(a) ? 1 : a
  };
}

function getFolderFromName(name) {
  const parts = name.split('/');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('/');
  }
  return "Styles";
}

const loadedFontsSet = new Set();
async function prepareTextNodeForStyleChange(node, targetStyleId) {
  if (node.type !== 'TEXT') return;
  try {
    // 1. Load target style's font if applicable
    if (targetStyleId) {
      const style = await figma.getStyleByIdAsync(targetStyleId);
      if (style && style.type === 'TEXT' && style.fontName) {
        const key = `${style.fontName.family}-${style.fontName.style}`;
        if (!loadedFontsSet.has(key)) {
          await figma.loadFontAsync(style.fontName).catch(() => {});
          loadedFontsSet.add(key);
        }
      }
    }
    // 2. Load all fonts currently used in the text node
    if (node.characters.length > 0) {
      const fonts = node.getRangeAllFontNames(0, node.characters.length);
      for (const font of fonts) {
        const key = `${font.family}-${font.style}`;
        if (!loadedFontsSet.has(key)) {
          await figma.loadFontAsync(font).catch(() => {});
          loadedFontsSet.add(key);
        }
      }
    } else if (node.fontName && node.fontName !== figma.mixed) {
      const key = `${node.fontName.family}-${node.fontName.style}`;
      if (!loadedFontsSet.has(key)) {
        await figma.loadFontAsync(node.fontName).catch(() => {});
        loadedFontsSet.add(key);
      }
    }
  } catch (e) {
    console.error("Erro ao carregar fontes para o nó de texto:", e);
  }
}

// --- SCANNING USAGES IN DOCUMENT ---

function scanUsages() {
  const tokenMap = {};

  // Get local variables
  const variables = figma.variables.getLocalVariables();
  variables.forEach(v => {
    tokenMap[v.id] = { id: v.id, type: 'variable', resolvedType: v.resolvedType, name: v.name, count: 0 };
  });

  // Get local styles
  const paintStyles = figma.getLocalPaintStyles();
  paintStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'paint', name: s.name, count: 0 };
  });

  const textStyles = figma.getLocalTextStyles();
  textStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'text', name: s.name, count: 0 };
  });

  const effectStyles = figma.getLocalEffectStyles();
  effectStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'effect', name: s.name, count: 0 };
  });

  const gridStyles = figma.getLocalGridStyles();
  gridStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'grid', name: s.name, count: 0 };
  });

  // Traverse all nodes to count usage
  function walk(node) {
    // 1. Style properties
    if ('fillStyleId' in node && node.fillStyleId) {
      const id = node.fillStyleId;
      if (id !== figma.mixed && tokenMap[id]) {
        tokenMap[id].count++;
      }
    }
    if ('strokeStyleId' in node && node.strokeStyleId) {
      const id = node.strokeStyleId;
      if (id !== figma.mixed && tokenMap[id]) {
        tokenMap[id].count++;
      }
    }
    if ('textStyleId' in node && node.textStyleId) {
      const id = node.textStyleId;
      if (id !== figma.mixed && tokenMap[id]) {
        tokenMap[id].count++;
      }
    }
    if ('effectStyleId' in node && node.effectStyleId) {
      const id = node.effectStyleId;
      if (id !== figma.mixed && tokenMap[id]) {
        tokenMap[id].count++;
      }
    }
    if ('gridStyleId' in node && node.gridStyleId) {
      const id = node.gridStyleId;
      if (id !== figma.mixed && tokenMap[id]) {
        tokenMap[id].count++;
      }
    }

    // 2. Bound variables
    if (node.boundVariables) {
      for (const prop in node.boundVariables) {
        const val = node.boundVariables[prop];
        if (!val) continue;
        if (Array.isArray(val)) {
          val.forEach(item => {
            if (item && item.type === 'VARIABLE_ALIAS' && tokenMap[item.id]) {
              tokenMap[item.id].count++;
            }
          });
        } else if (val.type === 'VARIABLE_ALIAS' && tokenMap[val.id]) {
          tokenMap[val.id].count++;
        }
      }
    }

    // 3. Mixed styles character traversal
    if (node.type === "TEXT") {
      if (node.textStyleId === figma.mixed) {
        try {
          const len = node.characters.length;
          let start = 0;
          while (start < len) {
            const styleId = node.getRangeTextStyleId(start, start + 1);
            if (styleId && tokenMap[styleId]) {
              tokenMap[styleId].count++;
            }
            start++;
          }
        } catch (e) {}
      }
      if (node.fillStyleId === figma.mixed) {
        try {
          const len = node.characters.length;
          let start = 0;
          while (start < len) {
            const styleId = node.getRangeFillStyleId(start, start + 1);
            if (styleId && tokenMap[styleId]) {
              tokenMap[styleId].count++;
            }
            start++;
          }
        } catch (e) {}
      }
    }

    // Recursive children traversal
    if ('children' in node && node.children) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]);
      }
    }
  }

  walk(figma.root);
  return tokenMap;
}

// --- SERIALIZE DATA FOR UI ---

function getSerializedTokens(tokenCounts) {
  const result = [];

  // 1. Local Variables
  const localVars = figma.variables.getLocalVariables();
  localVars.forEach(v => {
    let collectionName = "Variables";
    try {
      const coll = figma.variables.getVariableCollectionById(v.variableCollectionId);
      if (coll) collectionName = coll.name;
    } catch (e) {}

    let rawValue = null;
    let formattedValue = "";
    try {
      const modeIds = Object.keys(v.valuesByMode);
      if (modeIds.length > 0) {
        rawValue = v.valuesByMode[modeIds[0]];
        if (rawValue && typeof rawValue === 'object') {
          if ('r' in rawValue && 'g' in rawValue && 'b' in rawValue) {
            const a = 'a' in rawValue ? Math.round(rawValue.a * 100) / 100 : 1;
            formattedValue = rgbToHex(rawValue.r, rawValue.g, rawValue.b);
            if (a < 1) formattedValue += ` (${Math.round(a * 100)}%)`;
          } else if (rawValue.type === 'VARIABLE_ALIAS') {
            formattedValue = `Alias: ${rawValue.id}`;
          }
        } else {
          formattedValue = String(rawValue);
        }
      }
    } catch (e) {
      formattedValue = "Error";
    }

    let category = 'other';
    if (v.resolvedType === 'COLOR') category = 'color';
    else if (v.resolvedType === 'FLOAT') category = 'spacing';
    else if (v.resolvedType === 'STRING') category = 'text';

    result.push({
      id: v.id,
      name: v.name,
      source: 'variable',
      subType: v.resolvedType,
      category: category,
      collectionOrFolder: collectionName,
      description: v.description || "",
      count: (tokenCounts[v.id] && tokenCounts[v.id].count) || 0,
      rawValue: rawValue,
      propertiesText: formattedValue
    });
  });

  // 2. Paint Styles
  const paintStyles = figma.getLocalPaintStyles();
  paintStyles.forEach(s => {
    let formattedValue = "";
    let rawValue = null;
    let paintType = "SOLID";

    if (s.paints && s.paints.length > 0) {
      const firstPaint = s.paints[0];
      paintType = firstPaint.type;
      if (firstPaint.type === 'SOLID') {
        rawValue = {
          r: firstPaint.color.r,
          g: firstPaint.color.g,
          b: firstPaint.color.b,
          a: firstPaint.opacity !== undefined ? firstPaint.opacity : 1
        };
        formattedValue = rgbToHex(firstPaint.color.r, firstPaint.color.g, firstPaint.color.b);
        if (firstPaint.opacity !== undefined && firstPaint.opacity < 1) {
          formattedValue += ` (${Math.round(firstPaint.opacity * 100)}%)`;
        }
      } else {
        formattedValue = firstPaint.type.toLowerCase().replace('_', ' ');
      }
    } else {
      formattedValue = "Empty Style";
    }

    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'paint',
      category: 'color',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      rawValue: rawValue,
      paintType: paintType,
      propertiesText: formattedValue
    });
  });

  // 3. Text Styles
  const textStyles = figma.getLocalTextStyles();
  textStyles.forEach(s => {
    let fontName = s.fontName || { family: "Inter", style: "Regular" };
    let fontSize = s.fontSize || 16;
    let lineHeightText = "Auto";
    if (s.lineHeight) {
      if (s.lineHeight.unit === 'PIXELS') {
        lineHeightText = `${Math.round(s.lineHeight.value)}px`;
      } else if (s.lineHeight.unit === 'PERCENT') {
        lineHeightText = `${Math.round(s.lineHeight.value)}%`;
      }
    }

    let propertiesText = `${fontName.family} ${fontName.style}, ${fontSize}px / ${lineHeightText}`;

    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'text',
      category: 'text',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      rawValue: {
        fontName: fontName,
        fontSize: fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing
      },
      propertiesText: propertiesText
    });
  });

  // 4. Effect Styles
  const effectStyles = figma.getLocalEffectStyles();
  effectStyles.forEach(s => {
    const count = s.effects ? s.effects.length : 0;
    const propertiesText = `${count} effect(s)`;
    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'effect',
      category: 'other',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      rawValue: s.effects,
      propertiesText: propertiesText
    });
  });

  // 5. Local Grid Styles
  const gridStyles = figma.getLocalGridStyles();
  gridStyles.forEach(s => {
    const count = s.layoutGrids ? s.layoutGrids.length : 0;
    const propertiesText = `${count} grid(s)`;
    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'grid',
      category: 'other',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      rawValue: s.layoutGrids,
      propertiesText: propertiesText
    });
  });

  return result;
}

// --- FIND DUPLICATE GROUPS ---

function findDuplicates(tokens) {
  const groups = {};

  tokens.forEach(t => {
    let key = null;

    if (t.category === 'color') {
      if (t.rawValue && t.rawValue.r !== undefined) {
        const r = Math.round(t.rawValue.r * 255);
        const g = Math.round(t.rawValue.g * 255);
        const b = Math.round(t.rawValue.b * 255);
        const a = t.rawValue.a !== undefined ? Math.round(t.rawValue.a * 100) : 100;
        // Group by value and source to prevent swapping variables with styles unless desired
        key = `${t.source}-color-${r}-${g}-${b}-${a}`;
      }
    } else if (t.category === 'spacing' && t.subType === 'FLOAT') {
      if (t.rawValue !== null && typeof t.rawValue === 'number') {
        key = `spacing-${t.rawValue}`;
      }
    } else if (t.category === 'text' && t.subType === 'text') {
      const rv = t.rawValue;
      if (rv && rv.fontName) {
        const fam = rv.fontName.family;
        const sty = rv.fontName.style;
        const size = rv.fontSize;
        const lhUnit = rv.lineHeight ? rv.lineHeight.unit : 'AUTO';
        const lhVal = rv.lineHeight ? rv.lineHeight.value || 0 : 0;
        key = `textstyle-${fam}-${sty}-${size}-${lhUnit}-${lhVal}`;
      }
    } else if (t.category === 'text' && t.subType === 'STRING') {
      if (t.rawValue !== null) {
        key = `stringvar-${t.rawValue}`;
      }
    }

    if (key) {
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(t);
    }
  });

  const duplicateGroups = [];
  for (const key in groups) {
    if (groups[key].length > 1) {
      duplicateGroups.push({
        key: key,
        type: groups[key][0].category,
        subType: groups[key][0].subType,
        source: groups[key][0].source,
        propertiesText: groups[key][0].propertiesText,
        rawValue: groups[key][0].rawValue,
        tokens: groups[key]
      });
    }
  }

  return duplicateGroups;
}

// --- REPLACE VARIABLE IN A SINGLE NODE ---

function replaceVariableInNode(node, oldVarId, newVar) {
  let changed = false;
  if (!node.boundVariables) return changed;

  for (const property in node.boundVariables) {
    const binding = node.boundVariables[property];
    if (!binding) continue;

    if (property === 'fills' || property === 'strokes') {
      if (Array.isArray(binding)) {
        let paintsChanged = false;
        const currentPaints = property === 'fills' ? node.fills : node.strokes;
        if (!currentPaints) continue;

        const newPaints = currentPaints.map((paint, idx) => {
          const paintBinding = binding[idx];
          if (paintBinding && paintBinding.type === 'VARIABLE_ALIAS' && paintBinding.id === oldVarId) {
            paintsChanged = true;
            changed = true;
            return figma.variables.setBoundVariableForPaint(paint, 'color', newVar);
          }
          return paint;
        });

        if (paintsChanged) {
          if (property === 'fills') {
            node.fills = newPaints;
          } else {
            node.strokes = newPaints;
          }
        }
      }
    } else {
      if (binding.type === 'VARIABLE_ALIAS' && binding.id === oldVarId) {
        try {
          node.setBoundVariable(property, newVar);
          changed = true;
        } catch (e) {
          console.error(`Error setting bound variable for property ${property} on node ${node.id}:`, e);
        }
      }
    }
  }
  return changed;
}

// --- SCANNING DETACHED / UNBOUND ELEMENTS ---

function scanDetachedElements() {
  const detached = [];
  const pages = figma.root.children;
  const paintStyles = figma.getLocalPaintStyles();

  // A variable-bound paint is not detached, but it can still be using the
  // raw token where an equivalent Paint Style already exists.
  function hasPaintVariable(node, paint, property, paintIndex) {
    const nodeBinding = node.boundVariables && node.boundVariables[property];
    return !!(
      (paint && paint.boundVariables && paint.boundVariables.color) ||
      (Array.isArray(nodeBinding) ? nodeBinding[paintIndex] : nodeBinding)
    );
  }

  function hasEquivalentPaintStyle(paint) {
    if (!paint || paint.type !== 'SOLID') return false;
    const opacity = paint.opacity !== undefined ? paint.opacity : 1;
    return paintStyles.some(style => {
      if (!style.paints || style.paints.length !== 1) return false;
      const stylePaint = style.paints[0];
      const styleOpacity = stylePaint.opacity !== undefined ? stylePaint.opacity : 1;
      return stylePaint.type === 'SOLID' &&
        Math.abs(stylePaint.color.r - paint.color.r) < 0.0001 &&
        Math.abs(stylePaint.color.g - paint.color.g) < 0.0001 &&
        Math.abs(stylePaint.color.b - paint.color.b) < 0.0001 &&
        Math.abs(styleOpacity - opacity) < 0.0001;
    });
  }

  for (const page of pages) {
    if (page.type !== 'PAGE') continue;

    function walk(node) {
      if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
        if ('children' in node && node.children) {
          for (let i = 0; i < node.children.length; i++) {
            walk(node.children[i]);
          }
        }
        return;
      }

      // 1. Fills (Colors)
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        const hasStyle = node.fillStyleId && node.fillStyleId !== figma.mixed && node.fillStyleId !== '';
        if (!hasStyle) {
          node.fills.forEach((paint, pIdx) => {
            if (paint.type === 'SOLID' && paint.visible !== false) {
              const hasVar = hasPaintVariable(node, paint, 'fills', pIdx);
              if (!hasVar || hasEquivalentPaintStyle(paint)) {
                const r = paint.color.r;
                const g = paint.color.g;
                const b = paint.color.b;
                const a = paint.opacity !== undefined ? paint.opacity : 1;
                const hex = rgbToHex(r, g, b);
                let formatted = hex;
                if (a < 1) formatted += ` (${Math.round(a * 100)}%)`;

                detached.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Sem nome',
                  nodeType: node.type,
                  pageId: page.id,
                  pageName: page.name,
                  prop: 'fill',
                  category: 'color',
                  paintIndex: pIdx,
                  rawValue: { r, g, b, a },
                  formattedValue: formatted,
                  hasVariable: hasVar,
                  preferStyle: hasVar
                });
              }
            }
          });
        }
      }

      // 2. Strokes (Colors)
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const hasStyle = node.strokeStyleId && node.strokeStyleId !== figma.mixed && node.strokeStyleId !== '';
        if (!hasStyle) {
          node.strokes.forEach((paint, pIdx) => {
            if (paint.type === 'SOLID' && paint.visible !== false) {
              const hasVar = hasPaintVariable(node, paint, 'strokes', pIdx);
              if (!hasVar || hasEquivalentPaintStyle(paint)) {
                const r = paint.color.r;
                const g = paint.color.g;
                const b = paint.color.b;
                const a = paint.opacity !== undefined ? paint.opacity : 1;
                const hex = rgbToHex(r, g, b);
                let formatted = hex;
                if (a < 1) formatted += ` (${Math.round(a * 100)}%)`;

                detached.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Sem nome',
                  nodeType: node.type,
                  pageId: page.id,
                  pageName: page.name,
                  prop: 'stroke',
                  category: 'color',
                  paintIndex: pIdx,
                  rawValue: { r, g, b, a },
                  formattedValue: formatted,
                  hasVariable: hasVar,
                  preferStyle: hasVar
                });
              }
            }
          });
        }
      }

      // 3. Text Styles
      if (node.type === 'TEXT') {
        const hasStyle = node.textStyleId && node.textStyleId !== figma.mixed && node.textStyleId !== '';
        if (!hasStyle) {
          if (node.fontName && node.fontName !== figma.mixed) {
            const fontName = node.fontName;
            const fontSize = node.fontSize !== figma.mixed ? node.fontSize : 16;
            const lineHeight = node.lineHeight !== figma.mixed ? node.lineHeight : { unit: 'AUTO' };
            const letterSpacing = node.letterSpacing !== figma.mixed ? node.letterSpacing : { unit: 'PERCENT', value: 0 };
            
            let lhText = "Auto";
            if (lineHeight.unit === 'PIXELS') lhText = `${Math.round(lineHeight.value)}px`;
            else if (lineHeight.unit === 'PERCENT') lhText = `${Math.round(lineHeight.value)}%`;

            detached.push({
              nodeId: node.id,
              nodeName: node.name || 'Texto',
              nodeType: node.type,
              pageId: page.id,
              pageName: page.name,
              prop: 'text',
              category: 'text',
              rawValue: {
                fontName: fontName,
                fontSize: fontSize,
                lineHeight: lineHeight,
                letterSpacing: letterSpacing
              },
              formattedValue: `${fontName.family} ${fontName.style}, ${fontSize}px / ${lhText}`
            });
          }
        }
      }

      // 4. Effect Styles
      if ('effects' in node && Array.isArray(node.effects) && node.effects.length > 0) {
        const hasStyle = node.effectStyleId && node.effectStyleId !== figma.mixed && node.effectStyleId !== '';
        if (!hasStyle) {
          const visibleEffects = node.effects.filter(e => e.visible !== false);
          if (visibleEffects.length > 0) {
            detached.push({
              nodeId: node.id,
              nodeName: node.name || 'Elemento',
              nodeType: node.type,
              pageId: page.id,
              pageName: page.name,
              prop: 'effect',
              category: 'other',
              rawValue: visibleEffects,
              formattedValue: `${visibleEffects.length} efeito(s) (${visibleEffects.map(e => e.type.toLowerCase().replace('_', ' ')).join(', ')})`
            });
          }
        }
      }

      if ('children' in node && node.children) {
        for (let i = 0; i < node.children.length; i++) {
          walk(node.children[i]);
        }
      }
    }

    walk(page);
  }

  return detached;
}

// --- APPLY FIX HELPER ---

async function applyFixToNode(node, fix) {
  let changed = false;
  const { prop, targetTokenId, source, paintIndex } = fix;

  if (prop === 'fill') {
    if (source === 'style') {
      node.fillStyleId = targetTokenId;
      changed = true;
    } else {
      const targetVar = await figma.variables.getVariableByIdAsync(targetTokenId);
      if (targetVar && Array.isArray(node.fills)) {
        const newFills = node.fills.map((paint, idx) => {
          if (paint.type === 'SOLID') {
            if (paintIndex === undefined || idx === paintIndex) {
              return figma.variables.setBoundVariableForPaint(paint, 'color', targetVar);
            }
          }
          return paint;
        });
        node.fills = newFills;
        changed = true;
      }
    }
  } else if (prop === 'stroke') {
    if (source === 'style') {
      node.strokeStyleId = targetTokenId;
      changed = true;
    } else {
      const targetVar = await figma.variables.getVariableByIdAsync(targetTokenId);
      if (targetVar && Array.isArray(node.strokes)) {
        const newStrokes = node.strokes.map((paint, idx) => {
          if (paint.type === 'SOLID') {
            if (paintIndex === undefined || idx === paintIndex) {
              return figma.variables.setBoundVariableForPaint(paint, 'color', targetVar);
            }
          }
          return paint;
        });
        node.strokes = newStrokes;
        changed = true;
      }
    }
  } else if (prop === 'text') {
    if (source === 'style' && node.type === 'TEXT') {
      await prepareTextNodeForStyleChange(node, targetTokenId);
      node.textStyleId = targetTokenId;
      changed = true;
    }
  } else if (prop === 'effect') {
    if (source === 'style') {
      node.effectStyleId = targetTokenId;
      changed = true;
    }
  }

  return changed;
}

// --- ANALYSIS CONTROLLER ---

function performAnalysis() {
  figma.ui.postMessage({ type: "status", text: "Analisando documento..." });
  const counts = scanUsages();
  const tokens = getSerializedTokens(counts);
  const duplicates = findDuplicates(tokens);
  const detached = scanDetachedElements();

  figma.ui.postMessage({
    type: "analysis-result",
    tokens: tokens,
    duplicates: duplicates,
    detached: detached
  });
}

// --- MESSAGE HANDLER ---

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "analyze") {
      performAnalysis();
    }

    if (msg.type === "delete-token") {
      const { id, source } = msg;
      if (source === 'variable') {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) {
          v.remove();
          figma.notify("Variável excluída.");
        }
      } else {
        const s = await figma.getStyleByIdAsync(id);
        if (s) {
          s.remove();
          figma.notify("Estilo excluído.");
        }
      }
      performAnalysis();
    }

    if (msg.type === "delete-multiple-tokens") {
      const { tokens: tokensToDelete } = msg;
      let deletedCount = 0;
      for (const t of tokensToDelete) {
        try {
          if (t.source === 'variable') {
            const v = await figma.variables.getVariableByIdAsync(t.id);
            if (v) {
              v.remove();
              deletedCount++;
            }
          } else {
            const s = await figma.getStyleByIdAsync(t.id);
            if (s) {
              s.remove();
              deletedCount++;
            }
          }
        } catch (e) {
          console.error("Erro ao excluir token: ", e);
        }
      }
      figma.notify(`${deletedCount} tokens não utilizados foram excluídos.`);
      performAnalysis();
    }

    if (msg.type === "select-elements") {
      const { id, source } = msg;
      const matchingNodes = [];

      function walkSelect(node) {
        let found = false;

        if (source === 'style') {
          if ('fillStyleId' in node && node.fillStyleId === id) found = true;
          if ('strokeStyleId' in node && node.strokeStyleId === id) found = true;
          if ('textStyleId' in node && node.textStyleId === id) found = true;
          if ('effectStyleId' in node && node.effectStyleId === id) found = true;
          if ('gridStyleId' in node && node.gridStyleId === id) found = true;

          // Mixed text styles
          if (node.type === "TEXT") {
            if (node.textStyleId === figma.mixed) {
              try {
                const len = node.characters.length;
                for (let i = 0; i < len; i++) {
                  if (node.getRangeTextStyleId(i, i + 1) === id) {
                    found = true;
                    break;
                  }
                }
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                const len = node.characters.length;
                for (let i = 0; i < len; i++) {
                  if (node.getRangeFillStyleId(i, i + 1) === id) {
                    found = true;
                    break;
                  }
                }
              } catch (e) {}
            }
          }
        } else {
          // Variable bindings
          if (node.boundVariables) {
            for (const prop in node.boundVariables) {
              const val = node.boundVariables[prop];
              if (!val) continue;
              if (Array.isArray(val)) {
                for (const item of val) {
                  if (item && item.type === 'VARIABLE_ALIAS' && item.id === id) {
                    found = true;
                    break;
                  }
                }
              } else if (val.type === 'VARIABLE_ALIAS' && val.id === id) {
                found = true;
              }
              if (found) break;
            }
          }
        }

        if (found && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
          matchingNodes.push(node);
        }

        if ('children' in node && node.children) {
          for (const child of node.children) {
            walkSelect(child);
          }
        }
      }

      walkSelect(figma.root);

      if (matchingNodes.length > 0) {
        // Navigate to the page of the first matching node
        const firstNode = matchingNodes[0];
        let parentPage = firstNode;
        while (parentPage && parentPage.type !== 'PAGE') {
          parentPage = parentPage.parent;
        }
        if (parentPage) {
          figma.currentPage = parentPage;
        }

        // Select only nodes on current page
        const pageNodes = matchingNodes.filter(n => {
          let p = n;
          while (p && p.type !== 'PAGE') p = p.parent;
          return p === figma.currentPage;
        });

        figma.currentPage.selection = pageNodes;
        figma.viewport.scrollAndZoomIntoView(pageNodes);
        figma.notify(`${matchingNodes.length} elemento(s) selecionado(s).`);
      } else {
        figma.notify("Nenhum elemento encontrado usando este token.");
      }
      figma.ui.postMessage({ type: "select-done" });
    }

    if (msg.type === "add-token") {
      const { name, category, source, value } = msg;
      
      if (source === 'variable') {
        let collections = figma.variables.getLocalVariableCollections();
        let collection = collections[0];
        if (!collection) {
          collection = figma.variables.createVariableCollection("Tokens");
        }
        const modeId = collection.modes[0].modeId;

        let resolvedType = 'FLOAT';
        let initialValue = 0;

        if (category === 'color') {
          resolvedType = 'COLOR';
          initialValue = value ? hexToRgba(value) : { r: 0.5, g: 0.5, b: 0.5, a: 1 };
        } else if (category === 'spacing') {
          resolvedType = 'FLOAT';
          initialValue = value !== undefined ? parseFloat(value) : 8;
        } else if (category === 'text') {
          resolvedType = 'STRING';
          initialValue = value !== undefined ? String(value) : "Texto";
        } else if (category === 'other') {
          resolvedType = 'BOOLEAN';
          initialValue = value === true || value === 'true';
        }

        const newVar = figma.variables.createVariable(name, collection, resolvedType);
        newVar.setValueForMode(modeId, initialValue);
        figma.notify("Variável criada com sucesso.");
      } else {
        if (category === 'color') {
          const style = figma.createPaintStyle();
          style.name = name;
          const rgba = value ? hexToRgba(value) : { r: 0.5, g: 0.5, b: 0.5, a: 1 };
          style.paints = [{ type: 'SOLID', color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: rgba.a }];
          figma.notify("Estilo de pintura criado.");
        } else if (category === 'text') {
          const style = figma.createTextStyle();
          style.name = name;
          const fontName = { family: "Inter", style: "Regular" };
          await figma.loadFontAsync(fontName);
          style.fontName = fontName;
          style.fontSize = value ? parseFloat(value) : 16;
          figma.notify("Estilo de texto criado.");
        } else {
          figma.notify("Criação deste estilo não suportada.");
        }
      }
      performAnalysis();
    }

    if (msg.type === "update-token") {
      const { id, source, name, value } = msg;

      if (source === 'variable') {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) {
          v.name = name;
          const coll = figma.variables.getVariableCollectionById(v.variableCollectionId);
          if (coll) {
            const modeId = coll.modes[0].modeId;
            let resolvedValue = value;
            if (v.resolvedType === 'COLOR') {
              resolvedValue = hexToRgba(value);
            } else if (v.resolvedType === 'FLOAT') {
              resolvedValue = parseFloat(value);
            } else if (v.resolvedType === 'BOOLEAN') {
              resolvedValue = value === true || value === 'true';
            }
            v.setValueForMode(modeId, resolvedValue);
          }
          figma.notify("Variável atualizada.");
        }
      } else {
        const s = await figma.getStyleByIdAsync(id);
        if (s) {
          s.name = name;
          if (s.type === 'PAINT') {
            const rgba = hexToRgba(value);
            s.paints = [{ type: 'SOLID', color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: rgba.a }];
          } else if (s.type === 'TEXT') {
            if (value && typeof value === 'object') {
              if (value.fontFamily && value.fontStyle) {
                const font = { family: value.fontFamily, style: value.fontStyle };
                await figma.loadFontAsync(font);
                s.fontName = font;
              }
              if (value.fontSize) {
                s.fontSize = parseFloat(value.fontSize);
              }
            }
          }
          figma.notify("Estilo atualizado.");
        }
      }
      performAnalysis();
    }

    if (msg.type === "replace-token") {
      const { oldTokenId, source, newTokenId } = msg;
      let replacedCount = 0;

      figma.ui.postMessage({ type: "status", text: "Substituindo tokens no documento..." });

      if (source === 'style') {
        async function walk(node) {
          let changed = false;

          if (node.type === "TEXT") {
            const isTargetStyleText = (oldTokenId === node.textStyleId) || (node.textStyleId === figma.mixed);
            if (isTargetStyleText) {
              await prepareTextNodeForStyleChange(node, newTokenId);
            }
          }

          if ('fillStyleId' in node && node.fillStyleId === oldTokenId) {
            node.fillStyleId = newTokenId;
            changed = true;
          }
          if ('strokeStyleId' in node && node.strokeStyleId === oldTokenId) {
            node.strokeStyleId = newTokenId;
            changed = true;
          }
          if ('textStyleId' in node && node.textStyleId === oldTokenId) {
            node.textStyleId = newTokenId;
            changed = true;
          }
          if ('effectStyleId' in node && node.effectStyleId === oldTokenId) {
            node.effectStyleId = newTokenId;
            changed = true;
          }
          if ('gridStyleId' in node && node.gridStyleId === oldTokenId) {
            node.gridStyleId = newTokenId;
            changed = true;
          }

          // Mixed styles character replacements in text node
          if (node.type === "TEXT") {
            if (node.textStyleId === figma.mixed) {
              try {
                let start = 0;
                const len = node.characters.length;
                while (start < len) {
                  const styleId = node.getRangeTextStyleId(start, start + 1);
                  if (styleId === oldTokenId) {
                    node.setRangeTextStyleId(start, start + 1, newTokenId);
                    changed = true;
                  }
                  start++;
                }
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                let start = 0;
                const len = node.characters.length;
                while (start < len) {
                  const styleId = node.getRangeFillStyleId(start, start + 1);
                  if (styleId === oldTokenId) {
                    node.setRangeFillStyleId(start, start + 1, newTokenId);
                    changed = true;
                  }
                  start++;
                }
              } catch (e) {}
            }
          }

          if (changed) replacedCount++;

          if ('children' in node && node.children) {
            for (let i = 0; i < node.children.length; i++) {
              await walk(node.children[i]);
            }
          }
        }
        await walk(figma.root);
      } else {
        const newVar = await figma.variables.getVariableByIdAsync(newTokenId);
        if (newVar) {
          function walk(node) {
            let changed = replaceVariableInNode(node, oldTokenId, newVar);
            if (changed) replacedCount++;

            if ('children' in node && node.children) {
              for (let i = 0; i < node.children.length; i++) {
                walk(node.children[i]);
              }
            }
          }
          walk(figma.root);
        }
      }

      figma.notify(`${replacedCount} elementos atualizados para o novo token.`);
      performAnalysis();
    }

    if (msg.type === "consolidate-duplicates") {
      const { canonicalId, duplicateIds, source } = msg;
      let replacedCount = 0;

      figma.ui.postMessage({ type: "status", text: "Consolidando duplicados..." });

      if (source === 'style') {
        async function walk(node) {
          let changed = false;

          if (node.type === "TEXT") {
            const isTargetStyleText = duplicateIds.includes(node.textStyleId) || (node.textStyleId === figma.mixed);
            if (isTargetStyleText) {
              await prepareTextNodeForStyleChange(node, canonicalId);
            }
          }

          if ('fillStyleId' in node && duplicateIds.includes(node.fillStyleId)) {
            node.fillStyleId = canonicalId;
            changed = true;
          }
          if ('strokeStyleId' in node && duplicateIds.includes(node.strokeStyleId)) {
            node.strokeStyleId = canonicalId;
            changed = true;
          }
          if ('textStyleId' in node && duplicateIds.includes(node.textStyleId)) {
            node.textStyleId = canonicalId;
            changed = true;
          }
          if ('effectStyleId' in node && duplicateIds.includes(node.effectStyleId)) {
            node.effectStyleId = canonicalId;
            changed = true;
          }
          if ('gridStyleId' in node && duplicateIds.includes(node.gridStyleId)) {
            node.gridStyleId = canonicalId;
            changed = true;
          }

          // Mixed styles
          if (node.type === "TEXT") {
            if (node.textStyleId === figma.mixed) {
              try {
                let start = 0;
                const len = node.characters.length;
                while (start < len) {
                  const styleId = node.getRangeTextStyleId(start, start + 1);
                  if (duplicateIds.includes(styleId)) {
                    node.setRangeTextStyleId(start, start + 1, canonicalId);
                    changed = true;
                  }
                  start++;
                }
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                let start = 0;
                const len = node.characters.length;
                while (start < len) {
                  const styleId = node.getRangeFillStyleId(start, start + 1);
                  if (duplicateIds.includes(styleId)) {
                    node.setRangeFillStyleId(start, start + 1, canonicalId);
                    changed = true;
                  }
                  start++;
                }
              } catch (e) {}
            }
          }

          if (changed) replacedCount++;

          if ('children' in node && node.children) {
            for (let i = 0; i < node.children.length; i++) {
              await walk(node.children[i]);
            }
          }
        }
        await walk(figma.root);

        // Delete duplicate styles
        for (const id of duplicateIds) {
          const s = await figma.getStyleByIdAsync(id);
          if (s) s.remove();
        }
      } else {
        const canonicalVar = await figma.variables.getVariableByIdAsync(canonicalId);
        if (canonicalVar) {
          function walk(node) {
            let nodeChanged = false;
            duplicateIds.forEach(dupId => {
              if (replaceVariableInNode(node, dupId, canonicalVar)) {
                nodeChanged = true;
              }
            });
            if (nodeChanged) replacedCount++;

            if ('children' in node && node.children) {
              for (let i = 0; i < node.children.length; i++) {
                walk(node.children[i]);
              }
            }
          }
          walk(figma.root);

          // Delete duplicate variables
          for (const id of duplicateIds) {
            const v = await figma.variables.getVariableByIdAsync(id);
            if (v) v.remove();
          }
        }
      }

      figma.notify(`Consolidado! ${replacedCount} elementos atualizados. Tokens duplicados removidos.`);
      performAnalysis();
    }

    if (msg.type === "fix-detached") {
      const { fixes } = msg;
      let appliedCount = 0;
      figma.ui.postMessage({ type: "status", text: "Aplicando tokens aos elementos..." });

      for (const fix of fixes) {
        try {
          const node = figma.getNodeById ? figma.getNodeById(fix.nodeId) : null;
          if (node) {
            const changed = await applyFixToNode(node, fix);
            if (changed) appliedCount++;
          }
        } catch (e) {
          console.error("Erro ao aplicar correção no nó:", e);
        }
      }

      figma.notify(`${appliedCount} elemento(s) corrigido(s) com sucesso.`);
      performAnalysis();
    }

    if (msg.type === "auto-fix-all") {
      const { fixes } = msg;
      let appliedCount = 0;
      figma.ui.postMessage({ type: "status", text: "Executando Auto Fix em lote..." });

      for (const fix of fixes) {
        try {
          const node = figma.getNodeById ? figma.getNodeById(fix.nodeId) : null;
          if (node) {
            const changed = await applyFixToNode(node, fix);
            if (changed) appliedCount++;
          }
        } catch (e) {
          console.error("Erro no Auto Fix do nó:", e);
        }
      }

      figma.notify(`Auto Fix concluído! ${appliedCount} elemento(s) vinculados a tokens.`);
      performAnalysis();
    }

    if (msg.type === "select-detached-nodes") {
      const { nodeIds } = msg;
      const nodes = [];
      for (const id of nodeIds) {
        const n = figma.getNodeById ? figma.getNodeById(id) : null;
        if (n && n.type !== 'DOCUMENT' && n.type !== 'PAGE') {
          nodes.push(n);
        }
      }
      if (nodes.length > 0) {
        let parentPage = nodes[0];
        while (parentPage && parentPage.type !== 'PAGE') {
          parentPage = parentPage.parent;
        }
        if (parentPage) {
          figma.currentPage = parentPage;
        }
        const pageNodes = nodes.filter(n => {
          let p = n;
          while (p && p.type !== 'PAGE') p = p.parent;
          return p === figma.currentPage;
        });
        figma.currentPage.selection = pageNodes;
        figma.viewport.scrollAndZoomIntoView(pageNodes);
        figma.notify(`${pageNodes.length} elemento(s) selecionado(s) no Figma.`);
      } else {
        figma.notify("Nenhum elemento encontrado no documento.");
      }
    }

    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (e) {
    console.error(e);
    figma.notify("Erro: " + e.message);
    figma.ui.postMessage({ type: "error", text: "Erro: " + e.message });
  }
};
