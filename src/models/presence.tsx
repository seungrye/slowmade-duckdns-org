import { InferSchemaType, Schema, model, models, Model } from 'mongoose';

const PresenceSchema = new Schema(
  {
    event: { type: String, enum: ['enter', 'exit'], required: true },
    ssid: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type PresenceType = InferSchemaType<typeof PresenceSchema>;

const Presence: Model<PresenceType> =
  models.Presence || model<PresenceType>('Presence', PresenceSchema);

export default Presence;
