import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type SettlementJobDocument = HydratedDocument<SettlementJob>;

export type SettlementStatus = "running" | "complete" | "failed";

/// Replaces the in-process boolean the old Next.js route used as a lock.
///
/// The unique index on `roundId` is the lock: two concurrent settlement
/// requests race to insert the same document and exactly one wins, no matter
/// how many API instances are running.
@Schema({ timestamps: true, collection: "settlement_jobs" })
export class SettlementJob {
  @Prop({ required: true, unique: true, index: true })
  roundId!: string;

  @Prop({ type: String, required: true, enum: ["running", "complete", "failed"], default: "running" })
  status!: SettlementStatus;

  @Prop({ type: [String], default: [] })
  eventsByWindow!: string[];

  @Prop({ type: [String], default: [] })
  transactions!: string[];

  @Prop({ type: [String], default: [] })
  players!: string[];

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ type: Date, default: null })
  finishedAt!: Date | null;
}

export const SettlementJobSchema = SchemaFactory.createForClass(SettlementJob);
