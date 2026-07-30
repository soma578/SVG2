import {
  createLayerHealthDetail,
  healthDescription,
  layerHealthStatus,
} from './layerHealth.js';

export const layerKind = (layer) => {
  if (layer.kind) return layer.kind;
  if (layer.imported) return 'external';
  if (String(layer.className || '').includes('poi')) return 'poi';
  return 'vector';
};

export const layerSymbol = (layer) => (
  layer.symbol || (layerKind(layer) === 'external' ? '外' : '層')
);

export const layerGroup = (layer) => {
  if (layer.group) return layer.group;
  if (layer.imported) return 'インポート';
  return layerKind(layer) === 'external' ? '外部データ' : '地図レイヤー';
};

export const layerAccent = (layer) => {
  if (/^#[0-9a-f]{6}$/i.test(layer.accent || '')) return layer.accent;
  return layerKind(layer) === 'external' ? '#8A5B25' : '#43565C';
};

export const createLayerPanel = ({
  elements,
  getLayers,
  getPresets,
  onToggle,
  onRemove,
  onPreset,
  onOpenController,
  locationRef = location,
  documentRef = document,
}) => {
  const updateCount = () => {
    // 件数も一覧に出しているものだけで数える（表示と数が食い違わないように）。
    const layers = listedLayers();
    const visible = layers.filter((layer) => layer.visible).length;
    elements.layerCount.textContent = `${visible} / ${layers.length}`;
  };

  const renderPresets = () => {
    elements.layerPresets.replaceChildren();
    const availableLayerIds = new Set(getLayers().map((layer) => layer.id));
    const presets = getPresets().filter((preset) => (
      Array.isArray(preset.layers) && preset.layers.some((id) => availableLayerIds.has(id))
    ));
    elements.layerPresets.hidden = presets.length === 0;
    for (const preset of presets) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'layer-preset-button';
      const label = documentRef.createElement('span');
      label.textContent = preset.label;
      const description = documentRef.createElement('small');
      description.textContent = preset.description || '';
      button.append(label, description);
      button.addEventListener('click', () => onPreset(preset));
      elements.layerPresets.append(button);
    }
  };

  // 他レイヤーの mount として一緒に切り替わるだけのものは一覧に出さない。
  // 出すと「チーム活動ピン」と「チーム活動エリア」のように、利用者から見て
  // 1つの情報が2つのトグルに割れて見える。
  const listedLayers = () => getLayers().filter((layer) => layer.userToggle !== false);

  const renderLayers = () => {
    elements.layerList.replaceChildren();
    let previousGroup = '';
    for (const layer of listedLayers()) {
      const group = layerGroup(layer);
      if (group !== previousGroup) {
        const heading = documentRef.createElement('li');
        heading.className = 'layer-group-label';
        heading.textContent = group;
        elements.layerList.append(heading);
        previousGroup = group;
      }

      const row = documentRef.createElement('li');
      row.className = 'layer-row';
      row.dataset.kind = layerKind(layer);
      row.dataset.layer = layer.id;
      row.style.setProperty('--layer-accent', layerAccent(layer));

      const symbol = documentRef.createElement('span');
      symbol.className = 'layer-symbol';
      if (layer.icon) {
        const image = documentRef.createElement('img');
        image.src = layer.icon;
        image.alt = '';
        symbol.append(image);
      } else {
        symbol.textContent = layerSymbol(layer);
      }
      symbol.setAttribute('aria-hidden', 'true');

      const copy = documentRef.createElement('span');
      copy.className = 'layer-copy';
      const title = documentRef.createElement('strong');
      title.textContent = layer.title.replace(/^L\d+\s*/, '');
      const meta = documentRef.createElement('span');
      meta.className = 'layer-meta';
      const metaText = documentRef.createElement('span');
      metaText.className = 'layer-meta-text';
      metaText.textContent = layer.note || (layerKind(layer) === 'external'
        ? layer.imported ? 'インポート' : '外部データ'
        : layerKind(layer) === 'poi'
          ? '地点情報'
          : '地図表示');
      metaText.title = metaText.textContent;
      meta.append(metaText);

      let healthDetail = null;
      if (layer.health) {
        const health = documentRef.createElement('button');
        health.type = 'button';
        const display = layerHealthStatus(layer.healthData);
        health.className = 'layer-health';
        health.dataset.status = display.status;
        health.textContent = display.label;
        health.title = healthDescription(layer.healthData, display);
        health.setAttribute('aria-label', health.title);
        health.setAttribute('aria-expanded', 'false');
        healthDetail = createLayerHealthDetail(layer, display, documentRef);
        health.addEventListener('click', () => {
          const expanded = health.getAttribute('aria-expanded') === 'true';
          health.setAttribute('aria-expanded', String(!expanded));
          healthDetail.hidden = expanded;
        });
        meta.append(health);
      }
      copy.append(title, meta);

      const toggle = documentRef.createElement('label');
      toggle.className = 'switch';
      const input = documentRef.createElement('input');
      input.type = 'checkbox';
      input.checked = layer.visible;
      input.setAttribute('aria-label', `${layer.title}を表示`);
      input.addEventListener('change', () => onToggle(layer.id, input.checked));
      const track = documentRef.createElement('span');
      toggle.append(input, track);

      const controls = documentRef.createElement('span');
      controls.className = 'layer-controls';
      if (layer.manage?.href) {
        const manage = documentRef.createElement('a');
        manage.className = 'layer-manage';
        const manageUrl = new URL(layer.manage.href, locationRef.href);
        manageUrl.searchParams.set('return', `${locationRef.pathname}${locationRef.search}`);
        manage.href = manageUrl.href;
        manage.textContent = layer.manage.label || '管理';
        manage.setAttribute('aria-label', `${layer.title}を管理`);
        controls.append(manage);
      }
      if (layer.controllerUi) {
        const settings = documentRef.createElement('button');
        settings.type = 'button';
        settings.className = 'layer-manage';
        settings.textContent = layer.controllerUi.label || '設定';
        settings.setAttribute('aria-label', `${layer.title}の種類を設定`);
        settings.addEventListener('click', () => onOpenController(layer));
        controls.append(settings);
      }
      controls.append(toggle);
      if (layer.imported) {
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'layer-remove';
        remove.textContent = '×';
        remove.title = `${layer.title}を削除`;
        remove.setAttribute('aria-label', remove.title);
        remove.addEventListener('click', () => onRemove(layer.id));
        controls.append(remove);
      }

      row.append(symbol, copy, controls);
      if (healthDetail) row.append(healthDetail);
      elements.layerList.append(row);
    }
    updateCount();
  };

  return { renderLayers, renderPresets, updateCount };
};
