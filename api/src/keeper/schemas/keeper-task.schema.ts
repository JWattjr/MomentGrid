import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type KeeperTaskDocument = HydratedDocument<KeeperTask>;

export type KeeperTaskStatus = "running" | "complete" | "failed";

/// One-shot keeper actions that are not settlements.
///
/// Same shape and same trick as `SettlementJob`: the unique index on `key` is
/// the lock, so two API instances cannot both spend gas trying to lock the same
/// round. `key` is namespaced by action — `lock:7` — because a round may
/// eventually need more than one.
@Schema({ timestamps: true, collection: "keeper_tasks" })
export class KeeperTask {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: String, required: true, enum: ["running", "complete", "failed"], default: "running" })
  status!: KeeperTaskStatus;

  @Prop({ type: String, default: null })
  txHash!: string | null;

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  finishedAt!: Date | null;
}

export const KeeperTaskSchema = SchemaFactory.createForClass(KeeperTask);
