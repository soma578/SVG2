/**
 * 停電情報マッピングユーティリティ
 *
 * 停電情報の地区名を正規化し、辞書で引いて対応するSVG pathのIDを取得する
 */

// 辞書の型定義
export interface DistrictDictEntry {
  key_code: string;
  svg_path_id: string;
  pref: string;
  city: string;
  ward: string;
  district: string;
  district_norm: string;
  centroid_lon: number;
  centroid_lat: number;
}

export interface MunicipalityDictEntry {
  n03_code: string;
  svg_path_id: string;
  pref: string;
  city: string;
  aliases: string[];
}

export type DistrictDict = Record<string, DistrictDictEntry>;
export type MunicipalityDict = Record<string, MunicipalityDictEntry>;

// 停電情報の型
export interface OutageInfo {
  prefecture: string;  // 都道府県名
  city?: string;       // 市区町村名
  ward?: string;       // 区名
  district?: string;   // 地区名
  households?: number; // 停電戸数
  timestamp?: string;  // 情報取得時刻
  cause?: string;      // 停電原因
  status?: 'ongoing' | 'recovered';  // 停電状態
  recovered_at?: string;  // 復旧時刻
}

// マッピング結果
export interface OutageMapping {
  outageInfo: OutageInfo;
  svgPathId: string | null;
  matchLevel: 'district' | 'municipality' | 'none';
  normalizedKey: string;
}

/**
 * 漢数字を数字に変換
 */
function kanjiToNumber(text: string): string {
  const kanjiMap: Record<string, string> = {
    '〇': '0', '零': '0',
    '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
    '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
  };

  let result = text;
  for (const [kanji, num] of Object.entries(kanjiMap)) {
    result = result.replace(new RegExp(kanji, 'g'), num);
  }
  return result;
}

/**
 * テキストを正規化（全角→半角、漢数字→数字、空白除去）
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  let normalized = text.trim();

  // 漢数字を数字に変換
  normalized = kanjiToNumber(normalized);

  // 全角数字を半角に変換
  normalized = normalized.replace(/[０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );

  // 全角アルファベットを半角に変換
  normalized = normalized.replace(/[Ａ-Ｚａ-ｚ]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );

  // 空白を削除
  normalized = normalized.replace(/\s+/g, '');

  return normalized;
}

/**
 * 停電情報から正規化キーを生成
 */
export function buildNormalizedKey(info: OutageInfo): string {
  const parts = [
    normalizeText(info.prefecture)
  ];

  if (info.city) {
    parts.push(normalizeText(info.city));
  }

  if (info.ward) {
    parts.push(normalizeText(info.ward));
  }

  if (info.district) {
    parts.push(normalizeText(info.district));
  }

  return parts.join('|');
}

/**
 * 地区名のバリエーションを生成（順に試す）
 */
function generateDistrictVariants(district: string): string[] {
  const normalized = normalizeText(district);
  const variants: string[] = [normalized];

  // 除去パターンを順に適用
  const patterns = [
    { regex: /(\d+)番地(\d+)号?$/, desc: '番地号' }, // 1番地2号 → 除去
    { regex: /(\d+)番地$/, desc: '番地' }, // 1番地 → 除去
    { regex: /(\d+)番(\d+)号?$/, desc: '番号' }, // 1番2号 → 除去
    { regex: /(\d+)番$/, desc: '番' }, // 1番 → 除去
    { regex: /(\d+)号$/, desc: '号' }, // 1号 → 除去
  ];

  let current = normalized;
  for (const { regex } of patterns) {
    if (regex.test(current)) {
      current = current.replace(regex, '');
      if (current && !variants.includes(current)) {
        variants.push(current);
      }
    }
  }

  // "の" を除去するバリエーション（例: 京山の1丁目 → 京山1丁目）
  const withoutNo = normalized.replace(/の/g, '');
  if (withoutNo !== normalized && !variants.includes(withoutNo)) {
    variants.push(withoutNo);
  }

  return variants;
}

/**
 * 地区名の部分マッチングを試みる（複数のバリエーションを試す）
 */
function tryPartialDistrictMatch(
  outageInfo: OutageInfo,
  districtDict: DistrictDict
): DistrictDictEntry | null {
  if (!outageInfo.district) return null;

  const variants = generateDistrictVariants(outageInfo.district);

  // バリエーションを順に試す（最初の一致を返す）
  for (let i = 1; i < variants.length; i++) {
    const variant = variants[i];

    const variantKey = buildNormalizedKey({
      prefecture: outageInfo.prefecture,
      city: outageInfo.city,
      ward: outageInfo.ward,
      district: variant
    });

    const entry = districtDict[variantKey];
    if (entry) {
      console.log(`[PartialMatch] "${outageInfo.district}" → "${variant}" matched (variant ${i})`);
      return entry;
    }
  }

  // すべてのバリエーションを試したが一致しない
  if (variants.length > 1) {
    console.log(`[PartialMatch] Tried ${variants.length} variants for "${outageInfo.district}":`, variants);
  }

  return null;
}

/**
 * 停電情報を辞書でマッピングしてSVG pathのIDを取得
 */
export function mapOutageToSvgPath(
  outageInfo: OutageInfo,
  districtDict: DistrictDict,
  municipalityDict: MunicipalityDict
): OutageMapping {
  // 戦略1: 完全一致の地区レベルマッチング
  if (outageInfo.district) {
    const districtKey = buildNormalizedKey(outageInfo);
    const districtEntry = districtDict[districtKey];

    if (districtEntry) {
      console.log(`[ExactMatch] District "${outageInfo.district}" matched`);
      return {
        outageInfo,
        svgPathId: districtEntry.svg_path_id,
        matchLevel: 'district',
        normalizedKey: districtKey
      };
    }

    // 戦略2: 部分一致（番地・番・号を除去）
    const partialEntry = tryPartialDistrictMatch(outageInfo, districtDict);
    if (partialEntry) {
      return {
        outageInfo,
        svgPathId: partialEntry.svg_path_id,
        matchLevel: 'district',
        normalizedKey: districtKey + ' (partial)'
      };
    }

    // ログ: 地区名でマッチしなかった場合
    console.warn(`[NoDistrictMatch] "${outageInfo.district}" (key: ${districtKey})`);
  }

  // 戦略3: 市区町村レベルでフォールバック
  const municipalityKey = buildNormalizedKey({
    prefecture: outageInfo.prefecture,
    city: outageInfo.city,
    ward: outageInfo.ward
  });

  const municipalityEntry = municipalityDict[municipalityKey];

  if (municipalityEntry) {
    console.log(`[MunicipalityMatch] "${outageInfo.city}${outageInfo.ward || ''}" matched`);
    return {
      outageInfo,
      svgPathId: municipalityEntry.svg_path_id,
      matchLevel: 'municipality',
      normalizedKey: municipalityKey
    };
  }

  // 完全にマッチしない場合
  console.warn(`[NoMatch] No match found for:`, {
    prefecture: outageInfo.prefecture,
    city: outageInfo.city,
    ward: outageInfo.ward,
    district: outageInfo.district,
    districtKey: outageInfo.district ? buildNormalizedKey(outageInfo) : 'N/A',
    municipalityKey
  });

  return {
    outageInfo,
    svgPathId: null,
    matchLevel: 'none',
    normalizedKey: municipalityKey
  };
}

/**
 * 複数の停電情報をバッチ処理
 */
export function mapOutages(
  outages: OutageInfo[],
  districtDict: DistrictDict,
  municipalityDict: MunicipalityDict
): OutageMapping[] {
  return outages.map(outage =>
    mapOutageToSvgPath(outage, districtDict, municipalityDict)
  );
}

/**
 * SVG pathのclassを更新
 */
export function updateSvgPathClass(
  pathId: string,
  addClass: boolean = true,
  className: string = 'outage'
): boolean {
  const pathElement = document.getElementById(pathId);

  if (!pathElement) {
    console.warn(`SVG path with id "${pathId}" not found`);
    return false;
  }

  if (addClass) {
    pathElement.classList.add(className);
  } else {
    pathElement.classList.remove(className);
  }

  return true;
}

/**
 * 複数のpathのclassを一括更新
 */
export function updateMultipleSvgPaths(
  pathIds: string[],
  addClass: boolean = true,
  className: string = 'outage'
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const pathId of pathIds) {
    if (updateSvgPathClass(pathId, addClass, className)) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * 停電情報を地図に反映
 */
export function applyOutagesToMap(
  outages: OutageInfo[],
  districtDict: DistrictDict,
  municipalityDict: MunicipalityDict,
  clearExisting: boolean = true,
  enableDiagnostics: boolean = false
): {
  mappings: OutageMapping[];
  stats: {
    total: number;
    matched: number;
    districtLevel: number;
    municipalityLevel: number;
    notMatched: number;
    applied: number;
    failed: number;
  };
} {
  console.log(`[OutageMapper] Processing ${outages.length} outages...`);

  // 既存の停電表示をクリア
  if (clearExisting) {
    const existingOutages = document.querySelectorAll('.outage');
    existingOutages.forEach(el => el.classList.remove('outage'));
  }

  // マッピング
  const mappings = mapOutages(outages, districtDict, municipalityDict);

  // 統計情報
  const stats = {
    total: mappings.length,
    matched: 0,
    districtLevel: 0,
    municipalityLevel: 0,
    notMatched: 0,
    applied: 0,
    failed: 0
  };

  // SVGに反映
  for (const mapping of mappings) {
    if (mapping.svgPathId) {
      stats.matched++;

      if (mapping.matchLevel === 'district') {
        stats.districtLevel++;
      } else if (mapping.matchLevel === 'municipality') {
        stats.municipalityLevel++;
      }

      if (updateSvgPathClass(mapping.svgPathId, true, 'outage')) {
        stats.applied++;
      } else {
        stats.failed++;
      }
    } else {
      stats.notMatched++;
    }
  }

  // 診断レポート（オプション）
  if (enableDiagnostics) {
    const report = generateMatchingReport(mappings);
    console.log('[OutageMapper] Diagnostic Report:', report);
  }

  // サマリーログ
  console.log(`[OutageMapper] Results: ${stats.matched}/${stats.total} matched (${stats.districtLevel} district, ${stats.municipalityLevel} municipality), ${stats.notMatched} unmatched`);

  return { mappings, stats };
}

/**
 * 停電情報をパース（様々な形式に対応）
 */
export function parseOutageData(data: any): OutageInfo[] {
  // データが配列でない場合
  if (!Array.isArray(data)) {
    console.error('Outage data is not an array');
    return [];
  }

  return data.map(item => {
    // 様々なフィールド名に対応
    const outageInfo: OutageInfo = {
      prefecture: item.prefecture || item.pref || item.都道府県 || '岡山県',
      city: item.city || item.市区町村 || item.市,
      ward: item.ward || item.区 || item.行政区,
      district: item.district || item.地区 || item.町丁,
      households: item.households || item.戸数 || item.停電戸数,
      timestamp: item.timestamp || item.時刻 || new Date().toISOString()
    };

    return outageInfo;
  });
}

/**
 * マッチング診断レポートを生成（デバッグ用）
 */
export function generateMatchingReport(
  mappings: OutageMapping[]
): {
  summary: {
    total: number;
    exactMatch: number;
    partialMatch: number;
    municipalityMatch: number;
    noMatch: number;
  };
  unmatchedDistricts: Array<{
    district: string;
    city: string;
    ward?: string;
    normalizedKey: string;
    variants: string[];
  }>;
} {
  const summary = {
    total: mappings.length,
    exactMatch: 0,
    partialMatch: 0,
    municipalityMatch: 0,
    noMatch: 0
  };

  const unmatchedDistricts: Array<{
    district: string;
    city: string;
    ward?: string;
    normalizedKey: string;
    variants: string[];
  }> = [];

  for (const mapping of mappings) {
    if (mapping.matchLevel === 'district') {
      if (mapping.normalizedKey.includes('(partial)')) {
        summary.partialMatch++;
      } else {
        summary.exactMatch++;
      }
    } else if (mapping.matchLevel === 'municipality') {
      summary.municipalityMatch++;
    } else {
      summary.noMatch++;

      if (mapping.outageInfo.district) {
        unmatchedDistricts.push({
          district: mapping.outageInfo.district,
          city: mapping.outageInfo.city || '',
          ward: mapping.outageInfo.ward,
          normalizedKey: mapping.normalizedKey,
          variants: generateDistrictVariants(mapping.outageInfo.district)
        });
      }
    }
  }

  return { summary, unmatchedDistricts };
}
