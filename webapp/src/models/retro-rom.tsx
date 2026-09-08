// RetroRom - the metadata of a rom file the user uploaded (#109).
//
// The file itself lives in MinIO; this holds only its location (objectKey) and display information.
// **Only the uploader can see and run it** - the listing, download and deletion are all narrowed by userEmail.
// Someone else's rom leaking through an address alone would be a copyright problem, so no public URL is made.

import { Schema, model, models, Model, Types } from "mongoose";

/**
 * A patch attached to a rom (#112) - a translation patch and the like.
 *
 * The rom and the patch are kept **separately** and the merged result is never stored. The merging happens in the browser
 * at run time (`public/games/retro/rom-patch.js`). So patches can be swapped over one original.
 *
 * The same embedded-array approach as `Post.attachments` (`models/post.tsx`).
 */
export interface RetroPatchDoc {
  _id: Types.ObjectId;
  /** The display name - the extension is kept so the format is visible. */
  name: string;
  /** ips | bps | ups - decided by the magic bytes at upload time and fixed. */
  format: string;
  size: number;
  objectKey: string;
  /** The file content's sha256 (#188). Old documents lack it - a backfill script fills it in. */
  sha256?: string;
  isDeleted?: boolean;
  createdAt: Date;
}

const RetroPatchSchema = new Schema<RetroPatchDoc>(
  {
    name: { type: String, required: true },
    format: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    // The basis for separating netplay rooms (#188). Someone with the patch on joining the room of someone with it off
    // desyncs quietly, so the patch's content has to go into the room number too.
    sha256: { type: String, default: '' },
    // The same principle as the rom - it is not removed from the array; only a flag is set.
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export interface RetroRomDoc {
  _id: Types.ObjectId;
  /** The owner - every query is narrowed by this value. */
  userEmail: string;
  title: string;
  /** The PlatformId (`src/lib/retro/platforms.ts`). Kept as a string so adding a system needs no migration. */
  platform: string;
  /** The EmulatorJS core name - decided from the system at upload time and fixed. */
  core: string;
  /** The original filename at upload (for display and download). */
  filename: string;
  size: number;
  /** The MinIO object key. */
  objectKey: string;
  /** The file content's sha256 (#188). Old documents lack it - a backfill script fills it in. */
  sha256?: string;
  /**
   * The patches attached to this rom (#112). It is an array, but **at most one entry is ever live** (#116) -
   * uploading a new one soft-deletes the previous and replaces it. That is so a single checkbox on the card can handle it.
   * The schema is an array to keep the door open to going back to several later.
   */
  patches: RetroPatchDoc[];
  /** Whether to actually apply the patch (#116). The card's checkbox flips this. */
  patchEnabled?: boolean;
  /** A cover the user uploaded for the card (#122). Without it the card draws a tile of the title's first character. */
  coverKey?: string;
  coverFormat?: string;
  /**
   * The parent rom sets to place alongside the core (#143) - split arcade sets.
   * Held **most generic first**. At run time they are stacked in this order and the main file (the clone) wins last.
   */
  parentSets: { name: string; size: number; objectKey: string; sha256?: string }[];
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RetroRomSchema = new Schema<RetroRomDoc>(
  {
    userEmail: { type: String, required: true, index: true },
    title: { type: String, required: true },
    platform: { type: String, required: true },
    core: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    // The basis for separating netplay rooms (#188) - differing rom bytes break the lockstep synchronisation.
    sha256: { type: String, default: '' },
    patches: { type: [RetroPatchSchema], default: [] },
    // Uploading it means intending to use it, so it is on by default.
    patchEnabled: { type: Boolean, default: true },
    coverKey: { type: String },
    coverFormat: { type: String },
    parentSets: {
      // A parent set is bytes the core reads too, so its sha256 is kept alongside (#188).
      type: [new Schema({ name: String, size: Number, objectKey: String, sha256: String }, { _id: false })],
      default: [],
    },
    // Deletion is always soft - a rom deleted by mistake must be recoverable. The MinIO object is kept too.
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// The compound index the listing query (my roms, not deleted, newest first) rides in one go.
RetroRomSchema.index({ userEmail: 1, isDeleted: 1, createdAt: -1 });

const RetroRom = (models.RetroRom as Model<RetroRomDoc>) || model<RetroRomDoc>("RetroRom", RetroRomSchema);

export default RetroRom;
