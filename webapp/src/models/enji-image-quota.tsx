import mongoose, { model, models } from 'mongoose';

/**
 * Pollinations.AI 이미지 생성 일일 한도 카운터.
 * _id: 'YYYY-MM-DD' (UTC) — 날짜별 한 문서
 * count: 그 날 생성 횟수
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
