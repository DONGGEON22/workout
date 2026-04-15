-- =============================================
-- Workout App — Supabase PostgreSQL Schema
-- Supabase SQL Editor에서 전체 실행하세요
-- =============================================

-- 회원
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 운동 완료 기록
CREATE TABLE IF NOT EXISTS workout_completions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, week_start, day_index)
);

CREATE INDEX IF NOT EXISTS idx_workout_completions_week
  ON workout_completions (week_start);

-- 주간 스냅샷 (커피 정산용)
CREATE TABLE IF NOT EXISTS weekly_snapshots (
  week_start TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  completion_count INTEGER NOT NULL,
  met_goal BOOLEAN NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, member_id)
);

-- 푸시 알림 구독
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 리액션
CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  from_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_member_id, to_member_id, week_start, emoji)
);

-- 운동 횟수 양도 이력
CREATE TABLE IF NOT EXISTS workout_transfers (
  id TEXT PRIMARY KEY,
  from_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_transfers_week
  ON workout_transfers (week_start);

-- =============================================
-- Storage: Supabase 대시보드에서 직접 생성
-- Storage > New Bucket > 이름: workout-photos > Public ON
-- =============================================
