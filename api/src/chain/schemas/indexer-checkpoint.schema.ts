import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type IndexerCheckpointDocument = HydratedDocument<IndexerCheckpoint>;

/// How far the indexer has read.
///
/// Persisting this is what lets the API resume after a restart instead of
/// silently losing every event that happened while it was down — which is what
/// a filter-based subscription does.
@Schema({ timestamps: true, collection: "indexer_checkpoints" })
export class IndexerCheckpoint {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: Number, required: true })
  lastBlock!: number;
}

export const IndexerCheckpointSchema = SchemaFactory.createForClass(IndexerCheckpoint);
