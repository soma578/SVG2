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
}

// マッピング結果
export interface OutageMapping {
  outageInfo: OutageInfo;
  svgPathId: string | null;
  matchLevel: 'district' | 'municipality' | 'none';
  normalizedKey: string;
}

/**
 * テキストを正規化（全角→半角、空白除去）
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  let normalized = text.trim();

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
 * 停電情報を辞書でマッピングしてSVG pathのIDを取得
 */
export function mapOutageToSvgPath(
  outageInfo: OutageInfo,
  districtDict: DistrictDict,
  municipalityDict: MunicipalityDict
): OutageMapping {
  // まず地区レベルでマッチング
  if (outageInfo.district) {
    const districtKey = buildNormalizedKey(outageInfo);
    const districtEntry = districtDict[districtKey];

    if (districtEntry) {
      return {
        outageInfo,
        svgPathId: districtEntry.svg_path_id,
        matchLevel: 'district',
        normalizedKey: districtKey
      };
    }
  }

  // 地区でマッチしない場合は市区町村レベルでフォールバック
  const municipalityKey = buildNormalizedKey({
    prefecture: outageInfo.prefecture,
    city: outageInfo.city,
    ward: outageInfo.ward
  });

  const municipalityEntry = municipalityDict[municipalityKey];

  if (municipalityEntry) {
    return {
      outageInfo,
      svgPathId: municipalityEntry.svg_path_id,
      matchLevel: 'municipality',
      normalizedKey: municipalityKey
    };
  }

  // マッチしない場合
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
  clearExisting: boolean = true
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
      console.warn('Outage not matched:', mapping.outageInfo);
    }
  }

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
