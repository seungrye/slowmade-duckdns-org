import mongoose, { model, models } from 'mongoose';

/**
 * painter-bot's daily limit counter for Pollinations.AI image generation.
 * _id: 'YYYY-MM-DD' (UTC) - one document per date
 * count: that day's generations
 *
 * Kept in its own collection, separate from enji-bot's EnjiImageQuota.
 */
const PainterImageQuotaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // YYYY-MM-DD
    count: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
);

export default models.PainterImageQuota ||
  model('PainterImageQuota', PainterImageQuotaSchema);
