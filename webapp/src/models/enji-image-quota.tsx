import mongoose, { model, models } from 'mongoose';

/**
 * The daily limit counter for Pollinations.AI image generation.
 * _id: 'YYYY-MM-DD' (UTC) - one document per date
 * count: that day's generations
 */
const EnjiImageQuotaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // YYYY-MM-DD
    count: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
);

export default models.EnjiImageQuota ||
  model('EnjiImageQuota', EnjiImageQuotaSchema);
