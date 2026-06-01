import { query } from '../db/pool';

export interface CustomMissionRow {
  id: string;
  parent_id: string;
  title: string;
  description: string;
  points: number;
  is_active: boolean;
  created_at: string;
}

export interface CustomMissionCandidate {
  id: string;
  title: string;
  description: string;
  points: number;
}

export async function getActiveCustomMissions(
  parentId: string,
): Promise<CustomMissionCandidate[]> {
  const { rows } = await query<CustomMissionRow>(
    `SELECT id, title, description, points
     FROM custom_missions
     WHERE parent_id = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [parentId],
  );
  return rows;
}

export async function listCustomMissions(
  parentId: string,
): Promise<CustomMissionRow[]> {
  const { rows } = await query<CustomMissionRow>(
    `SELECT id, parent_id, title, description, points, is_active, created_at
     FROM custom_missions
     WHERE parent_id = $1
     ORDER BY created_at DESC`,
    [parentId],
  );
  return rows;
}

export async function createCustomMission(
  parentId: string,
  title: string,
  description: string,
  points: number,
): Promise<CustomMissionRow> {
  const { rows } = await query<CustomMissionRow>(
    `INSERT INTO custom_missions (parent_id, title, description, points)
     VALUES ($1, $2, $3, $4)
     RETURNING id, parent_id, title, description, points, is_active, created_at`,
    [parentId, title, description, points],
  );
  return rows[0];
}

export async function updateCustomMission(
  id: string,
  parentId: string,
  title: string,
  description: string,
  points: number,
): Promise<CustomMissionRow | null> {
  const { rows } = await query<CustomMissionRow>(
    `UPDATE custom_missions
     SET title = $1, description = $2, points = $3
     WHERE id = $4 AND parent_id = $5
     RETURNING id, parent_id, title, description, points, is_active, created_at`,
    [title, description, points, id, parentId],
  );
  return rows[0] ?? null;
}

export async function deleteCustomMission(
  id: string,
  parentId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM custom_missions WHERE id = $1 AND parent_id = $2`,
    [id, parentId],
  );
  return (rowCount ?? 0) > 0;
}
