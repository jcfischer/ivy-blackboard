import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";

/**
 * Parse a dependency reference into a bare entity ID.
 * Supports both `entityId` (same-project) and `projectId:entityId` (cross-project).
 * The blackboard uses a global ID namespace so we return the bare ID portion.
 *
 * @example
 * parseDependencyRef("F-001") → "F-001"
 * parseDependencyRef("project-a:F-001") → "F-001"
 */
export function parseDependencyRef(ref: string): string {
  const colonIdx = ref.indexOf(":");
  return colonIdx === -1 ? ref : ref.slice(colonIdx + 1);
}

/**
 * Check whether all dependencies are in a completed state.
 *
 * @param db - Database connection
 * @param entityId - The entity whose dependencies to check (used to skip self-deps)
 * @param dependsOn - Comma-separated dependency references
 * @param table - Table name to query (e.g., 'work_items', 'specflow_features')
 * @param idColumn - Column name for entity IDs (e.g., 'item_id', 'feature_id')
 * @param completionCondition - SQL condition that defines completion (e.g., "status = 'completed'", "phase = 'completed'")
 * @returns true if all dependencies meet the completion condition (or if there are none)
 */
export function checkDependenciesComplete(
  db: Database,
  entityId: string,
  dependsOn: string | null,
  table: string,
  idColumn: string,
  completionCondition: string
): boolean {
  if (!dependsOn) return true;

  const depIds = dependsOn
    .split(",")
    .map(s => parseDependencyRef(s.trim()))
    .filter(id => id && id !== entityId); // drop empty and self-references

  if (depIds.length === 0) return true;

  // Single batched query instead of one per dependency
  const placeholders = depIds.map(() => "?").join(", ");
  const rows = db.query(
    `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} IN (${placeholders}) AND ${completionCondition}`
  ).all(...depIds) as Array<Record<string, string>>;

  return rows.length === depIds.length;
}

/**
 * Validate that all dependency IDs exist in the database.
 *
 * @param db - Database connection
 * @param dependsOn - Comma-separated dependency references
 * @param table - Table name to query
 * @param idColumn - Column name for entity IDs
 * @throws BlackboardError if any dependency is not found
 */
export function validateDependenciesExist(
  db: Database,
  dependsOn: string | null,
  table: string,
  idColumn: string
): void {
  if (!dependsOn) return;

  const depIds = dependsOn
    .split(",")
    .map(s => parseDependencyRef(s.trim()))
    .filter(Boolean);

  // Validate all dependency IDs exist
  for (const depId of depIds) {
    const dep = db.query(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`).get(depId);
    if (!dep) {
      throw new BlackboardError(
        `Dependency not found: ${depId}`,
        "DEPENDENCY_NOT_FOUND"
      );
    }
  }
}

/**
 * Check for circular dependencies (entity depending on itself).
 *
 * @param entityId - The entity ID to check
 * @param dependsOn - Comma-separated dependency references
 * @throws BlackboardError if entity depends on itself
 */
export function checkCircularDependency(
  entityId: string,
  dependsOn: string | null
): void {
  if (!dependsOn) return;

  const depIds = dependsOn
    .split(",")
    .map(s => parseDependencyRef(s.trim()))
    .filter(Boolean);

  if (depIds.includes(entityId)) {
    throw new BlackboardError(
      `Circular dependency detected: ${entityId} cannot depend on itself`,
      "CIRCULAR_DEPENDENCY"
    );
  }
}

/**
 * Unblock entities that depend on the given completed entity, if all their
 * other dependencies are also now completed.
 *
 * @param db - Database connection
 * @param completedEntityId - The ID of the entity that was just completed
 * @param table - Table name to query
 * @param idColumn - Column name for entity IDs
 * @param statusColumn - Column name for status field
 * @param blockedStatus - Status value that indicates blocked
 * @param unblockedStatus - Status value to set when unblocking
 * @param completionCondition - SQL condition that defines completion
 * @param updatedAtColumn - Optional column name for updated_at timestamp
 * @returns Number of entities unblocked
 */
export function unblockDependents(
  db: Database,
  completedEntityId: string,
  table: string,
  idColumn: string,
  statusColumn: string,
  blockedStatus: string,
  unblockedStatus: string,
  completionCondition: string,
  updatedAtColumn?: string
): number {
  // Pre-filter with LIKE to skip blocked entities that couldn't possibly match
  const candidates = db.query(
    `SELECT * FROM ${table} WHERE ${statusColumn} = ? AND depends_on LIKE ?`
  ).all(blockedStatus, `%${completedEntityId}%`) as Array<Record<string, any>>;

  const now = new Date().toISOString();
  let unblocked = 0;

  for (const entity of candidates) {
    const depIds = entity.depends_on
      ?.split(",")
      .map((s: string) => parseDependencyRef(s.trim()))
      .filter(Boolean) ?? [];

    // Only process entities that actually depend on the completed entity
    if (!depIds.includes(completedEntityId)) continue;

    // Check if all dependencies are now complete
    if (checkDependenciesComplete(db, entity[idColumn], entity.depends_on, table, idColumn, completionCondition)) {
      const updateFields = updatedAtColumn
        ? `${statusColumn} = ?, ${updatedAtColumn} = ?`
        : `${statusColumn} = ?`;
      const updateValues = updatedAtColumn
        ? [unblockedStatus, now, entity[idColumn]]
        : [unblockedStatus, entity[idColumn]];

      db.query(
        `UPDATE ${table} SET ${updateFields} WHERE ${idColumn} = ?`
      ).run(...updateValues);
      unblocked++;
    }
  }

  return unblocked;
}
