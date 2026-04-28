import mongoose from "mongoose";
import { env } from "./env";

const MONGO_URI = env.mongoUri;

export const connectToDB = async () => {
  // console.log("Connecting to MongoDB... readyState:", mongoose.connection.readyState);

  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
};
