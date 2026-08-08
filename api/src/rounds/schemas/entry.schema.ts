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
}

export const EntrySchema = SchemaFactory.createForClass(Entry);

EntrySchema.index({ roundId: 1, player: 1 }, { unique: true });
EntrySchema.index({ roundId: 1, completedLines: -1 });
