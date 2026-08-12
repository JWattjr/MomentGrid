import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type EntryDocument = HydratedDocument<Entry>;

/// One player's participation in one round, populated by the chain indexer.
/// Scoring fields stay null until `PlayerScored` is observed, so a row's
/// presence means "submitted" and a non-null `completedLines` means "settled".
@Schema({ timestamps: true, collection: "entries" })
export class Entry {
  @Prop({ required: true, index: true })
  roundId!: string;

  @Prop({ required: true, lowercase: true, index: true })
  player!: string;

  @Prop({ type: String, default: null })
  gridHandle!: string | null;

  @Prop({ type: String, default: null })
  submitTxHash!: string | null;

  @Prop({ type: Number, default: null })
  markedMask!: number | null;

  @Prop({ type: Number, default: null })
  completedLines!: number | null;

  @Prop({ type: Boolean, default: null })
  eligible!: boolean | null;

  /// What this round paid the player, in the entry token's base units, stored
  /// as a decimal string because the values are bigints. Null until the round
  /// settles; "0" means settled and won nothing, which is a different fact.
  @Prop({ type: String, default: null })
  payoutAmount!: string | null;

  /// True when the payout was a returned stake rather than a share of the pot,
  /// which happens when no grid in the round qualified.
  @Prop({ type: Boolean, default: null })
  refunded!: boolean | null;
}

export const EntrySchema = SchemaFactory.createForClass(Entry);

EntrySchema.index({ roundId: 1, player: 1 }, { unique: true });
EntrySchema.index({ roundId: 1, completedLines: -1 });
