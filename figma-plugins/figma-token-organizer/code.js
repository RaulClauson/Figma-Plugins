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

// These are the numeric node properties that Figma exposes as bindable
// fields. Width/height and min/max dimensions are intentionally excluded:
// treating every layer dimension as a design-token candidate creates a large
// amount of noise and does not represent spacing/radius/border tokens.
const NUMERIC_TOKEN_FIELDS = [
  { field: 'paddingTop', label: 'Padding superior', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'paddingRight', label: 'Padding direito', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'paddingBottom', label: 'Padding inferior', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'paddingLeft', label: 'Padding esquerdo', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'itemSpacing', label: 'Espaçamento entre itens', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'counterAxisSpacing', label: 'Espaçamento no eixo cruzado', kind: 'auto-layout', tokenKind: 'spacing' },
  { field: 'gridRowGap', label: 'Gap entre linhas', kind: 'grid', tokenKind: 'spacing' },
  { field: 'gridColumnGap', label: 'Gap entre colunas', kind: 'grid', tokenKind: 'spacing' },
  { field: 'cornerRadius', label: 'Raio dos cantos', kind: 'radius', tokenKind: 'radius' },
  { field: 'topLeftRadius', label: 'Raio superior esquerdo', kind: 'radius', tokenKind: 'radius' },
  { field: 'topRightRadius', label: 'Raio superior direito', kind: 'radius', tokenKind: 'radius' },
  { field: 'bottomRightRadius', label: 'Raio inferior direito', kind: 'radius', tokenKind: 'radius' },
  { field: 'bottomLeftRadius', label: 'Raio inferior esquerdo', kind: 'radius', tokenKind: 'radius' },
  { field: 'strokeWeight', label: 'Peso da borda', kind: 'stroke', tokenKind: 'stroke' },
  { field: 'strokeTopWeight', label: 'Peso da borda superior', kind: 'stroke', tokenKind: 'stroke' },
  { field: 'strokeRightWeight', label: 'Peso da borda direita', kind: 'stroke', tokenKind: 'stroke' },
  { field: 'strokeBottomWeight', label: 'Peso da borda inferior', kind: 'stroke', tokenKind: 'stroke' },
  { field: 'strokeLeftWeight', label: 'Peso da borda esquerda', kind: 'stroke', tokenKind: 'stroke' },
  { field: 'opacity', label: 'Opacidade', kind: 'opacity', tokenKind: 'opacity' }
];
const NUMERIC_TOKEN_FIELD_NAMES = new Set(NUMERIC_TOKEN_FIELDS.map(definition => definition.field));
const EQUIVALENT_BOUND_FIELDS = {
  // Figma may expose a uniform radius/stroke as a numeric aggregate while
  // retaining its variable bindings in individual side/corner fields.
  cornerRadius: ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'],
  topLeftRadius: ['topLeftRadius', 'cornerRadius'],
  topRightRadius: ['topRightRadius', 'cornerRadius'],
  bottomRightRadius: ['bottomRightRadius', 'cornerRadius'],
  bottomLeftRadius: ['bottomLeftRadius', 'cornerRadius'],
  strokeWeight: ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'],
  strokeTopWeight: ['strokeTopWeight', 'strokeWeight'],
  strokeRightWeight: ['strokeRightWeight', 'strokeWeight'],
  strokeBottomWeight: ['strokeBottomWeight', 'strokeWeight'],
  strokeLeftWeight: ['strokeLeftWeight', 'strokeWeight']
};

function getTokenKind(name, collectionOrFolder, resolvedType) {
  if (resolvedType === 'COLOR') return 'color';
  const path = `${collectionOrFolder || ''}/${name || ''}`
    .toLowerCase()
    .replace(/[\s_\-/]+/g, ' ')
    .trim();
  if (/\bopacity\b/.test(path)) return 'opacity';
  if (/\beffect\s*radius\b/.test(path)) return 'effect-radius';
  if (/\beffect\s*spread\b/.test(path)) return 'effect-spread';
  if (/\beffect\s*(offset\s*x|x)\b/.test(path)) return 'effect-offset-x';
  if (/\beffect\s*(offset\s*y|y)\b/.test(path)) return 'effect-offset-y';
  if (/\bradius\b/.test(path)) return 'radius';
  if (/\bstroke\b/.test(path)) return 'stroke';
  if (/\bfont\s*size\b/.test(path)) return 'font-size';
  if (/\bfont\s*weight\b/.test(path)) return 'font-weight';
  if (/\bfont\s*(family|familly)\b/.test(path)) return 'font-family';
  if (/\bfont\s*style\b/.test(path)) return 'font-style';
  if (/\bline\s*height\b/.test(path)) return /percent|%/.test(path) ? 'line-height-percent' : 'line-height-pixels';
  if (/\bletter\s*spacing\b/.test(path)) return /percent|%/.test(path) ? 'letter-spacing-percent' : 'letter-spacing-pixels';
  if (/\bpadding\b/.test(path)) return 'spacing';
  if (/\b(spacing|gap)\b/.test(path)) return 'spacing';
  return 'unclassified';
}

function createAnalysisContext() {
  const variables = figma.variables.getLocalVariables();
  const variableCollections = figma.variables.getLocalVariableCollections();
  const paintStyles = figma.getLocalPaintStyles();
  const textStyles = figma.getLocalTextStyles();
  const effectStyles = figma.getLocalEffectStyles();
  const gridStyles = figma.getLocalGridStyles();
  const variablesById = Object.create(null);
  const collectionsById = Object.create(null);
  const paintStylesByColor = new Map();

  variables.forEach(variable => { variablesById[variable.id] = variable; });
  paintStyles.forEach(style => {
    if (!style.paints || style.paints.length !== 1) return;
    const paint = style.paints[0];
    if (!paint || paint.type !== 'SOLID') return;
    const opacity = paint.opacity !== undefined ? paint.opacity : 1;
    const key = paintColorKey(paint.color.r, paint.color.g, paint.color.b, opacity);
    if (!paintStylesByColor.has(key)) paintStylesByColor.set(key, []);
    paintStylesByColor.get(key).push({ paint, styleContext: getPaintStyleContext(style.name) });
  });

  return {
    variables, variableCollections, paintStyles, textStyles, effectStyles, gridStyles,
    variablesById, collectionsById, paintStylesByColor
  };
}

function collectDocumentNodes() {
  const nodes = [];
  const stack = [{ node: figma.root, page: null }];
  while (stack.length > 0) {
    const entry = stack.pop();
    const node = entry.node;
    const page = node.type === 'PAGE' ? node : entry.page;
    nodes.push({ node, page });
    if ('children' in node && node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], page });
      }
    }
  }
  return nodes;
}

function paintColorKey(r, g, b, a) {
  return [r, g, b, a].map(value => Math.floor(value * 10000)).join(':');
}

function getPaintStyleContext(styleName) {
  const folders = String(styleName || '').split('/').map(folder => folder.trim().toLowerCase());
  // New generated color styles use Color Styles/{Texts|Backgrounds|Strokes}.
  // Keep recognizing the previous nested and legacy top-level names too.
  const stylesFolderIndex = folders.lastIndexOf('styles');
  const folder = folders[0] === 'color styles' && folders[1]
    ? folders[1]
    : stylesFolderIndex >= 0 && folders[stylesFolderIndex + 1]
      ? folders[stylesFolderIndex + 1]
      : folders[0];
  if (folder === 'text' || folder === 'texts' || folder === 'text color' || folder === 'text colors') return 'text-fill';
  if (folder === 'fill' || folder === 'fills' || folder === 'background' || folder === 'backgrounds') return 'fill';
  if (folder === 'stroke' || folder === 'strokes') return 'stroke';
  return null;
}

function hasEquivalentPaintStyle(paint, paintStylesByColor, variableId, styleContext) {
  if (!paint || paint.type !== 'SOLID') return false;
  const opacity = paint.opacity !== undefined ? paint.opacity : 1;
  const values = [paint.color.r, paint.color.g, paint.color.b, opacity];
  const buckets = values.map(value => Math.floor(value * 10000));
  // Values within the original < 0.0001 rule can lie in a neighboring
  // bucket. Checking those sparse buckets preserves that rule exactly.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dg = -1; dg <= 1; dg++) {
      for (let db = -1; db <= 1; db++) {
        for (let da = -1; da <= 1; da++) {
          const matches = paintStylesByColor.get([
            buckets[0] + dr, buckets[1] + dg, buckets[2] + db, buckets[3] + da
          ].join(':'));
          if (matches && matches.some(styleEntry => {
            const stylePaint = styleEntry.paint;
            const styleOpacity = stylePaint.opacity !== undefined ? stylePaint.opacity : 1;
            const styleBinding = stylePaint.boundVariables && stylePaint.boundVariables.color;
            return (!styleEntry.styleContext || !styleContext || styleEntry.styleContext === styleContext) &&
              (!variableId || (isVariableBinding(styleBinding) && styleBinding.id === variableId)) &&
              Math.abs(stylePaint.color.r - paint.color.r) < 0.0001 &&
              Math.abs(stylePaint.color.g - paint.color.g) < 0.0001 &&
              Math.abs(stylePaint.color.b - paint.color.b) < 0.0001 &&
              Math.abs(styleOpacity - opacity) < 0.0001;
          })) return true;
        }
      }
    }
  }
  return false;
}

function getFirstVariableValue(variable) {
  if (!variable || !variable.valuesByMode) return null;
  const modeIds = Object.keys(variable.valuesByMode);
  return modeIds.length > 0 ? variable.valuesByMode[modeIds[0]] : null;
}

function resolveVariableValue(value, variablesById, seen) {
  if (!value || typeof value !== 'object' || value.type !== 'VARIABLE_ALIAS') {
    return value;
  }

  const visited = seen || new Set();
  if (visited.has(value.id) || !variablesById[value.id]) return value;
  visited.add(value.id);
  return resolveVariableValue(getFirstVariableValue(variablesById[value.id]), variablesById, visited);
}

function isVariableBinding(binding) {
  // Current Figma objects expose VARIABLE_ALIAS. The id fallback keeps the
  // scanner compatible with bindings surfaced without the discriminator.
  return !!(binding && (binding.type === 'VARIABLE_ALIAS' || typeof binding.id === 'string'));
}

function hasBoundVariable(node, field) {
  if (!node || !node.boundVariables) return false;
  const fields = EQUIVALENT_BOUND_FIELDS[field] || [field];
  return fields.some(candidateField => {
    const binding = node.boundVariables[candidateField];
    return Array.isArray(binding) ? binding.some(isVariableBinding) : isVariableBinding(binding);
  });
}

function getBoundVariableId(bindings, field) {
  const binding = bindings && bindings[field];
  if (Array.isArray(binding)) {
    const found = binding.find(isVariableBinding);
    return found ? (found.id || found.variableId || null) : null;
  }
  return isVariableBinding(binding) ? (binding.id || binding.variableId || null) : null;
}

function getTextVariableId(node, field) {
  return getBoundVariableId(node && node.boundVariables, field);
}

function safeReadNumber(node, field) {
  try {
    if (!(field in node)) return null;
    const value = node[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch (e) {
    return null;
  }
}

function shouldScanNumericField(node, definition, value) {
  if (definition.kind === 'auto-layout') {
    // Padding is meaningful on auto-layout frames. itemSpacing and
    // counterAxisSpacing are only meaningful when the corresponding layout
    // mode is active.
    if (node.layoutMode !== 'HORIZONTAL' && node.layoutMode !== 'VERTICAL') return false;
    // SPACE_BETWEEN lets Figma calculate the gap automatically; any numeric
    // value exposed alongside it is not the effective item spacing.
    if (definition.field === 'itemSpacing' &&
        (node.itemSpacing === 'AUTO' || node.primaryAxisAlignItems === 'SPACE_BETWEEN')) return false;
    if (definition.field === 'counterAxisSpacing' && node.layoutWrap !== 'WRAP') return false;
  }
  if (definition.kind === 'grid' && node.layoutMode !== 'GRID') return false;
  if (definition.kind === 'stroke') {
    if (!Array.isArray(node.strokes) || !node.strokes.some(p => p && p.visible !== false)) return false;
    if (value <= 0) return false;
    // A uniform stroke has one canonical property. Only inspect the four
    // side-specific fields when Figma reports the aggregate as mixed.
    if (definition.field !== 'strokeWeight' && safeReadNumber(node, 'strokeWeight') !== null) return false;
  }
  if (definition.kind === 'radius') {
    if (value <= 0) return false;
    // Avoid reporting cornerRadius and the four individual radii twice when
    // all corners share the same value.
    if (definition.field !== 'cornerRadius' && safeReadNumber(node, 'cornerRadius') !== null) return false;
  }
  // 1 is the default opacity and is not useful as an opacity-token candidate.
  if (definition.kind === 'opacity' && value >= 1) return false;
  return true;
}

function formatNumericTokenValue(value, definition) {
  const rounded = Math.round(value * 100) / 100;
  if (definition.kind === 'opacity') return `${Math.round(rounded * 100)}%`;
  return `${rounded}px`;
}

async function prepareTextNodeForStyleChange(node, targetStyleId, targetStyle) {
  if (node.type !== 'TEXT') return;
  try {
    // 1. Load target style's font if applicable
    if (targetStyleId) {
      const style = targetStyle || await figma.getStyleByIdAsync(targetStyleId);
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

function forEachTextStyleRange(node, getStyleId, callback) {
  const length = node.characters.length;
  let start = 0;
  while (start < length) {
    const styleId = getStyleId(start, start + 1);
    let end = start + 1;
    let low = end;
    let high = length;

    // The API returns figma.mixed as soon as a range contains another style.
    // Binary search lets us process a continuous segment instead of every
    // character, preserving the old character-based usage count.
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (getStyleId(start, mid) === styleId) low = mid;
      else high = mid - 1;
    }
    end = low;
    if (callback(styleId, start, end) === false) return false;
    start = end;
  }
  return true;
}

// --- SCANNING USAGES IN DOCUMENT ---

function scanUsages(context) {
  const tokenMap = Object.create(null);

  const { variables, paintStyles, textStyles, effectStyles, gridStyles } = context;
  variables.forEach(v => {
    tokenMap[v.id] = { id: v.id, type: 'variable', resolvedType: v.resolvedType, name: v.name, count: 0, elementCount: 0, styleCount: 0 };
  });

  // Get local styles
  paintStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'paint', name: s.name, count: 0 };
  });

  textStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'text', name: s.name, count: 0 };
  });

  effectStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'effect', name: s.name, count: 0 };
  });

  gridStyles.forEach(s => {
    tokenMap[s.id] = { id: s.id, type: 'style', styleType: 'grid', name: s.name, count: 0 };
  });

  function inspect(node) {
    const countedOnNode = new Set();
    const addNodeUsage = (id, amount = 1) => {
      if (!id || !tokenMap[id]) return;
      tokenMap[id].count += amount;
      if (!countedOnNode.has(id)) {
        tokenMap[id].elementCount = (tokenMap[id].elementCount || 0) + 1;
        countedOnNode.add(id);
      }
    };

    // 1. Style properties
    if ('fillStyleId' in node && node.fillStyleId) {
      const id = node.fillStyleId;
      if (id !== figma.mixed) addNodeUsage(id);
    }
    if ('strokeStyleId' in node && node.strokeStyleId) {
      const id = node.strokeStyleId;
      if (id !== figma.mixed) addNodeUsage(id);
    }
    if ('textStyleId' in node && node.textStyleId) {
      const id = node.textStyleId;
      if (id !== figma.mixed) addNodeUsage(id);
    }
    if ('effectStyleId' in node && node.effectStyleId) {
      const id = node.effectStyleId;
      if (id !== figma.mixed) addNodeUsage(id);
    }
    if ('gridStyleId' in node && node.gridStyleId) {
      const id = node.gridStyleId;
      if (id !== figma.mixed) addNodeUsage(id);
    }

    // 2. Bound variables
    if (node.boundVariables) {
      for (const prop in node.boundVariables) {
        const val = node.boundVariables[prop];
        if (!val) continue;
        if (Array.isArray(val)) {
          val.forEach(item => {
            if (item && item.type === 'VARIABLE_ALIAS') addNodeUsage(item.id);
          });
        } else if (val.type === 'VARIABLE_ALIAS') {
          addNodeUsage(val.id);
        }
      }
    }

    // 3. Mixed styles character traversal
    if (node.type === "TEXT") {
      if (node.textStyleId === figma.mixed) {
        try {
          forEachTextStyleRange(node, (start, end) => node.getRangeTextStyleId(start, end), (styleId, start, end) => {
            if (styleId) addNodeUsage(styleId, end - start);
          });
        } catch (e) {}
      }
      if (node.fillStyleId === figma.mixed) {
        try {
          forEachTextStyleRange(node, (start, end) => node.getRangeFillStyleId(start, end), (styleId, start, end) => {
            if (styleId) addNodeUsage(styleId, end - start);
          });
        } catch (e) {}
      }
    }

  }

  // Keep the traversal separate from inspection so the detached-elements
  // scanner can reuse the same node list during one analysis.
  function walk(node) {
    inspect(node);
    if ('children' in node && node.children) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]);
      }
    }
  }

  if (context.nodes) context.nodes.forEach(entry => inspect(entry.node));
  else walk(figma.root);

  // Variable bindings stored inside local styles are also real consumers.
  // Count each variable once per style, even if the same variable is bound
  // to multiple fields or appears in both a top-level and nested binding map.
  const countStyleVariableBindings = (style, bindingSources) => {
    const variableIds = new Set();
    const visited = new Set();
    const collectAliases = value => {
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      if (value.type === 'VARIABLE_ALIAS' && (value.id || value.variableId)) {
        variableIds.add(value.id || value.variableId);
        return;
      }
      if (Array.isArray(value)) value.forEach(collectAliases);
      else Object.keys(value).forEach(key => collectAliases(value[key]));
    };
    (bindingSources || []).forEach(collectAliases);
    variableIds.forEach(id => {
      const usage = tokenMap[id];
      if (!usage || usage.type !== 'variable') return;
      usage.count++;
      usage.styleCount++;
    });
  };

  paintStyles.forEach(style => countStyleVariableBindings(style, [
    style.boundVariables,
    (style.paints || []).map(paint => paint && paint.boundVariables)
  ]));
  textStyles.forEach(style => countStyleVariableBindings(style, [style.boundVariables]));
  effectStyles.forEach(style => countStyleVariableBindings(style, [
    style.boundVariables,
    (style.effects || []).map(effect => effect && effect.boundVariables)
  ]));
  gridStyles.forEach(style => countStyleVariableBindings(style, [
    style.boundVariables,
    (style.layoutGrids || []).map(grid => grid && grid.boundVariables)
  ]));

  return tokenMap;
}

// --- SERIALIZE DATA FOR UI ---

function getSerializedTokens(tokenCounts, context) {
  const result = [];

  // 1. Local Variables
  const localVars = context.variables;
  const variablesById = context.variablesById;
  localVars.forEach(v => {
    let collectionName = "Variables";
    try {
      let coll = context.collectionsById[v.variableCollectionId];
      if (coll === undefined) {
        coll = figma.variables.getVariableCollectionById(v.variableCollectionId) || null;
        context.collectionsById[v.variableCollectionId] = coll;
      }
      if (coll) collectionName = coll.name;
    } catch (e) {}

    let rawValue = null;
    let formattedValue = "";
    try {
      const modeIds = Object.keys(v.valuesByMode);
      if (modeIds.length > 0) {
        // Resolve local aliases so FLOAT variables can be compared with
        // numeric node properties during the detached-elements analysis.
        rawValue = resolveVariableValue(v.valuesByMode[modeIds[0]], variablesById);
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
      tokenKind: getTokenKind(v.name, collectionName, v.resolvedType),
      collectionOrFolder: collectionName,
      description: v.description || "",
      count: (tokenCounts[v.id] && tokenCounts[v.id].count) || 0,
      elementCount: (tokenCounts[v.id] && tokenCounts[v.id].elementCount) || 0,
      styleCount: (tokenCounts[v.id] && tokenCounts[v.id].styleCount) || 0,
      rawValue: rawValue,
      propertiesText: formattedValue
    });
  });

  // 2. Paint Styles
  const paintStyles = context.paintStyles;
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
      tokenKind: 'color',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      rawValue: rawValue,
      paintType: paintType,
      variableId: s.paints && s.paints[0] && s.paints[0].boundVariables && s.paints[0].boundVariables.color
        ? s.paints[0].boundVariables.color.id || null
        : null,
      styleContext: getPaintStyleContext(s.name),
      hasBoundVariables: !!(s.paints || []).some(paint => paint && paint.boundVariables && Object.keys(paint.boundVariables).length > 0),
      propertiesText: formattedValue
    });
  });

  // 3. Text Styles
  const textStyles = context.textStyles;
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
      tokenKind: 'text-style',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      hasBoundVariables: !!(s.boundVariables && Object.keys(s.boundVariables).length > 0),
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
  const effectStyles = context.effectStyles;
  effectStyles.forEach(s => {
    const count = s.effects ? s.effects.length : 0;
    const propertiesText = `${count} effect(s)`;
    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'effect',
      category: 'other',
      tokenKind: 'effect',
      collectionOrFolder: getFolderFromName(s.name),
      description: s.description || "",
      count: (tokenCounts[s.id] && tokenCounts[s.id].count) || 0,
      hasBoundVariables: !!(s.effects || []).some(effect => effect && effect.boundVariables && Object.keys(effect.boundVariables).length > 0),
      rawValue: s.effects,
      propertiesText: propertiesText
    });
  });

  // 5. Local Grid Styles
  const gridStyles = context.gridStyles;
  gridStyles.forEach(s => {
    const count = s.layoutGrids ? s.layoutGrids.length : 0;
    const propertiesText = `${count} grid(s)`;
    result.push({
      id: s.id,
      name: s.name,
      source: 'style',
      subType: 'grid',
      category: 'other',
      tokenKind: 'grid',
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

  const getNumericOrganization = token => {
    const tokenKind = token.tokenKind || 'spacing';
    if (tokenKind !== 'spacing') return tokenKind;
    const path = `${token.collectionOrFolder || ''}/${token.name || ''}`
      .toLowerCase()
      .replace(/[\s_\-/]+/g, ' ')
      .trim();
    return /\bpadding\b/.test(path) ? 'padding' : 'spacing';
  };

  const getColorOrganization = token => token.source === 'style'
    ? `style-${token.styleContext || 'unclassified'}`
    : `${token.source || 'unknown'}-token`;

  tokens.forEach(t => {
    let key = null;

    if (t.category === 'color') {
      if (t.rawValue && t.rawValue.r !== undefined) {
        const r = Math.round(t.rawValue.r * 255);
        const g = Math.round(t.rawValue.g * 255);
        const b = Math.round(t.rawValue.b * 255);
        const a = t.rawValue.a !== undefined ? Math.round(t.rawValue.a * 100) : 100;
        // Keep variable tokens separate from styles, and keep generated text,
        // background and stroke styles in their own semantic folders.
        key = `${getColorOrganization(t)}-color-${r}-${g}-${b}-${a}`;
      }
    } else if (t.category === 'spacing' && t.subType === 'FLOAT') {
      if (t.rawValue !== null && typeof t.rawValue === 'number') {
        key = `${t.source}-${getNumericOrganization(t)}-${t.rawValue}`;
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

function scanDetachedElements(context) {
  const detached = [];

  // Include variable-bound paint in the scan so Styles can create contextual
  // Paint Styles. Corrections only accept a matching style that preserves the
  // existing variable binding.
  function hasPaintVariable(node, paint, property, paintIndex) {
    const nodeBinding = node.boundVariables && node.boundVariables[property];
    return !!(
      (paint && paint.boundVariables && paint.boundVariables.color) ||
      (Array.isArray(nodeBinding) ? nodeBinding[paintIndex] : nodeBinding)
    );
  }

  function getPaintVariableId(node, paint, property, paintIndex) {
    const nodeBinding = node.boundVariables && node.boundVariables[property];
    const binding = paint && paint.boundVariables && paint.boundVariables.color
      ? paint.boundVariables.color
      : (Array.isArray(nodeBinding) ? nodeBinding[paintIndex] : nodeBinding);
    return isVariableBinding(binding) ? binding.id || null : null;
  }

  const entries = context.nodes || collectDocumentNodes();
  for (const entry of entries) {
      const { node, page } = entry;
      if (!page || node.type === 'DOCUMENT' || node.type === 'PAGE') continue;

      // 1. Fills (Colors)
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        const hasStyle = node.fillStyleId && node.fillStyleId !== figma.mixed && node.fillStyleId !== '';
        if (!hasStyle && node.fillStyleId !== figma.mixed) {
          node.fills.forEach((paint, pIdx) => {
            if (paint.type === 'SOLID' && paint.visible !== false) {
              const hasVar = hasPaintVariable(node, paint, 'fills', pIdx);
              const variableId = getPaintVariableId(node, paint, 'fills', pIdx);
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
                  styleContext: node.type === 'TEXT' ? 'text-fill' : 'fill',
                  category: 'color',
                  paintIndex: pIdx,
                  paintCount: node.fills.length,
                  rawValue: { r, g, b, a },
                  formattedValue: formatted,
                  hasVariable: hasVar,
                  preferStyle: hasVar,
                  variableId,
                  correctionEligible: !hasVar || (!!variableId && hasEquivalentPaintStyle(paint, context.paintStylesByColor, variableId, node.type === 'TEXT' ? 'text-fill' : 'fill'))
                });
            }
          });
        }
      }

      // 2. Strokes (Colors)
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const hasStyle = node.strokeStyleId && node.strokeStyleId !== figma.mixed && node.strokeStyleId !== '';
        if (!hasStyle && node.strokeStyleId !== figma.mixed) {
          node.strokes.forEach((paint, pIdx) => {
            if (paint.type === 'SOLID' && paint.visible !== false) {
              const hasVar = hasPaintVariable(node, paint, 'strokes', pIdx);
              const variableId = getPaintVariableId(node, paint, 'strokes', pIdx);
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
                  styleContext: 'stroke',
                  category: 'color',
                  paintIndex: pIdx,
                  paintCount: node.strokes.length,
                  rawValue: { r, g, b, a },
                  formattedValue: formatted,
                  hasVariable: hasVar,
                  preferStyle: hasVar,
                  variableId,
                  correctionEligible: !hasVar || (!!variableId && hasEquivalentPaintStyle(paint, context.paintStylesByColor, variableId, 'stroke'))
                });
            }
          });
        }
      }

      // 3. Text Styles
      if (node.type === 'TEXT') {
        const fontName = node.fontName && node.fontName !== figma.mixed ? node.fontName : null;
        const fontWeight = safeReadNumber(node, 'fontWeight');
        const lineHeightValue = node.lineHeight && node.lineHeight !== figma.mixed ? node.lineHeight : null;
        const letterSpacingValue = node.letterSpacing && node.letterSpacing !== figma.mixed ? node.letterSpacing : null;
        const pushTextVariableCandidate = (field, tokenKind, variableType, rawValue, formattedValue, measureUnit) => {
          if (rawValue === null || rawValue === undefined || hasBoundVariable(node, field)) return;
          detached.push({
            nodeId: node.id,
            nodeName: node.name || 'Texto',
            nodeType: node.type,
            pageId: page.id,
            pageName: page.name,
            prop: field,
            category: 'text-variable',
            tokenKind,
            variableType,
            rawValue,
            measureUnit: measureUnit || null,
            formattedValue,
            correctionEligible: false
          });
        };

        if (fontName) {
          pushTextVariableCandidate('fontFamily', 'font-family', 'STRING', fontName.family, fontName.family);
        }
        if (node.fontSize !== figma.mixed && typeof node.fontSize === 'number') {
          pushTextVariableCandidate('fontSize', 'font-size', 'FLOAT', node.fontSize, `${node.fontSize}px`);
        }
        if (fontWeight !== null) {
          pushTextVariableCandidate('fontWeight', 'font-weight', 'FLOAT', fontWeight, String(fontWeight));
        }
        if (lineHeightValue && (lineHeightValue.unit === 'PIXELS' || lineHeightValue.unit === 'PERCENT') &&
            typeof lineHeightValue.value === 'number') {
          const unit = lineHeightValue.unit;
          pushTextVariableCandidate('lineHeight', `line-height-${unit === 'PERCENT' ? 'percent' : 'pixels'}`, 'FLOAT',
            lineHeightValue.value, `${lineHeightValue.value}${unit === 'PERCENT' ? '%' : 'px'}`, unit);
        }
        if (letterSpacingValue && (letterSpacingValue.unit === 'PIXELS' || letterSpacingValue.unit === 'PERCENT') &&
            typeof letterSpacingValue.value === 'number') {
          const unit = letterSpacingValue.unit;
          pushTextVariableCandidate('letterSpacing', `letter-spacing-${unit === 'PERCENT' ? 'percent' : 'pixels'}`, 'FLOAT',
            letterSpacingValue.value, `${letterSpacingValue.value}${unit === 'PERCENT' ? '%' : 'px'}`, unit);
        }

        const hasStyle = node.textStyleId && node.textStyleId !== figma.mixed && node.textStyleId !== '';
        // A style candidate is separate from its variables. Existing aliases
        // are retained in the candidate so the new Text Style can reuse them.
        if (!hasStyle && node.textStyleId !== figma.mixed) {
          if (fontName &&
              node.fontSize !== figma.mixed && node.lineHeight !== figma.mixed &&
              node.letterSpacing !== figma.mixed) {
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
                fontWeight: fontWeight,
                lineHeight: lineHeight,
                letterSpacing: letterSpacing
              },
              styleVariableIds: {
                fontFamily: getTextVariableId(node, 'fontFamily'),
                fontSize: getTextVariableId(node, 'fontSize'),
                fontWeight: getTextVariableId(node, 'fontWeight'),
                lineHeight: getTextVariableId(node, 'lineHeight'),
                letterSpacing: getTextVariableId(node, 'letterSpacing')
              },
              formattedValue: `${fontName.family} ${fontName.style}, ${fontSize}px / ${lhText}`
            });
          }
        }
      }

      // 4. Numeric token fields (Auto Layout, Grid, radius, borders and
      // opacity). A value is detached when the field has no variable binding.
      // The field name is kept in `prop` so the correction can bind the exact
      // property instead of merely changing the displayed value.
      for (const definition of NUMERIC_TOKEN_FIELDS) {
        const value = safeReadNumber(node, definition.field);
        // Zero is the default for several layout fields and does not warrant
        // a token suggestion. This applies only to numeric properties, never
        // to color channels or other token types.
        // Ignore values that are rendered as 0.00 by the UI as well (some
        // documents contain tiny floating-point residues instead of a literal
        // zero).
        if (value === 0 || Math.round(value * 100) / 100 === 0) continue;
        if (value === null || hasBoundVariable(node, definition.field)) continue;
        if (!shouldScanNumericField(node, definition, value)) continue;

        detached.push({
          nodeId: node.id,
          nodeName: node.name || 'Elemento',
          nodeType: node.type,
          pageId: page.id,
          pageName: page.name,
          prop: definition.field,
          propLabel: definition.label,
          category: 'spacing',
          subType: 'FLOAT',
          tokenKind: definition.tokenKind,
          rawValue: value,
          formattedValue: formatNumericTokenValue(value, definition)
        });
      }

      // 5. Effect Styles
      if ('effects' in node && Array.isArray(node.effects) && node.effects.length > 0) {
        node.effects.forEach((effect, effectIndex) => {
          if (!effect || effect.visible === false) return;
          const effectBindings = effect.boundVariables || {};
          const effectColor = effect.color;
          if (effectColor && !isVariableBinding(effectBindings.color)) {
            detached.push({
              nodeId: node.id, nodeName: node.name || 'Elemento', nodeType: node.type,
              pageId: page.id, pageName: page.name, prop: 'effect-color',
              styleContext: 'effect', category: 'color', effectIndex,
              rawValue: { r: effectColor.r, g: effectColor.g, b: effectColor.b, a: effectColor.a === undefined ? 1 : effectColor.a },
              formattedValue: rgbToHex(effectColor.r, effectColor.g, effectColor.b),
              hasVariable: false, correctionEligible: false
            });
          }
          ['radius', 'spread', 'offsetX', 'offsetY'].forEach(field => {
            const value = field === 'offsetX'
              ? effect.offset && effect.offset.x
              : field === 'offsetY'
                ? effect.offset && effect.offset.y
                : effect[field];
            if (typeof value !== 'number' || !Number.isFinite(value) || isVariableBinding(effectBindings[field])) return;
            const suffix = field === 'radius' ? 'radius' : field === 'spread' ? 'spread' : field === 'offsetX' ? 'offset-x' : 'offset-y';
            detached.push({
              nodeId: node.id, nodeName: node.name || 'Elemento', nodeType: node.type,
              pageId: page.id, pageName: page.name, prop: `effect-${field}`,
              category: 'effect-variable', tokenKind: `effect-${suffix}`, variableType: 'FLOAT',
              effectIndex, rawValue: value, formattedValue: `${value}px`, correctionEligible: false
            });
          });
        });

        const hasStyle = node.effectStyleId && node.effectStyleId !== figma.mixed && node.effectStyleId !== '';
        if (!hasStyle && node.effectStyleId !== figma.mixed) {
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

  }

  return detached;
}

// --- APPLY FIX HELPER ---

function getCachedVariable(variableId, cache) {
  if (!cache) return figma.variables.getVariableByIdAsync(variableId);
  if (!cache.has(variableId)) {
    cache.set(variableId, figma.variables.getVariableByIdAsync(variableId));
  }
  return cache.get(variableId);
}

function getCachedStyle(styleId, cache) {
  if (!cache) return figma.getStyleByIdAsync(styleId);
  if (!cache.has(styleId)) cache.set(styleId, figma.getStyleByIdAsync(styleId));
  return cache.get(styleId);
}

async function applyFixToNode(node, fix, caches) {
  let changed = false;
  const { prop, targetTokenId, source, paintIndex, effectIndex } = fix;

  if (prop === 'fill') {
    if (source === 'style') {
      if (typeof node.setFillStyleIdAsync === 'function') await node.setFillStyleIdAsync(targetTokenId);
      else node.fillStyleId = targetTokenId;
      changed = true;
    } else {
      const targetVar = await getCachedVariable(targetTokenId, caches && caches.variables);
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
      if (typeof node.setStrokeStyleIdAsync === 'function') await node.setStrokeStyleIdAsync(targetTokenId);
      else node.strokeStyleId = targetTokenId;
      changed = true;
    } else {
      const targetVar = await getCachedVariable(targetTokenId, caches && caches.variables);
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
      const targetStyle = await getCachedStyle(targetTokenId, caches && caches.styles);
      await prepareTextNodeForStyleChange(node, targetTokenId, targetStyle);
      if (typeof node.setTextStyleIdAsync === 'function') await node.setTextStyleIdAsync(targetTokenId);
      else node.textStyleId = targetTokenId;
      changed = true;
    }
  } else if (prop === 'effect') {
    if (source === 'style') {
      if (typeof node.setEffectStyleIdAsync === 'function') await node.setEffectStyleIdAsync(targetTokenId);
      else node.effectStyleId = targetTokenId;
      changed = true;
    }
  } else if (prop === 'effect-color') {
    const targetVar = await getCachedVariable(targetTokenId, caches && caches.variables);
    const effects = Array.isArray(node.effects) ? node.effects : null;
    const effect = effects && Number.isInteger(effectIndex) ? effects[effectIndex] : null;
    if (targetVar && targetVar.resolvedType === 'COLOR' && effect && effect.color &&
        !isVariableBinding(effect.boundVariables && effect.boundVariables.color)) {
      const updatedEffect = figma.variables.setBoundVariableForEffect(effect, 'color', targetVar);
      const updatedEffects = effects.slice();
      updatedEffects[effectIndex] = updatedEffect;
      node.effects = updatedEffects;
      changed = true;
    }
  } else if (prop.indexOf('effect-') === 0) {
    const effectFields = {
      'effect-radius': 'radius',
      'effect-spread': 'spread',
      'effect-offset-x': 'offsetX',
      'effect-offset-y': 'offsetY'
    };
    const field = effectFields[prop];
    const targetVar = await getCachedVariable(targetTokenId, caches && caches.variables);
    const effects = Array.isArray(node.effects) ? node.effects : null;
    const effect = effects && Number.isInteger(effectIndex) ? effects[effectIndex] : null;
    if (field && targetVar && targetVar.resolvedType === 'FLOAT' && effect &&
        !isVariableBinding(effect.boundVariables && effect.boundVariables[field])) {
      const updatedEffect = figma.variables.setBoundVariableForEffect(effect, field, targetVar);
      const updatedEffects = effects.slice();
      updatedEffects[effectIndex] = updatedEffect;
      node.effects = updatedEffects;
      changed = true;
    }
  } else if (NUMERIC_TOKEN_FIELD_NAMES.has(prop)) {
    // Numeric design tokens (padding, spacing, radius, border weight, etc.)
    // are FLOAT variables. `setBoundVariable` preserves the current value
    // while replacing the raw number with a real variable binding.
    const targetVar = await getCachedVariable(targetTokenId, caches && caches.variables);
    if (targetVar && targetVar.resolvedType === 'FLOAT') {
      try {
        node.setBoundVariable(prop, targetVar);
        changed = true;
      } catch (e) {
        console.error(`Erro ao vincular variável FLOAT à propriedade ${prop} no nó ${node.id}:`, e);
      }
    }
  }

  return changed;
}

async function applyFixes(fixes) {
  let appliedCount = 0;
  const nodesById = new Map();
  const caches = { variables: new Map(), styles: new Map() };

  for (const fix of fixes) {
    try {
      if (!nodesById.has(fix.nodeId)) {
        nodesById.set(fix.nodeId, figma.getNodeById ? figma.getNodeById(fix.nodeId) : null);
      }
      const node = nodesById.get(fix.nodeId);
      if (node && await applyFixToNode(node, fix, caches)) appliedCount++;
    } catch (e) {
      console.error("Erro ao aplicar correção no nó:", e);
    }
  }
  return appliedCount;
}

// --- ANALYSIS CONTROLLER ---

function performAnalysis() {
  figma.ui.postMessage({ type: "status", text: "Analisando documento..." });
  const context = createAnalysisContext();
  context.nodes = collectDocumentNodes();
  const counts = scanUsages(context);
  const tokens = getSerializedTokens(counts, context);
  const duplicates = findDuplicates(tokens);
  const detached = scanDetachedElements(context);

  figma.ui.postMessage({
    type: "analysis-result",
    tokens: tokens,
    variableCollections: context.variableCollections.map(collection => ({
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map(mode => ({ id: mode.modeId, name: mode.name }))
    })),
    duplicates: duplicates,
    detached: detached
  });
}

function tokenNameExists(name, source, collectionId, category) {
  if (source === 'variable') {
    return figma.variables.getLocalVariables().some(variable =>
      variable.name === name && variable.variableCollectionId === collectionId
    );
  }
  const styles = category === 'color' ? figma.getLocalPaintStyles()
    : category === 'text' ? figma.getLocalTextStyles()
    : category === 'other' ? figma.getLocalEffectStyles()
    : [];
  return styles.some(style => style.name === name);
}

function numericValueKey(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value * 10000) / 10000)
    : '';
}

function colorValueKey(value) {
  if (!value || typeof value.r !== 'number') return '';
  const alpha = value.a === undefined ? 1 : value.a;
  return `${Math.round(value.r * 255)}-${Math.round(value.g * 255)}-${Math.round(value.b * 255)}-${Math.round(alpha * 100)}`;
}

function textMeasureKey(measure, defaultUnit) {
  if (!measure) return `${defaultUnit}:0`;
  const unit = measure.unit || defaultUnit;
  const value = typeof measure.value === 'number' ? measure.value : 0;
  return `${unit}:${numericValueKey(value)}`;
}

function textCandidateKey(value) {
  if (!value || !value.fontName) return '';
  const font = value.fontName;
  return [
    (font.family || '').toLowerCase(),
    (font.style || '').toLowerCase(),
    stableSerializeValue(font.variationSettings || {}),
    numericValueKey(value.fontSize),
    numericValueKey(value.fontWeight),
    textMeasureKey(value.lineHeight, 'AUTO'),
    textMeasureKey(value.letterSpacing, 'PIXELS')
  ].join('|');
}

function stableSerializeValue(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeValue).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerializeValue(value[key])}`).join(',')}}`;
}

function effectCandidateKey(effects) {
  const visibleEffects = Array.isArray(effects)
    ? effects.filter(effect => effect && effect.visible !== false)
    : [];
  return stableSerializeValue(visibleEffects.map(effect => {
    const normalized = {};
    Object.keys(effect).sort().forEach(key => {
      if (key !== 'visible' && effect[key] !== undefined) normalized[key] = effect[key];
    });
    return normalized;
  }));
}

function candidateTargetStillMatches(node, target, candidate) {
  if (!node || !target || !candidate) return false;

  if (candidate.category === 'color') {
    if (target.prop === 'effect-color') {
      const effect = Array.isArray(node.effects) && Number.isInteger(target.effectIndex)
        ? node.effects[target.effectIndex]
        : null;
      if (!effect || effect.visible === false || !effect.color ||
          isVariableBinding(effect.boundVariables && effect.boundVariables.color)) return false;
      const expectedColor = target.rawValue || candidate.rawValue;
      return colorValueKey(effect.color) === colorValueKey(expectedColor) &&
        colorValueKey(candidate.rawValue) === colorValueKey(expectedColor);
    }
    if (target.prop !== 'fill' && target.prop !== 'stroke') return false;
    const styleId = target.prop === 'fill' ? node.fillStyleId : node.strokeStyleId;
    const paints = target.prop === 'fill' ? node.fills : node.strokes;
    if (styleId) return false;
    if (!Array.isArray(paints) || !paints[target.paintIndex]) return false;
    const paint = paints[target.paintIndex];
    if (!paint || paint.type !== 'SOLID' || paint.visible === false) return false;
    const bindings = node.boundVariables && node.boundVariables[target.prop === 'fill' ? 'fills' : 'strokes'];
    const binding = Array.isArray(bindings) ? bindings[target.paintIndex] : bindings;
    const paintBinding = paint.boundVariables && paint.boundVariables.color;
    const currentVariableId = isVariableBinding(paintBinding) ? paintBinding.id : isVariableBinding(binding) ? binding.id : null;
    const hasPaintBinding = isVariableBinding(paintBinding) || !!paintBinding || isVariableBinding(binding);
    if (candidate.source === 'style') {
      if (hasPaintBinding && (!candidate.variableId || currentVariableId !== candidate.variableId)) return false;
    } else if (hasPaintBinding) {
      return false;
    }
    return colorValueKey({
      r: paint.color.r,
      g: paint.color.g,
      b: paint.color.b,
      a: paint.opacity === undefined ? 1 : paint.opacity
    }) === colorValueKey(candidate.rawValue);
  }

  if (candidate.category === 'spacing') {
    if (!NUMERIC_TOKEN_FIELD_NAMES.has(target.prop) || hasBoundVariable(node, target.prop)) return false;
    const currentValue = numericValueKey(safeReadNumber(node, target.prop));
    const acceptedValues = Array.isArray(candidate.sourceValues) && candidate.sourceValues.length
      ? candidate.sourceValues
      : [candidate.rawValue];
    return acceptedValues.some(value => numericValueKey(value) === currentValue);
  }

  if (candidate.category === 'effect-variable') {
    const effectFields = {
      'effect-radius': 'radius',
      'effect-spread': 'spread',
      'effect-offset-x': 'offsetX',
      'effect-offset-y': 'offsetY'
    };
    const field = effectFields[target.prop];
    const effect = Array.isArray(node.effects) && Number.isInteger(target.effectIndex)
      ? node.effects[target.effectIndex]
      : null;
    if (!field || !effect || effect.visible === false ||
        isVariableBinding(effect.boundVariables && effect.boundVariables[field])) return false;
    const currentValue = field === 'offsetX'
      ? effect.offset && effect.offset.x
      : field === 'offsetY'
        ? effect.offset && effect.offset.y
        : effect[field];
    if (typeof currentValue !== 'number' || !Number.isFinite(currentValue)) return false;
    const acceptedValues = Array.isArray(candidate.sourceValues) && candidate.sourceValues.length
      ? candidate.sourceValues
      : [target.rawValue !== undefined ? target.rawValue : candidate.rawValue];
    const expectedValue = target.rawValue !== undefined ? target.rawValue : currentValue;
    return numericValueKey(currentValue) === numericValueKey(expectedValue) &&
      acceptedValues.some(value => numericValueKey(value) === numericValueKey(currentValue));
  }

  if (candidate.category === 'text') {
    if (node.type !== 'TEXT' || node.textStyleId) return false;
    if (!node.fontName || node.fontName === figma.mixed || node.fontSize === figma.mixed ||
        node.lineHeight === figma.mixed || node.letterSpacing === figma.mixed) return false;
    return textCandidateKey({
      fontName: node.fontName,
      fontSize: node.fontSize,
      fontWeight: safeReadNumber(node, 'fontWeight'),
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing
    }) === textCandidateKey(candidate.rawValue);
  }

  if (candidate.category === 'other' && target.prop === 'effect') {
    if (node.effectStyleId) return false;
    return effectCandidateKey(node.effects) === effectCandidateKey(candidate.rawValue);
  }

  return false;
}

function getSuggestionCollection(candidate, collectionCache) {
  const cacheKey = candidate.collectionId || '__default__';
  let collection = collectionCache.get(cacheKey);
  if (!collection && candidate.collectionId) {
    collection = figma.variables.getLocalVariableCollections()
      .find(item => item.id === candidate.collectionId) || null;
  }
  if (!collection) collection = figma.variables.createVariableCollection('Tokens');
  collectionCache.set(cacheKey, collection);
  collectionCache.set(collection.id, collection);
  return collection;
}

function getCandidateFixes(candidate, targetTokenId) {
  const fixes = [];
  const nodesById = new Map();
  for (const target of candidate.nodes || []) {
    let node = nodesById.get(target.nodeId);
    if (node === undefined) {
      node = figma.getNodeById ? figma.getNodeById(target.nodeId) : null;
      nodesById.set(target.nodeId, node);
    }
    if (node && candidate.category === 'color' && candidate.source === 'style') {
      const paints = target.prop === 'fill' ? node.fills : node.strokes;
      if (!Array.isArray(paints) || paints.length !== 1 || target.paintIndex !== 0) {
        throw new Error('Paint Styles substituem todos os fills ou strokes. Escolha uma variável de cor para preservar as outras pinturas.');
      }
    }
    if (!candidateTargetStillMatches(node, target, candidate)) continue;
    fixes.push({
      nodeId: target.nodeId,
      prop: target.prop,
      paintIndex: target.paintIndex,
      effectIndex: target.effectIndex,
      targetTokenId,
      source: candidate.source
    });
  }
  if (fixes.length === 0) {
    throw new Error('Os elementos mudaram desde a análise; atualize as sugestões e tente novamente.');
  }
  return fixes;
}

async function getStyleVariable(id, expectedType) {
  if (!id) throw new Error('A style precisa de um token compatÃ­vel. Crie os tokens primeiro e atualize a anÃ¡lise.');
  const variable = await figma.variables.getVariableByIdAsync(id);
  if (!variable || variable.resolvedType !== expectedType) {
    throw new Error('Um token usado por este style nÃ£o estÃ¡ mais disponÃ­vel. Atualize a anÃ¡lise.');
  }
  return variable;
}

async function createSuggestionToken(candidate, collectionCache) {
  const { name, source, category, tokenKind, rawValue } = candidate;
  if (!name || !name.trim()) throw new Error('Digite um nome para o item.');
  if (!Array.isArray(candidate.nodes) || candidate.nodes.length === 0) {
    throw new Error('A sugestÃ£o nÃ£o possui ocorrÃªncias de origem.');
  }

  let createdToken = null;
  let fixes = [];
  try {
    if (source === 'variable') {
      const collection = getSuggestionCollection(candidate, collectionCache);
      const variableType = candidate.variableType || (category === 'color' ? 'COLOR' : 'FLOAT');
      const variable = figma.variables.createVariable(name.trim(), collection, variableType);
      createdToken = variable;
      const value = variableType === 'COLOR'
        ? { r: rawValue.r, g: rawValue.g, b: rawValue.b, a: rawValue.a === undefined ? 1 : rawValue.a }
        : variableType === 'STRING' ? String(rawValue) : Number(rawValue);
      collection.modes.forEach(mode => variable.setValueForMode(mode.modeId, value));
      // Layout tokens have no equivalent Style type, so bind them directly to
      // their source fields. Composite styles use their variables separately.
      if (category === 'color' || category === 'spacing' || category === 'effect-variable') {
        fixes = getCandidateFixes(candidate, variable.id);
      }
      return { token: variable, fixes, tokenKind: tokenKind || null };
    }

    if (source !== 'style') throw new Error('Escolha uma variÃ¡vel ou um style para criar.');
    fixes = getCandidateFixes(candidate, null);

    if (category === 'color') {
      const variable = await getStyleVariable(candidate.variableId, 'COLOR');
      const style = figma.createPaintStyle();
      createdToken = style;
      style.name = name.trim();
      style.paints = [figma.variables.setBoundVariableForPaint({
        type: 'SOLID', color: { r: rawValue.r, g: rawValue.g, b: rawValue.b },
        opacity: rawValue.a === undefined ? 1 : rawValue.a
      }, 'color', variable)];
    } else if (category === 'text') {
      const requiredTextFields = ['fontFamily', 'fontSize', 'fontWeight'];
      if (rawValue.lineHeight && (rawValue.lineHeight.unit === 'PIXELS' || rawValue.lineHeight.unit === 'PERCENT')) {
        requiredTextFields.push('lineHeight');
      }
      if (rawValue.letterSpacing && (rawValue.letterSpacing.unit === 'PIXELS' || rawValue.letterSpacing.unit === 'PERCENT')) {
        requiredTextFields.push('letterSpacing');
      }
      if (requiredTextFields.some(field => !candidate.styleVariableIds || !candidate.styleVariableIds[field])) {
        throw new Error('Este Text Style precisa de um token para cada propriedade tipográfica suportada. Crie os tokens e atualize a análise.');
      }
      await figma.loadFontAsync(rawValue.fontName);
      const style = figma.createTextStyle();
      createdToken = style;
      style.name = name.trim();
      style.fontName = rawValue.fontName;
      style.fontSize = rawValue.fontSize;
      if (rawValue.lineHeight) style.lineHeight = rawValue.lineHeight;
      if (rawValue.letterSpacing) style.letterSpacing = rawValue.letterSpacing;
      const fieldTypes = {
        fontFamily: 'STRING', fontSize: 'FLOAT',
        fontWeight: 'FLOAT', lineHeight: 'FLOAT', letterSpacing: 'FLOAT'
      };
      for (const field of Object.keys(candidate.styleVariableIds || {})) {
        style.setBoundVariable(field, await getStyleVariable(candidate.styleVariableIds[field], fieldTypes[field]));
      }
    } else if (category === 'other' && candidate.prop === 'effect') {
      const style = figma.createEffectStyle();
      createdToken = style;
      style.name = name.trim();
      const effects = [];
      for (let index = 0; index < (rawValue || []).length; index++) {
        const effect = rawValue[index];
        let nextEffect = Object.assign({}, effect);
        const aliases = (candidate.styleVariableIds || [])[index] || {};
        if (effect.color) {
          nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'color', await getStyleVariable(aliases.color, 'COLOR'));
        }
        for (const field of ['radius', 'spread', 'offsetX', 'offsetY']) {
          const fieldValue = field === 'offsetX'
            ? effect.offset && effect.offset.x
            : field === 'offsetY'
              ? effect.offset && effect.offset.y
              : effect[field];
          if (typeof fieldValue !== 'number') continue;
          nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, field, await getStyleVariable(aliases[field], 'FLOAT'));
        }
        effects.push(nextEffect);
      }
      style.effects = effects;
    } else {
      throw new Error('Este tipo de style ainda nÃ£o pode ser criado.');
    }
  } catch (error) {
    if (createdToken) {
      try { createdToken.remove(); } catch (removeError) {}
    }
    throw error;
  }

  try {
    fixes = getCandidateFixes(candidate, createdToken.id);
  } catch (error) {
    try { createdToken.remove(); } catch (removeError) {}
    throw error;
  }
  return { token: createdToken, fixes, tokenKind: tokenKind || null };
}

function variableRequirementKey(requirement) {
  if (!requirement) return "";
  const type = requirement.variableType || "FLOAT";
  const value = type === "COLOR"
    ? colorValueKey(requirement.rawValue)
    : type === "STRING"
      ? String(requirement.rawValue).toLowerCase()
      : numericValueKey(Number(requirement.rawValue));
  return [
    requirement.collectionId || "",
    type,
    requirement.tokenKind || "",
    requirement.measureUnit || "",
    value
  ].join("|");
}

function suggestionVariableValue(requirement) {
  const type = requirement.variableType || "FLOAT";
  if (type === "COLOR") {
    const value = requirement.rawValue || {};
    return { r: value.r, g: value.g, b: value.b, a: value.a === undefined ? 1 : value.a };
  }
  return type === "STRING" ? String(requirement.rawValue) : Number(requirement.rawValue);
}

async function createStyleDependencyVariable(requirement, collectionCache, dependencyVariables) {
  if (!requirement || !requirement.variableType || requirement.rawValue === undefined) {
    throw new Error("Nao foi possivel determinar um dos tokens necessarios para este style.");
  }
  const signature = variableRequirementKey(requirement);
  if (dependencyVariables.has(signature)) return dependencyVariables.get(signature);

  const collection = getSuggestionCollection({
    collectionId: requirement.collectionId || "",
    name: requirement.name
  }, collectionCache);
  const name = String(requirement.name || "").trim();
  if (!name) throw new Error("Um token necessario para este style esta sem nome.");
  if (tokenNameExists(name, "variable", collection.id, requirement.variableType === "COLOR" ? "color" : "spacing")) {
    throw new Error("Ja existe uma variavel chamada \"" + name + "\" na colecao escolhida.");
  }

  const variable = figma.variables.createVariable(name, collection, requirement.variableType);
  try {
    const value = suggestionVariableValue(requirement);
    collection.modes.forEach(mode => variable.setValueForMode(mode.modeId, value));
  } catch (error) {
    try { variable.remove(); } catch (removeError) {}
    throw error;
  }
  dependencyVariables.set(signature, variable);
  return variable;
}

async function resolveStyleVariableRequirement(requirement, context) {
  if (!requirement) throw new Error("Este style nao informa todos os tokens necessarios.");
  if (requirement.id) return getStyleVariable(requirement.id, requirement.variableType || "FLOAT");

  if (requirement.candidateKey) {
    const createdCandidate = context.variablesByCandidateKey.get(requirement.candidateKey);
    if (createdCandidate && createdCandidate.token) return createdCandidate.token;
    if (context.availableCandidateKeys.has(requirement.candidateKey)) {
      throw new Error("Um token necessario nao pode ser criado. Confira as falhas na lista.");
    }
  }

  return createStyleDependencyVariable(requirement, context.collectionCache, context.dependencyVariables);
}

async function prepareStyleVariableBindings(candidate, context) {
  const requirements = candidate.styleVariableRequirements || {};
  const fieldTypes = {
    fontFamily: "STRING", fontSize: "FLOAT",
    fontWeight: "FLOAT", lineHeight: "FLOAT", letterSpacing: "FLOAT"
  };

  if (candidate.category === "color") {
    const variable = await resolveStyleVariableRequirement(requirements.color, context);
    candidate.variableId = variable.id;
    return;
  }

  if (candidate.category === "text") {
    const ids = {};
    for (const [field, requirement] of Object.entries(requirements.text || {})) {
      const variable = await resolveStyleVariableRequirement(requirement, context);
      if (variable.resolvedType !== fieldTypes[field]) {
        throw new Error("O token de " + field + " tem um tipo incompativel com este Text Style.");
      }
      ids[field] = variable.id;
    }
    const requiredFields = ["fontFamily", "fontSize", "fontWeight"];
    if (candidate.rawValue.lineHeight &&
        (candidate.rawValue.lineHeight.unit === "PIXELS" || candidate.rawValue.lineHeight.unit === "PERCENT")) {
      requiredFields.push("lineHeight");
    }
    if (candidate.rawValue.letterSpacing &&
        (candidate.rawValue.letterSpacing.unit === "PIXELS" || candidate.rawValue.letterSpacing.unit === "PERCENT")) {
      requiredFields.push("letterSpacing");
    }
    if (requiredFields.some(field => !ids[field])) {
      throw new Error("Este Text Style precisa de um token para cada propriedade tipografica suportada.");
    }
    candidate.styleVariableIds = ids;
    return;
  }

  if (candidate.category === "other" && candidate.prop === "effect") {
    const effects = [];
    for (const aliases of requirements.effects || []) {
      const fields = {};
      for (const [field, requirement] of Object.entries(aliases || {})) {
        const variable = await resolveStyleVariableRequirement(requirement, context);
        const expectedType = field === "color" ? "COLOR" : "FLOAT";
        if (variable.resolvedType !== expectedType) {
          throw new Error("O token de " + field + " tem um tipo incompativel com este Effect Style.");
        }
        fields[field] = variable.id;
      }
      effects.push(fields);
    }
    candidate.styleVariableIds = effects;
  }
}

async function createSuggestionTokens(plan) {
  const tokenCandidates = Array.isArray(plan) ? plan.filter(candidate => candidate.source === "variable") : (plan.tokens || []);
  const styleCandidates = Array.isArray(plan) ? plan.filter(candidate => candidate.source === "style") : (plan.styles || []);
  const results = [];
  const collectionCache = new Map();
  const variableCache = new Map();
  const variablesByCandidateKey = new Map();
  const availableCandidateKeys = new Set(tokenCandidates.map(candidate => candidate.key));
  const dependencyVariables = new Map();
  const createdVariableIds = new Set();
  const createdStyleIds = new Set();
  const fixes = [];
  const context = { collectionCache, variablesByCandidateKey, availableCandidateKeys, dependencyVariables };

  for (const candidate of tokenCandidates) {
    try {
      if (!candidate.name || !candidate.name.trim()) throw new Error("Digite um nome para o token.");
      let created = null;
      if (candidate.key && variablesByCandidateKey.has(candidate.key)) {
        created = variablesByCandidateKey.get(candidate.key);
      } else if (candidate.existingTokenId) {
        const existing = await getCachedVariable(candidate.existingTokenId, variableCache);
        const expectedType = candidate.variableType || (candidate.category === 'color' ? 'COLOR' : 'FLOAT');
        if (!existing || existing.resolvedType !== expectedType) {
          throw new Error('O token existente não está mais disponível ou tem um tipo incompatível. Atualize a análise.');
        }
        created = {
          token: null,
          fixes: getCandidateFixes(candidate, existing.id),
          tokenKind: candidate.tokenKind || null
        };
      } else {
        if (tokenNameExists(candidate.name.trim(), "variable", candidate.collectionId, candidate.category)) {
          throw new Error("Ja existe uma variavel chamada \"" + candidate.name.trim() + "\".");
        }
        created = await createSuggestionToken(candidate, collectionCache);
        if (created.token && created.token.id) createdVariableIds.add(created.token.id);
      }
      if (candidate.key) variablesByCandidateKey.set(candidate.key, created);
      fixes.push(...(created.fixes || []));
      results.push({ name: candidate.name, success: true, kind: "token", applied: (created.fixes || []).length });
    } catch (error) {
      results.push({ name: candidate && candidate.name || "", success: false, kind: "token", error: error.message });
    }
  }

  for (const candidate of styleCandidates) {
    try {
      if (!candidate.name || !candidate.name.trim()) throw new Error("Digite um nome para o style.");
      await prepareStyleVariableBindings(candidate, context);
      if (tokenNameExists(candidate.name.trim(), "style", candidate.collectionId, candidate.category)) {
        throw new Error("Ja existe um style chamado \"" + candidate.name.trim() + "\".");
      }
      const created = await createSuggestionToken(candidate, collectionCache);
      if (created.token && created.token.id) createdStyleIds.add(created.token.id);
      fixes.push(...(created.fixes || []));
      results.push({ name: candidate.name, success: true, kind: "style", applied: (created.fixes || []).length });
    } catch (error) {
      results.push({ name: candidate && candidate.name || "", success: false, kind: "style", error: error.message });
    }
  }

  const appliedCount = await applyFixes(fixes);
  const tokenCount = createdVariableIds.size + dependencyVariables.size;
  const styleCount = createdStyleIds.size;
  const createdCount = tokenCount + styleCount;
  figma.ui.postMessage({
    type: "create-suggestions-result",
    createdCount,
    tokenCount,
    styleCount,
    appliedCount,
    results
  });
  figma.notify(tokenCount + " token(s) e " + styleCount + " style(s) criados; " + appliedCount + " camada(s) vinculada(s).");
  performAnalysis();
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
                forEachTextStyleRange(node, (start, end) => node.getRangeTextStyleId(start, end), styleId => {
                  if (styleId === id) {
                    found = true;
                    return false;
                  }
                });
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                forEachTextStyleRange(node, (start, end) => node.getRangeFillStyleId(start, end), styleId => {
                  if (styleId === id) {
                    found = true;
                    return false;
                  }
                });
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

    if (msg.type === "create-suggestion-plan") {
      await createSuggestionTokens(msg.plan || {});
    }

    if (msg.type === "create-suggestion-tokens") {
      await createSuggestionTokens(msg.candidates || []);
    }

    if (msg.type === "update-token") {
      const { id, source, name, value, preserveBoundValues } = msg;

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
          if (preserveBoundValues) {
            figma.notify("Style renamed; bound variable values were preserved.");
          } else if (s.type === 'PAINT') {
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
          if (!preserveBoundValues) figma.notify("Estilo atualizado.");
        }
      }
      performAnalysis();
    }

    if (msg.type === "replace-token") {
      const { oldTokenId, source, newTokenId } = msg;
      let replacedCount = 0;

      figma.ui.postMessage({ type: "status", text: "Substituindo tokens no documento..." });

      if (source === 'style') {
        const targetStyle = await figma.getStyleByIdAsync(newTokenId);
        async function walk(node) {
          let changed = false;

          if (node.type === "TEXT") {
            const isTargetStyleText = (oldTokenId === node.textStyleId) || (node.textStyleId === figma.mixed);
            if (isTargetStyleText) {
              await prepareTextNodeForStyleChange(node, newTokenId, targetStyle);
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
                forEachTextStyleRange(node, (start, end) => node.getRangeTextStyleId(start, end), (styleId, start, end) => {
                  if (styleId === oldTokenId) {
                    node.setRangeTextStyleId(start, end, newTokenId);
                    changed = true;
                  }
                });
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                forEachTextStyleRange(node, (start, end) => node.getRangeFillStyleId(start, end), (styleId, start, end) => {
                  if (styleId === oldTokenId) {
                    node.setRangeFillStyleId(start, end, newTokenId);
                    changed = true;
                  }
                });
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
        const duplicateIdSet = new Set(duplicateIds);
        const targetStyle = await figma.getStyleByIdAsync(canonicalId);
        async function walk(node) {
          let changed = false;

          if (node.type === "TEXT") {
            const isTargetStyleText = duplicateIdSet.has(node.textStyleId) || (node.textStyleId === figma.mixed);
            if (isTargetStyleText) {
              await prepareTextNodeForStyleChange(node, canonicalId, targetStyle);
            }
          }

          if ('fillStyleId' in node && duplicateIdSet.has(node.fillStyleId)) {
            node.fillStyleId = canonicalId;
            changed = true;
          }
          if ('strokeStyleId' in node && duplicateIdSet.has(node.strokeStyleId)) {
            node.strokeStyleId = canonicalId;
            changed = true;
          }
          if ('textStyleId' in node && duplicateIdSet.has(node.textStyleId)) {
            node.textStyleId = canonicalId;
            changed = true;
          }
          if ('effectStyleId' in node && duplicateIdSet.has(node.effectStyleId)) {
            node.effectStyleId = canonicalId;
            changed = true;
          }
          if ('gridStyleId' in node && duplicateIdSet.has(node.gridStyleId)) {
            node.gridStyleId = canonicalId;
            changed = true;
          }

          // Mixed styles
          if (node.type === "TEXT") {
            if (node.textStyleId === figma.mixed) {
              try {
                forEachTextStyleRange(node, (start, end) => node.getRangeTextStyleId(start, end), (styleId, start, end) => {
                  if (duplicateIdSet.has(styleId)) {
                    node.setRangeTextStyleId(start, end, canonicalId);
                    changed = true;
                  }
                });
              } catch (e) {}
            }
            if (node.fillStyleId === figma.mixed) {
              try {
                forEachTextStyleRange(node, (start, end) => node.getRangeFillStyleId(start, end), (styleId, start, end) => {
                  if (duplicateIdSet.has(styleId)) {
                    node.setRangeFillStyleId(start, end, canonicalId);
                    changed = true;
                  }
                });
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
          const duplicateIdSet = new Set(duplicateIds);
          function walk(node) {
            let nodeChanged = false;
            duplicateIdSet.forEach(dupId => {
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
      figma.ui.postMessage({ type: "status", text: "Aplicando tokens aos elementos..." });
      const appliedCount = await applyFixes(fixes);

      figma.notify(`${appliedCount} elemento(s) corrigido(s) com sucesso.`);
      performAnalysis();
    }

    if (msg.type === "auto-fix-all") {
      const { fixes } = msg;
      figma.ui.postMessage({ type: "status", text: "Executando Auto Fix em lote..." });
      const appliedCount = await applyFixes(fixes);

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
