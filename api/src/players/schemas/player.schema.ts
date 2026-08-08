import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PlayerDocument = HydratedDocument<Player>;

/// Persistent per-address totals projected from chain events. The contract
/// remains the source of truth; this is a read model for the UI.
@Schema({ timestamps: true, collection: "players" })
export class Player {
  @Prop({ required: true, unique: true, lowercase: true, index: true })
  address!: string;

  @Prop({ default: 0 })
  fragments!: number;

  @Prop({ default: 0 })
  ticketsPurchased!: number;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
