-- =============================================
-- evacuation_facilities
-- =============================================
CREATE TABLE IF NOT EXISTS evacuation_facilities (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  subtitle         TEXT,
  description      TEXT,
  address          TEXT,
  status           TEXT NOT NULL DEFAULT 'unknown',
  municipality_code TEXT,
  pref_code        TEXT,
  region_id        TEXT,
  lod_rank         INTEGER,
  lat              DOUBLE PRECISION NOT NULL,
  lon              DOUBLE PRECISION NOT NULL,
  capacity         INTEGER,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- team_activities
-- =============================================
CREATE TABLE IF NOT EXISTS team_activities (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  team_id           TEXT,
  activity_type     TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  lat               DOUBLE PRECISION NOT NULL,
  lon               DOUBLE PRECISION NOT NULL,
  municipality_code TEXT,
  area              TEXT,
  operator          TEXT,
  note              TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- areas (市区町村マスタ)
-- =============================================
CREATE TABLE IF NOT EXISTS areas (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  pref_code  TEXT,
  region_id  TEXT,
  enabled    BOOLEAN NOT NULL DEFAULT true
);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE evacuation_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas                  ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザー（管理者）だけ全操作を許可
-- service_role key は RLS をバイパスするのでスクリプトはそのまま動く
CREATE POLICY "authenticated users can do all" ON evacuation_facilities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can do all" ON team_activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can do all" ON areas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER evacuation_facilities_updated_at
  BEFORE UPDATE ON evacuation_facilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER team_activities_updated_at
  BEFORE UPDATE ON team_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
