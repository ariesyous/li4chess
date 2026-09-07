import { bounded } from "@li4chess/persistence";

/** Internal storage port. Every write includes the alarm in the same SQLite
 * transaction, eliminating a crash window between durable intent and wakeup. */
export interface RoomStorage {
  read<T>(key: string): T | null;
  write(values: Record<string, unknown | null>, alarmAt: number | null): Promise<void>;
}
export class SQLiteRoomStorage implements RoomStorage {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec("CREATE TABLE IF NOT EXISTS room_records (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT");
  }
  read<T>(key: string): T | null {
    const rows = this.storage.sql.exec<{ value: string }>("SELECT value FROM room_records WHERE key = ?", key).toArray();
    return rows.length ? JSON.parse(rows[0].value) as T : null;
  }
  async write(values: Record<string, unknown | null>, alarmAt: number | null): Promise<void> {
    // Encode before entering the transaction. No network I/O or callbacks inside.
    const encoded = Object.entries(values).map(([key, value]) => [key, value === null ? null : bounded(value, 1_100_000)] as const);
    await this.storage.transaction(async () => {
      for (const [key, value] of encoded) {
        if (value === null) this.storage.sql.exec("DELETE FROM room_records WHERE key = ?", key);
        else this.storage.sql.exec("INSERT INTO room_records VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
      }
      if (alarmAt === null) await this.storage.deleteAlarm();
      else await this.storage.setAlarm(alarmAt);
    });
    await this.storage.sync();
  }
}
